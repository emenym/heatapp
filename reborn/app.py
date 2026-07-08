import datetime
import json
import time

from flask import Flask, jsonify, request
from flask_sock import Sock
import graphene
from simple_websocket import ConnectionClosed

from reborn.config import DB_PATH, PORT, ZONE_SEED_PATH
from reborn.db import RebornRepository
from reborn.poller import sample_zone_states

app = Flask(__name__)
sock = Sock(app)
repo = RebornRepository(DB_PATH)


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return response


def _zone_payload():
    states = repo.list_zone_states()
    total = repo.total_runtime_seconds()
    day = repo.day_runtime_seconds()
    items = []
    for row in states:
        zone_key = row["zone_key"]
        items.append(
            {
                "zone_key": zone_key,
                "zone_name": row["zone_name"],
                "port": row["port"],
                "bit": row["bit"],
                "state": row["state"],
                "current_uptime": repo.current_uptime_seconds(zone_key),
                "day_uptime": day.get(zone_key, 0),
                "total_uptime": total.get(zone_key, 0),
                "enabled": bool(row["enabled"]),
                "active": bool(row["active"]),
            }
        )
    return items


def _dashboard_snapshot():
    return {
        "zones": _zone_payload(),
        "mapping": repo.list_mapping(),
    }


def _normalize_graphql_state_arg(state):
    normalized = (state or "ANY").strip().upper()
    if normalized not in {"ANY", "ON", "OFF"}:
        raise ValueError("state must be one of ANY, ON, or OFF")
    return normalized


def _filter_zones_for_graphql(limit=None, state="ANY", contains=None):
    normalized_state = _normalize_graphql_state_arg(state)
    items = _zone_payload()

    if normalized_state == "ON":
        items = [item for item in items if item["state"] == "1"]
    elif normalized_state == "OFF":
        items = [item for item in items if item["state"] == "0"]

    if contains:
        needle = contains.strip().lower()
        if needle:
            items = [
                item
                for item in items
                if needle in item["zone_name"].lower() or needle in item["zone_key"].lower()
            ]

    if isinstance(limit, int) and limit > 0:
        return items[:limit]
    return items


class ZoneType(graphene.ObjectType):
    zone_key = graphene.String(required=True)
    zone_name = graphene.String(required=True)
    port = graphene.String(required=True)
    bit = graphene.Int(required=True)
    state = graphene.String(required=True)
    current_uptime = graphene.Int(required=True)
    day_uptime = graphene.Int(required=True)
    total_uptime = graphene.Int(required=True)
    enabled = graphene.Boolean(required=True)
    active = graphene.Boolean(required=True)


class GraphqlDemoType(graphene.ObjectType):
    message = graphene.String(required=True)
    total_zones = graphene.Int(required=True)
    online_zones = graphene.Int(required=True)
    sample_zone_keys = graphene.List(graphene.String, required=True)


class Query(graphene.ObjectType):
    server_time = graphene.String(required=True)
    zones = graphene.List(
        ZoneType,
        limit=graphene.Int(default_value=10),
        state=graphene.String(default_value="ANY"),
        contains=graphene.String(),
    )
    zone = graphene.Field(ZoneType, zone_key=graphene.String(required=True))
    demo_summary = graphene.Field(
        GraphqlDemoType,
        sample_size=graphene.Int(default_value=5),
        state=graphene.String(default_value="ANY"),
    )

    def resolve_server_time(self, info):
        return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

    def resolve_zones(self, info, limit=10, state="ANY", contains=None):
        return _filter_zones_for_graphql(limit=limit, state=state, contains=contains)

    def resolve_zone(self, info, zone_key):
        rows = _filter_zones_for_graphql(limit=None, state="ANY", contains=zone_key)
        for row in rows:
            if row["zone_key"] == zone_key:
                return row
        return None

    def resolve_demo_summary(self, info, sample_size=5, state="ANY"):
        zones = _filter_zones_for_graphql(limit=None, state=state, contains=None)
        sample_size = max(1, min(20, int(sample_size)))
        sample = zones[:sample_size]
        return {
            "message": "GraphQL lets clients pick the exact fields and shape they need.",
            "total_zones": len(zones),
            "online_zones": len([zone for zone in zones if zone["state"] == "1"]),
            "sample_zone_keys": [zone["zone_key"] for zone in sample],
        }


graphql_schema = graphene.Schema(query=Query, auto_camelcase=True)


def _bounded_int(raw_value, fallback, minimum, maximum):
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        return fallback
    return max(minimum, min(maximum, value))


def init_reborn():
    repo.init_schema()
    repo.seed_from_zones_json(ZONE_SEED_PATH)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "heatapp-reborn"})


@app.route("/api/zones", methods=["GET"])
def list_zones():
    return jsonify({"zones": _zone_payload()})


@app.route("/api/zones", methods=["OPTIONS"])
def options_zones():
    return ("", 204)


@app.route("/api/poll", methods=["POST"])
def poll_once():
    sampled = sample_zone_states(repo)
    repo.apply_sample(sampled)
    return jsonify({"updated": True, "sampled": sampled})


@app.route("/api/poll", methods=["OPTIONS"])
def options_poll():
    return ("", 204)


@app.route("/api/zones/<zone_key>/rename", methods=["POST"])
def rename_zone(zone_key):
    body = request.get_json(force=True, silent=True) or {}
    zone_name = body.get("zone_name")
    if not zone_name:
        return jsonify({"error": "zone_name is required"}), 400

    try:
        repo.rename_zone(zone_key, zone_name)
    except KeyError as exc:
        return jsonify({"error": str(exc)}), 404
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({"updated": True, "zone_key": zone_key, "zone_name": zone_name})


@app.route("/api/zones/<zone_key>/rename", methods=["OPTIONS"])
def options_rename(zone_key):
    return ("", 204)


@app.route("/api/mapping", methods=["GET"])
def get_mapping():
    return jsonify({"mapping": repo.list_mapping()})


@app.route("/api/graphql", methods=["GET"])
def graphql_info():
    return jsonify(
        {
            "service": "heatapp-reborn-graphql",
            "usage": "POST /api/graphql with { query, variables?, operationName? }",
            "example": {
                "query": "query Demo($state: String!) { demoSummary(state: $state) { message totalZones onlineZones sampleZoneKeys } zones(limit: 4, state: $state) { zoneKey zoneName state } }",
                "variables": {"state": "ON"},
            },
        }
    )


@app.route("/api/graphql", methods=["POST"])
def graphql_query():
    body = request.get_json(force=True, silent=True) or {}
    query = body.get("query")
    variables = body.get("variables")
    operation_name = body.get("operationName")

    if not query or not isinstance(query, str):
        return jsonify({"errors": [{"message": "query must be a non-empty string"}]}), 400

    result = graphql_schema.execute(
        query,
        variable_values=variables,
        operation_name=operation_name,
    )

    payload = {}
    status = 200

    if result.errors:
        payload["errors"] = [{"message": str(error)} for error in result.errors]
        status = 400
    if result.data is not None:
        payload["data"] = result.data

    return jsonify(payload), status


@app.route("/api/graphql", methods=["OPTIONS"])
def graphql_options():
    return ("", 204)


@sock.route("/ws/dashboard")
def dashboard_stream(ws):
    interval_ms = request.args.get("interval_ms", default="10000")
    interval_ms = _bounded_int(interval_ms, 10000, 1000, 300000)

    while True:
        try:
            ws.send(json.dumps(_dashboard_snapshot()))
            time.sleep(interval_ms / 1000.0)
        except ConnectionClosed:
            break


@sock.route("/ws/charts/day-timeline")
def day_timeline_stream(ws):
    interval_ms = _bounded_int(request.args.get("interval_ms", default="10000"), 10000, 1000, 300000)
    tz_offset_minutes = _bounded_int(request.args.get("tz_offset_minutes", default="0"), 0, -1440, 1440)
    max_segments = _bounded_int(request.args.get("max_segments", default="2000"), 2000, 10, 10000)
    date_str = request.args.get("date")

    selected_date = None
    if date_str:
        try:
            selected_date = datetime.date.fromisoformat(date_str)
        except ValueError:
            ws.send(json.dumps({"error": "date must be YYYY-MM-DD"}))
            return

    while True:
        try:
            payload = repo.day_timeline_segments(
                selected_date,
                tz_offset_minutes=tz_offset_minutes,
                max_segments=max_segments,
            )
            ws.send(json.dumps(payload))
            time.sleep(interval_ms / 1000.0)
        except ConnectionClosed:
            break


@sock.route("/ws/charts/recent-events")
def recent_events_stream(ws):
    interval_ms = _bounded_int(request.args.get("interval_ms", default="15000"), 15000, 1000, 300000)
    tz_offset_minutes = _bounded_int(request.args.get("tz_offset_minutes", default="0"), 0, -1440, 1440)
    minutes = _bounded_int(request.args.get("minutes", default="180"), 180, 1, 1440)
    max_events = _bounded_int(request.args.get("max_events", default="2000"), 2000, 10, 10000)

    while True:
        try:
            payload = repo.recent_transition_events(
                minutes=minutes,
                tz_offset_minutes=tz_offset_minutes,
                max_events=max_events,
            )
            ws.send(json.dumps(payload))
            time.sleep(interval_ms / 1000.0)
        except ConnectionClosed:
            break


@app.route("/api/mapping", methods=["OPTIONS"])
def options_mapping():
    return ("", 204)


@app.route("/api/mapping", methods=["POST"])
def set_mapping():
    body = request.get_json(force=True, silent=True) or {}

    port = body.get("port")
    bit = body.get("bit")
    zone_key = body.get("zone_key")
    zone_name = body.get("zone_name")
    enabled = body.get("enabled", True)

    if port is None or bit is None:
        return jsonify({"error": "port and bit are required"}), 400

    try:
        repo.update_mapping(
            port=port,
            bit=bit,
            zone_key=zone_key,
            zone_name=zone_name,
            enabled=enabled,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({"updated": True})


@app.route("/api/charts/day-timeline", methods=["GET"])
def day_timeline_chart_data():
    tz_offset_minutes = request.args.get("tz_offset_minutes", default="0")
    max_segments = request.args.get("max_segments", default="2000")
    try:
        tz_offset_minutes = int(tz_offset_minutes)
        max_segments = int(max_segments)
    except ValueError:
        return jsonify({"error": "tz_offset_minutes and max_segments must be integers"}), 400

    date_str = request.args.get("date")
    if not date_str:
        return jsonify(repo.day_timeline_segments(tz_offset_minutes=tz_offset_minutes, max_segments=max_segments))

    try:
        selected_date = datetime.date.fromisoformat(date_str)
    except ValueError:
        return jsonify({"error": "date must be YYYY-MM-DD"}), 400

    return jsonify(repo.day_timeline_segments(selected_date, tz_offset_minutes=tz_offset_minutes, max_segments=max_segments))


@app.route("/api/charts/daily-uptime", methods=["GET"])
def daily_uptime_chart_data():
    tz_offset_minutes = request.args.get("tz_offset_minutes", default="0")
    days = request.args.get("days", default="35")

    try:
        tz_offset_minutes = int(tz_offset_minutes)
        days = int(days)
    except ValueError:
        return jsonify({"error": "tz_offset_minutes and days must be integers"}), 400

    return jsonify(repo.daily_uptime_series(days=days, tz_offset_minutes=tz_offset_minutes))


@app.route("/api/charts/recent-events", methods=["GET"])
def recent_events_chart_data():
    tz_offset_minutes = request.args.get("tz_offset_minutes", default="0")
    minutes = request.args.get("minutes", default="180")
    max_events = request.args.get("max_events", default="2000")

    try:
        tz_offset_minutes = int(tz_offset_minutes)
        minutes = int(minutes)
        max_events = int(max_events)
    except ValueError:
        return jsonify({"error": "tz_offset_minutes, minutes, and max_events must be integers"}), 400

    return jsonify(repo.recent_transition_events(minutes=minutes, tz_offset_minutes=tz_offset_minutes, max_events=max_events))


if __name__ == "__main__":
    init_reborn()
    app.run(host="0.0.0.0", port=PORT, debug=False)
