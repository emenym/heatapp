import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";
import { canAssessAnomalies, formatSeconds, isFresh } from "@/components/dashboard/chartUtils";
import { InfoTooltip } from "@/components/dashboard/InfoTooltip";

type DayTimelineSegment = {
  zone_key: string;
};

type DayTimelineResponse = {
  segments?: DayTimelineSegment[];
  compressed?: boolean;
  error?: string;
};

type Anomaly = {
  zone: string;
  severity: "high" | "medium";
  reason: string;
};

export function ZoneAnomalyPanel() {
  const { zones, pollIntervalMs, dataFresh } = useDashboardContext();
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  const [todayTimelineData, setTodayTimelineData] = useState<DayTimelineResponse | null>(null);
  const [timelineError, setTimelineError] = useState("");
  const [lastTimelineAt, setLastTimelineAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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
          if (payload.error || !Array.isArray(payload.segments) || typeof payload.compressed !== "boolean") {
            setTimelineError(payload.error || "Invalid timeline data");
            return;
          }
          setTodayTimelineData(payload);
          setLastTimelineAt(Date.now());
          setTimelineError("");
        } catch {
          setTimelineError("Invalid timeline data");
        }
      };

      socket.onerror = () => {
        if (!cancelled) setTimelineError("Timeline connection failed");
      };

      socket.onclose = () => {
        if (cancelled) {
          return;
        }
        setTimelineError("Timeline connection lost");
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
  const timelineAvailable = !timelineError && isFresh(lastTimelineAt, pollIntervalMs, nowMs)
    && !todayTimelineData?.compressed;
  const canAssess = canAssessAnomalies(dataFresh, timelineAvailable, zones.some((zone) => zone.enabled));

  const anomalies = useMemo<Anomaly[]>(() => {
    const segmentsByZone = todaySegments.reduce<Record<string, number>>((acc, segment) => {
      acc[segment.zone_key] = (acc[segment.zone_key] || 0) + 1;
      return acc;
    }, {});

    const out: Anomaly[] = [];

    zones.forEach((zone) => {
      if (!zone.enabled) return;
      const name = zone.zone_name || zone.zone_key;
      const segmentCount = segmentsByZone[zone.zone_key] || 0;

      if (zone.state === "1" && zone.current_uptime >= 4 * 3600) {
        out.push({
          zone: name,
          severity: "high",
          reason: `Continuous ON for ${formatSeconds(zone.current_uptime)}.`,
        });
      }

      if (timelineAvailable && segmentCount >= 25) {
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
          reason: "Over 24 hours of historical runtime, but little activity in the last 24 hours. Check whether a call is expected.",
        });
      }

      if (zone.day_uptime > 20 * 3600) {
        out.push({
          zone: name,
          severity: "high",
          reason: `Very high daily utilization (${Math.round((zone.day_uptime / 86400) * 100)}%).`,
        });
      }
    });

    return out;
  }, [todaySegments, zones, timelineAvailable]);

  return (
    <Card className="panel-glass gap-3 text-slate-100">
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-2">
          <CardTitle>Anomaly Watch</CardTitle>
          <InfoTooltip label="Show anomaly rules">
            <p className="mb-1 font-semibold text-slate-100">Current anomaly rules</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>High: zone is ON continuously for 4+ hours.</li>
              <li>Medium: 25+ ON windows in a single day (possible short cycling).</li>
              <li>Medium: total runtime exceeds 24 hours while last 24h runtime is 3 minutes or less.</li>
              <li>High: daily runtime exceeds 20 hours (very high utilization).</li>
            </ul>
          </InfoTooltip>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-xs text-slate-300">Rule-based indicators, not a diagnosis. Heating demand varies with weather and schedules; gaps in historical recording cannot be detected.</p>
        {!canAssess ? (
          <p className="text-sm text-amber-200">Unable to assess: hardware data or complete recent timeline data is unavailable or stale.</p>
        ) : anomalies.length === 0 ? (
          <p className="text-sm text-slate-300">No indicators triggered by the current rules.</p>
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
