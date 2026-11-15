import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";
import { InfoTooltip } from "@/components/dashboard/InfoTooltip";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { asLocalTimeLabel, getTodayLocalDateString, peakConcurrentZones } from "@/components/dashboard/chartUtils";

type DayTimelineSegment = {
  zone_key: string;
  start_seconds: number;
  end_seconds: number;
};

type DayTimelineResponse = {
  segments?: DayTimelineSegment[];
  compressed?: boolean;
};

const BIN_SECONDS = 900;

export function ConcurrencyPanel() {
  const { pollIntervalMs } = useDashboardContext();
  const [selectedDate, setSelectedDate] = useState<string>(getTodayLocalDateString());
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

  const rows = useMemo(() => {
    const bins = Math.floor(86400 / BIN_SECONDS);
    return Array.from({ length: bins }).map((_, i) => {
      const start = i * BIN_SECONDS;
      const end = start + BIN_SECONDS;
      const activeCount = peakConcurrentZones(segments, start, end);
      return {
        secondOfDay: start,
        activeCount,
      };
    });
  }, [segments]);

  return (
    <Card className="panel-glass gap-3 text-slate-100">
      <CardHeader className="pb-0">
        <div className="flex items-end justify-between gap-3 max-[640px]:flex-col max-[640px]:items-start">
          <div className="flex items-center gap-2">
            <CardTitle>Zone Concurrency</CardTitle>
            <InfoTooltip label="About zone concurrency">Shows the peak number of distinct zones calling for heat at the same time in each 15-minute interval.</InfoTooltip>
          </div>
          <div className="w-full max-w-56">
            <p className="mb-1 text-xs text-slate-300">Date (Local)</p>
            <Input type="date" aria-label="Concurrency date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-slate-300">Peak simultaneous zone calls in each 15-minute interval; not a measure of boiler output.</p>
        {timelineQuery.isLoading ? <p className="text-sm text-slate-300">Loading concurrency...</p> : null}
        {timelineQuery.isError ? <p className="text-sm text-amber-200">Unable to load concurrency.</p> : null}
        {timelineQuery.data?.compressed ? <p className="text-sm text-amber-200">Too many windows to calculate reliable concurrency.</p> : null}
        {timelineQuery.isSuccess && !timelineQuery.data.compressed && segments.length === 0 ? <p className="text-sm text-slate-300">No ON windows recorded. Recording gaps are not detectable from transition history.</p> : null}
        {timelineQuery.isSuccess && !timelineQuery.data.compressed && segments.length > 0 ? <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 8, right: 10, left: 10, bottom: 8 }}>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.2)" strokeDasharray="3 3" />
              <XAxis
                dataKey="secondOfDay"
                tick={{ fill: "#cbd5e1", fontSize: 12 }}
                tickFormatter={(v) => asLocalTimeLabel(v)}
              />
              <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                formatter={(value) => [value, "Zones ON"]}
                labelFormatter={(value) => asLocalTimeLabel(Number(value))}
                contentStyle={{
                  borderColor: "rgba(148, 163, 184, 0.35)",
                  borderRadius: "0.75rem",
                  backgroundColor: "rgba(15, 23, 42, 0.96)",
                  color: "#f8fafc",
                }}
              />
              <Area
                type="stepAfter"
                dataKey="activeCount"
                stroke="rgba(250, 204, 21, 0.95)"
                fill="rgba(250, 204, 21, 0.28)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div> : null}
      </CardContent>
    </Card>
  );
}
