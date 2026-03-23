import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";
import { formatSeconds } from "@/components/dashboard/chartUtils";

type DayTimelineSegment = {
  zone_key: string;
};

type DayTimelineResponse = {
  segments?: DayTimelineSegment[];
};

type Anomaly = {
  zone: string;
  severity: "high" | "medium";
  reason: string;
};

export function ZoneAnomalyPanel() {
  const { zones, pollIntervalMs } = useDashboardContext();
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  const [todayTimelineData, setTodayTimelineData] = useState<DayTimelineResponse | null>(null);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let cancelled = false;

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
        tz_offset_minutes: String(tzOffsetMinutes),
        max_segments: "2000",
        interval_ms: String(pollIntervalMs),
      });
      socket = new WebSocket(`${protocol}//${window.location.host}/ws/charts/day-timeline?${params.toString()}`);

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
          const payload = JSON.parse(event.data) as DayTimelineResponse;
          setTodayTimelineData(payload);
        } catch {
          // Keep last good payload on malformed updates.
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

  const todaySegments = todayTimelineData?.segments || [];

  const anomalies = useMemo<Anomaly[]>(() => {
    const segmentsByZone = todaySegments.reduce<Record<string, number>>((acc, segment) => {
      acc[segment.zone_key] = (acc[segment.zone_key] || 0) + 1;
      return acc;
    }, {});

    const out: Anomaly[] = [];

    zones.forEach((zone) => {
      const name = zone.zone_name || zone.zone_key;
      const segmentCount = segmentsByZone[zone.zone_key] || 0;

      if (zone.state === "1" && zone.current_uptime >= 4 * 3600) {
        out.push({
          zone: name,
          severity: "high",
          reason: `Continuous ON for ${formatSeconds(zone.current_uptime)}.`,
        });
      }

      if (segmentCount >= 25) {
        out.push({
          zone: name,
          severity: "medium",
          reason: `${segmentCount} ON windows today, indicating possible short cycling.`,
        });
      }

      if (zone.total_uptime > 24 * 3600 && zone.day_uptime <= 3 * 60) {
        out.push({
          zone: name,
          severity: "medium",
          reason: "Long-term runtime exists but activity dropped sharply in last 24h.",
        });
      }

      if (zone.day_uptime > 20 * 3600) {
        out.push({
          zone: name,
          severity: "medium",
          reason: `Very high daily utilization (${Math.round((zone.day_uptime / 86400) * 100)}%).`,
        });
      }
    });

    return out;
  }, [todaySegments, zones]);

  return (
    <Card className="panel-glass gap-3 text-slate-100">
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-2">
          <CardTitle>Anomaly Watch</CardTitle>
          <div className="group relative">
            <button
              type="button"
              aria-label="Show anomaly rules"
              className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-400/50 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
            >
              i
            </button>
            <div
              role="tooltip"
              className="pointer-events-none invisible absolute right-0 top-7 z-20 w-80 rounded-md border border-slate-400/30 bg-slate-950/95 p-3 text-xs text-slate-200 opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
            >
              <p className="mb-1 font-semibold text-slate-100">Current anomaly rules</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>High: zone is ON continuously for 4+ hours.</li>
                <li>Medium: 25+ ON windows in a single day (possible short cycling).</li>
                <li>Medium: total runtime exceeds 24 hours while last 24h runtime is 3 minutes or less.</li>
                <li>High: daily runtime exceeds 20 hours (very high utilization).</li>
              </ul>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {anomalies.length === 0 ? (
          <p className="text-sm text-slate-300">No anomalies detected by current rules.</p>
        ) : (
          <div className="space-y-2">
            {anomalies.map((item, index) => (
              <div
                key={`${item.zone}-${item.reason}-${index}`}
                className={`rounded-lg border p-3 ${
                  item.severity === "high"
                    ? "border-red-400/50 bg-red-500/15"
                    : "border-amber-300/45 bg-amber-500/12"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm">{item.zone}</strong>
                  <span className="text-xs uppercase tracking-wide text-slate-300">{item.severity}</span>
                </div>
                <p className="mt-1 text-sm text-slate-200">{item.reason}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
