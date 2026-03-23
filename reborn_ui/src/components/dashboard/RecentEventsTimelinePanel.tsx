import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";
import {
  CartesianGrid,
  Dot,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type RecentEvent = {
  zone_key: string;
  zone_name: string;
  state: "0" | "1";
  ts: string;
  ts_local: string;
};

type RecentEventsResponse = {
  window_minutes?: number;
  events?: RecentEvent[];
};

type EventPoint = {
  x: number;
  y: number;
  zone: string;
  state: "0" | "1";
  tsLocal: string;
};

export function RecentEventsTimelinePanel() {
  const { pollIntervalMs } = useDashboardContext();
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  const [recentEventsData, setRecentEventsData] = useState<RecentEventsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let cancelled = false;

    setLoading(true);
    setError("");

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = () => {
      clearReconnectTimer();
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const params = new URLSearchParams({
        minutes: "180",
        tz_offset_minutes: String(tzOffsetMinutes),
        max_events: "2000",
        interval_ms: String(pollIntervalMs),
      });
      socket = new WebSocket(`${protocol}//${window.location.host}/ws/charts/recent-events?${params.toString()}`);

      socket.onopen = () => {
        if (cancelled) {
          socket?.close();
        }
      };

      socket.onmessage = (event) => {
        if (cancelled) {
          return;
        }
        try {
          const payload = JSON.parse(event.data) as RecentEventsResponse & { error?: string };
          if (payload.error) {
            setError(payload.error);
            return;
          }
          setRecentEventsData(payload);
          setLoading(false);
          setError("");
        } catch {
          setError("Received invalid recent events payload");
        }
      };

      socket.onerror = () => {
        if (!cancelled) {
          setError("Recent events stream connection failed");
        }
      };

      socket.onclose = () => {
        if (cancelled) {
          return;
        }
        reconnectTimer = window.setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearReconnectTimer();
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [pollIntervalMs, tzOffsetMinutes]);

  const windowMinutes = typeof recentEventsData?.window_minutes === "number" ? recentEventsData.window_minutes : 180;
  const events = recentEventsData?.events || [];

  const points = useMemo<EventPoint[]>(() => {
    const nowMs = Date.now();
    const zoneSet = Array.from(new Set(events.map((event) => event.zone_name || event.zone_key))).sort((a, b) =>
      a.localeCompare(b),
    );
    const zoneIndex = new Map(zoneSet.map((zone, i) => [zone, i]));

    return events
      .map((event) => {
        const zone = event.zone_name || event.zone_key;
        const y = zoneIndex.get(zone);
        if (typeof y !== "number") {
          return null;
        }
        const ageMinutes = (nowMs - new Date(event.ts).getTime()) / 60000;
        return {
          x: Math.max(0, windowMinutes - ageMinutes),
          y,
          zone,
          state: event.state,
          tsLocal: event.ts_local,
        };
      })
      .filter((item): item is EventPoint => item !== null);
  }, [events, windowMinutes]);

  return (
    <Card className="panel-glass gap-3 text-slate-100">
      <CardHeader className="pb-0">
        <CardTitle>Recent Transition Timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <p className="text-sm text-slate-300">Loading transition events...</p> : null}
        {error ? <p className="text-sm text-amber-200">{error}</p> : null}
        {!loading && !error && points.length === 0 ? (
          <p className="text-sm text-slate-300">No transitions in the last {windowMinutes} minutes.</p>
        ) : null}

        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="x"
                domain={[0, windowMinutes]}
                tick={{ fill: "#cbd5e1", fontSize: 12 }}
                tickFormatter={(v) => `${Math.floor(v)}m`}
                label={{ value: "Minutes Ago (old -> new)", position: "insideBottom", offset: -4, fill: "#93c5fd" }}
              />
              <YAxis
                type="number"
                dataKey="y"
                tick={{ fill: "#cbd5e1", fontSize: 11 }}
                tickFormatter={(value) => {
                  const point = points.find((p) => p.y === value);
                  return point ? point.zone : "";
                }}
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                formatter={(_, __, item) => {
                  const payload = item.payload as EventPoint;
                  return [payload.state === "1" ? "ON" : "OFF", payload.zone];
                }}
                labelFormatter={() => "Transition"}
                contentStyle={{
                  borderColor: "rgba(148, 163, 184, 0.35)",
                  borderRadius: "0.75rem",
                  backgroundColor: "rgba(15, 23, 42, 0.96)",
                  color: "#f8fafc",
                }}
              />
              <Scatter
                data={points}
                shape={(props) => {
                  const payload = props.payload as EventPoint;
                  return (
                    <Dot
                      cx={props.cx}
                      cy={props.cy}
                      r={4}
                      fill={payload.state === "1" ? "#22c55e" : "#f43f5e"}
                      stroke="rgba(15, 23, 42, 0.95)"
                      strokeWidth={1}
                    />
                  );
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
