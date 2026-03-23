import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { asLocalTimeLabel, getTodayLocalDateString } from "@/components/dashboard/chartUtils";

type DayTimelineSegment = {
  start_seconds: number;
  end_seconds: number;
};

type DayTimelineResponse = {
  segments?: DayTimelineSegment[];
};

const BIN_SECONDS = 900;

export function ConcurrencyPanel() {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayLocalDateString());
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

  const rows = useMemo(() => {
    const bins = Math.floor(86400 / BIN_SECONDS);
    return Array.from({ length: bins }).map((_, i) => {
      const start = i * BIN_SECONDS;
      const end = start + BIN_SECONDS;
      const activeCount = segments.filter((segment) => segment.start_seconds < end && segment.end_seconds > start).length;
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
          <CardTitle>Zone Concurrency</CardTitle>
          <div className="w-full max-w-56">
            <p className="mb-1 text-xs text-slate-300">Date (Local)</p>
            <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[260px] w-full">
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
                type="monotone"
                dataKey="activeCount"
                stroke="rgba(250, 204, 21, 0.95)"
                fill="rgba(250, 204, 21, 0.28)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
