import datetime

from flask import Flask, jsonify, request

from reborn.config import DB_PATH, PORT, ZONE_SEED_PATH
from reborn.db import RebornRepository
from reborn.poller import sample_zone_states

app = Flask(__name__)
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
