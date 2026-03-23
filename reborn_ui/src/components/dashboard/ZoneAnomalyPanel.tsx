import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
  const { zones } = useDashboardContext();
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  const dayTimelineQuery = useQuery<DayTimelineResponse>({
    queryKey: ["day-timeline", "today", tzOffsetMinutes, 2000],
    queryFn: async () => {
      const res = await fetch(
        `/api/charts/day-timeline?tz_offset_minutes=${encodeURIComponent(String(tzOffsetMinutes))}&max_segments=2000`,
      );
      if (!res.ok) {
        throw new Error("Unable to load day timeline");
      }
      return res.json();
    },
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });

  const todaySegments = dayTimelineQuery.data?.segments || [];

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

      if (segmentCount >= 14) {
        out.push({
          zone: name,
          severity: "high",
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
        <CardTitle>Anomaly Watch</CardTitle>
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
