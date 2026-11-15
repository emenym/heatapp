import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";
import { InfoTooltip } from "@/components/dashboard/InfoTooltip";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getTodayLocalDateString } from "@/components/dashboard/chartUtils";

type DayTimelineSegment = {
  zone_key: string;
  zone_name: string;
  duration_seconds: number;
};

type DayTimelineResponse = {
  segments?: DayTimelineSegment[];
  compressed?: boolean;
};

const BUCKETS = [0, 3, 5, 10, 20, 30, 60, 120, 240];

function bucketLabel(min: number, next?: number): string {
  if (!next) {
    return `${min}+m`;
  }
  return `${min}-${next}m`;
}

export function CycleDurationDistributionPanel() {
  const { zones, pollIntervalMs } = useDashboardContext();
  const [selectedDate, setSelectedDate] = useState<string>(getTodayLocalDateString());
  const [zoneKey, setZoneKey] = useState<string>("ALL");
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  const timelineQuery = useQuery<DayTimelineResponse>({
    queryKey: ["day-timeline", selectedDate, tzOffsetMinutes, 2000],
    refetchInterval: pollIntervalMs,
    queryFn: async () => {
      const res = await fetch(
        `/api/charts/day-timeline?date=${encodeURIComponent(selectedDate)}&tz_offset_minutes=${encodeURIComponent(String(tzOffsetMinutes))}&max_segments=2000`,
      );
      if (!res.ok) {
        throw new Error("Unable to load day timeline");
      }
      const data: DayTimelineResponse = await res.json();
      if (!Array.isArray(data.segments) || typeof data.compressed !== "boolean") {
        throw new Error("Incomplete day timeline response");
      }
      return data;
    },
  });

  const segments = timelineQuery.data?.segments || [];

  const filtered = useMemo(() => {
    if (zoneKey === "ALL") {
      return segments;
    }
    return segments.filter((segment) => segment.zone_key === zoneKey);
  }, [segments, zoneKey]);

  const rows = useMemo(() => {
    const counts = BUCKETS.map(() => 0);
    filtered.forEach((segment) => {
      const mins = Math.max(0, segment.duration_seconds / 60);
      let idx = 0;
      if (mins >= BUCKETS[BUCKETS.length - 1]) {
        idx = BUCKETS.length - 1;
      } else {
        for (let i = 0; i < BUCKETS.length - 1; i += 1) {
          if (mins >= BUCKETS[i] && mins < BUCKETS[i + 1]) {
            idx = i;
            break;
          }
        }
      }
      counts[idx] += 1;
    });

    return BUCKETS.map((min, i) => ({
      bucket: bucketLabel(min, BUCKETS[i + 1]),
      count: counts[i],
    }));
  }, [filtered]);

  return (
    <Card className="panel-glass gap-3 text-slate-100">
      <CardHeader className="pb-0">
        <div className="flex items-end justify-between gap-3 max-[680px]:flex-col max-[680px]:items-start">
          <div className="flex items-center gap-2">
            <CardTitle>Cycle Duration Distribution</CardTitle>
            <InfoTooltip label="About cycle duration distribution">Groups recorded ON windows by duration for the selected date and zones. Windows at day boundaries or still in progress may be partial.</InfoTooltip>
          </div>
          <div className="w-full max-w-56">
            <p className="mb-1 text-xs text-slate-300">Date (Local)</p>
            <Input type="date" aria-label="Cycle distribution date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-slate-300">ON windows intersecting this date; windows at the day boundaries and ongoing windows may be partial, not complete cycles.</p>
        {timelineQuery.isLoading ? <p className="text-sm text-slate-300">Loading ON windows...</p> : null}
        {timelineQuery.isError ? <p className="text-sm text-amber-200">Unable to load ON windows.</p> : null}
        {timelineQuery.data?.compressed ? <p className="text-sm text-amber-200">Too many windows to calculate a reliable distribution.</p> : null}
        {timelineQuery.isSuccess && !timelineQuery.data.compressed && filtered.length === 0 ? <p className="text-sm text-slate-300">No ON windows recorded for this selection. Recording gaps are not detectable from transition history.</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-md border px-2 py-1 text-xs ${zoneKey === "ALL" ? "border-sky-300 bg-sky-500/20" : "border-slate-500/40 bg-slate-900/40"}`}
            onClick={() => setZoneKey("ALL")}
          >
            All Zones
          </button>
          {zones.map((zone) => (
            <button
              key={zone.zone_key}
              type="button"
              className={`rounded-md border px-2 py-1 text-xs ${zoneKey === zone.zone_key ? "border-sky-300 bg-sky-500/20" : "border-slate-500/40 bg-slate-900/40"}`}
              onClick={() => setZoneKey(zone.zone_key)}
            >
              {zone.zone_name || zone.zone_key}
            </button>
          ))}
        </div>

        {timelineQuery.isSuccess && !timelineQuery.data.compressed && filtered.length > 0 ? <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.2)" strokeDasharray="3 3" />
              <XAxis dataKey="bucket" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
              <YAxis tick={{ fill: "#cbd5e1", fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                formatter={(v) => [v, "ON windows"]}
                contentStyle={{
                  borderColor: "rgba(148, 163, 184, 0.35)",
                  borderRadius: "0.75rem",
                  backgroundColor: "rgba(15, 23, 42, 0.96)",
                  color: "#f8fafc",
                }}
              />
              <Bar dataKey="count" fill="rgba(96, 165, 250, 0.8)" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div> : null}
      </CardContent>
    </Card>
  );
}
