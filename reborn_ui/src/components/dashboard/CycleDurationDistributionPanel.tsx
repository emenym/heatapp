import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getTodayLocalDateString } from "@/components/dashboard/chartUtils";

type DayTimelineSegment = {
  zone_key: string;
  zone_name: string;
  duration_seconds: number;
};

type DayTimelineResponse = {
  segments?: DayTimelineSegment[];
};

const BUCKETS = [0, 3, 5, 10, 20, 30, 60, 120, 240];

function bucketLabel(min: number, next?: number): string {
  if (!next) {
    return `${min}+m`;
  }
  return `${min}-${next}m`;
}

export function CycleDurationDistributionPanel() {
  const { zones } = useDashboardContext();
  const [selectedDate, setSelectedDate] = useState<string>(getTodayLocalDateString());
  const [zoneKey, setZoneKey] = useState<string>("ALL");
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  const timelineQuery = useQuery<DayTimelineResponse>({
    queryKey: ["day-timeline", selectedDate, tzOffsetMinutes, 2000],
    queryFn: async () => {
      const res = await fetch(
        `/api/charts/day-timeline?date=${encodeURIComponent(selectedDate)}&tz_offset_minutes=${encodeURIComponent(String(tzOffsetMinutes))}&max_segments=2000`,
      );
      if (!res.ok) {
        throw new Error("Unable to load day timeline");
      }
      return res.json();
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
          <CardTitle>Cycle Duration Distribution</CardTitle>
          <div className="w-full max-w-56">
            <p className="mb-1 text-xs text-slate-300">Date (Local)</p>
            <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
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

        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.2)" strokeDasharray="3 3" />
              <XAxis dataKey="bucket" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
              <YAxis tick={{ fill: "#cbd5e1", fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                formatter={(v) => [v, "Cycles"]}
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
        </div>
      </CardContent>
    </Card>
  );
}
