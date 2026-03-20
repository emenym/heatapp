import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";
import { Input } from "@/components/ui/input";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type DayTimelineSegment = {
  zone_key: string;
  zone_name: string;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
};

type DayTimelineResponse = {
  day_start?: string;
  selected_date?: string;
  is_today?: boolean;
  now_seconds?: number;
  segments?: DayTimelineSegment[];
};

type TimelineRow = {
  id: string;
  zone: string;
  start: number;
  duration: number;
  end: number;
  color: string;
};

const COLORS = ["#f59e0b", "#22c55e", "#60a5fa", "#f97316", "#14b8a6", "#f43f5e", "#eab308", "#a78bfa"];

function getTodayLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function asLocalTimeLabel(seconds: number, dayStartIso: string): string {
  const clamped = Math.max(0, Math.min(86399, Math.floor(seconds)));
  const utcBase = new Date(dayStartIso).getTime();
  const value = new Date(utcBase + clamped * 1000);
  return value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function asDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${String(secs).padStart(2, "0")}s`;
  }
  return `${minutes}m ${String(secs).padStart(2, "0")}s`;
}

export function ZoneDayTimelinePanel() {
  const { zones } = useDashboardContext();
  const [segments, setSegments] = useState<DayTimelineSegment[]>([]);
  const [nowSeconds, setNowSeconds] = useState<number>(0);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayLocalDateString());
  const [dayStartIso, setDayStartIso] = useState<string>(`${getTodayLocalDateString()}T00:00:00Z`);

  useEffect(() => {
    let active = true;

    const fetchTimeline = async () => {
      const res = await fetch(`/api/charts/day-timeline?date=${encodeURIComponent(selectedDate)}`);
      if (!res.ok) {
        const now = new Date();
        setNowSeconds(now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds());
        setSegments([]);
        return;
      }
      const body: DayTimelineResponse = await res.json();
      if (!active) {
        return;
      }
      setSegments(body.segments || []);
      setNowSeconds(typeof body.now_seconds === "number" ? body.now_seconds : 0);
      setDayStartIso(body.day_start || `${selectedDate}T00:00:00Z`);
    };

    void fetchTimeline();
    const id = setInterval(() => void fetchTimeline(), 10000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [selectedDate]);

  const isTodaySelection = selectedDate === getTodayLocalDateString();

  const rows = useMemo<TimelineRow[]>(() => {
    if (segments.length === 0 && isTodaySelection) {
      return zones
        .filter((zone) => zone.state === "1" && zone.current_uptime > 0)
        .map((zone, index) => {
          const end = nowSeconds;
          const start = Math.max(0, end - Math.floor(zone.current_uptime));
          return {
            id: `${zone.zone_key}-${start}-${end}`,
            zone: zone.zone_name || zone.zone_key,
            start,
            duration: Math.max(1, end - start),
            end,
            color: COLORS[index % COLORS.length],
          };
        });
    }

    return segments.map((segment, index) => ({
      id: `${segment.zone_key}-${segment.start_seconds}-${segment.end_seconds}-${index}`,
      zone: segment.zone_name || segment.zone_key,
      start: segment.start_seconds,
      duration: segment.duration_seconds,
      end: segment.end_seconds,
      color: COLORS[index % COLORS.length],
    }));
  }, [isTodaySelection, nowSeconds, segments, zones]);

  return (
    <Card className="panel-glass gap-3 text-slate-100">
      <CardHeader className="pb-0">
        <div className="flex items-end justify-between gap-3 max-[640px]:flex-col max-[640px]:items-start">
          <CardTitle>Zone On-Times (Today)</CardTitle>
          <div className="w-full max-w-56">
            <p className="mb-1 text-xs text-slate-300">Date (Local)</p>
            <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-300">No ON periods recorded for {selectedDate}.</p>
        ) : null}

        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 18, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 86400]}
                tickFormatter={(value: number) => asLocalTimeLabel(value, dayStartIso)}
                tick={{ fill: "#cbd5e1", fontSize: 12 }}
              />
              <YAxis
                type="category"
                dataKey="zone"
                allowDuplicatedCategory={false}
                tick={{ fill: "#cbd5e1", fontSize: 12 }}
                width={160}
              />
              <ReferenceLine
                x={nowSeconds}
                stroke="#f43f5e"
                strokeDasharray="6 4"
                label={{ value: "Now", fill: "#fecaca", position: "insideTopRight" }}
              />
              <Tooltip
                cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
                formatter={(_, __, item) => {
                  const row = item.payload as TimelineRow;
                  return [
                    `${asLocalTimeLabel(row.start, dayStartIso)} - ${asLocalTimeLabel(row.end, dayStartIso)} (${asDuration(row.duration)})`,
                    row.zone,
                  ];
                }}
                labelFormatter={() => "ON Window"}
                contentStyle={{
                  borderColor: "rgba(148, 163, 184, 0.35)",
                  borderRadius: "0.75rem",
                  backgroundColor: "rgba(15, 23, 42, 0.96)",
                  color: "#e2e8f0",
                }}
              />
              <Bar dataKey="start" stackId="timeline" fill="rgba(0,0,0,0)" isAnimationActive={false} />
              <Bar dataKey="duration" stackId="timeline" radius={[6, 6, 6, 6]} isAnimationActive={false}>
                {rows.map((row) => (
                  <Cell key={row.id} fill={row.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="text-xs text-slate-400">
          Timeline is displayed in your browser local time for {selectedDate}. Marker: {asLocalTimeLabel(nowSeconds, dayStartIso)}.
        </p>
      </CardContent>
    </Card>
  );
}
