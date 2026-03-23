import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";
import { Input } from "@/components/ui/input";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
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
  selected_date?: string;
  is_today?: boolean;
  now_seconds?: number;
  segments?: DayTimelineSegment[];
};

type TimelineRow = {
  zoneKey: string;
  zone: string;
  laneSpan: number;
  windows: Array<{
    id: string;
    start: number;
    duration: number;
    end: number;
    color: string;
  }>;
};

const COLORS = ["#f59e0b", "#22c55e", "#60a5fa", "#f97316", "#14b8a6", "#f43f5e", "#eab308", "#a78bfa"];
const DEFAULT_MIN_TRANSITION_SECONDS = 2;

function getTodayLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function asLocalTimeLabel(seconds: number): string {
  const clamped = Math.max(0, Math.min(86399, Math.floor(seconds)));
  const hh = Math.floor(clamped / 3600);
  const mm = Math.floor((clamped % 3600) / 60);
  const day = new Date();
  day.setHours(hh, mm, 0, 0);
  return day.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
  const { zones, pollIntervalMs } = useDashboardContext();
  const [selectedDate, setSelectedDate] = useState<string>(getTodayLocalDateString());
  const [minTransitionSeconds, setMinTransitionSeconds] = useState<number>(DEFAULT_MIN_TRANSITION_SECONDS);
  const [timelineData, setTimelineData] = useState<DayTimelineResponse | null>(null);
  const [timelineLoading, setTimelineLoading] = useState<boolean>(true);
  const [timelineError, setTimelineError] = useState<string>("");
  const tzOffsetMinutes = new Date().getTimezoneOffset();

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let cancelled = false;

    setTimelineLoading(true);
    setTimelineError("");

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
        date: selectedDate,
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
          const payload = JSON.parse(event.data) as DayTimelineResponse & { error?: string };
          if (payload.error) {
            setTimelineError(payload.error);
            return;
          }
          setTimelineData(payload);
          setTimelineLoading(false);
          setTimelineError("");
        } catch {
          setTimelineError("Received invalid day timeline payload");
        }
      };

      socket.onerror = () => {
        if (!cancelled) {
          setTimelineError("Day timeline stream connection failed");
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
  }, [pollIntervalMs, selectedDate, tzOffsetMinutes]);

  const segments = timelineData?.segments || [];

  const now = new Date();
  const fallbackNowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const nowSeconds =
    typeof timelineData?.now_seconds === "number" ? timelineData.now_seconds : fallbackNowSeconds;

  const isTodaySelection = selectedDate === getTodayLocalDateString();

  const rows = useMemo<TimelineRow[]>(() => {
    if (segments.length === 0 && isTodaySelection) {
      return zones
        .filter((zone) => zone.state === "1" && zone.current_uptime > 0)
        .map((zone, index) => {
          const end = nowSeconds;
          const start = Math.max(0, end - Math.floor(zone.current_uptime));
          const duration = Math.max(1, end - start);
          if (duration <= minTransitionSeconds) {
            return null;
          }
          return {
            zoneKey: zone.zone_key,
            zone: zone.zone_name || zone.zone_key,
            laneSpan: 86400,
            windows: [
              {
                id: `${zone.zone_key}-${start}-${end}`,
                start,
                duration,
                end,
                color: COLORS[index % COLORS.length],
              },
            ],
          };
        })
        .filter((row): row is TimelineRow => row !== null);
    }

    const grouped = new Map<string, TimelineRow>();
    segments.forEach((segment, index) => {
      const zone = segment.zone_name || segment.zone_key;
      const key = segment.zone_key;

      if (!grouped.has(key)) {
        grouped.set(key, {
          zoneKey: key,
          zone,
          laneSpan: 86400,
          windows: [],
        });
      }

      grouped.get(key)?.windows.push({
        id: `${segment.zone_key}-${segment.start_seconds}-${segment.end_seconds}-${index}`,
        start: segment.start_seconds,
        duration: segment.duration_seconds,
        end: segment.end_seconds,
        color: COLORS[index % COLORS.length],
      });
    });

    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        windows: row.windows.filter((window) => window.duration > minTransitionSeconds),
      }))
      .filter((row) => row.windows.length > 0);
  }, [isTodaySelection, minTransitionSeconds, nowSeconds, segments, zones]);

  return (
    <Card className="panel-glass gap-3 text-slate-100">
      <CardHeader className="pb-0">
        <div className="flex items-end justify-between gap-3 max-[640px]:flex-col max-[640px]:items-start">
          <CardTitle>Zone On-Times {!isTodaySelection && `(${selectedDate})`}{isTodaySelection && "(Today)"}</CardTitle>
          <div className="flex w-full max-w-[31rem] gap-3 max-[640px]:max-w-full max-[480px]:flex-col">
            <div className="w-full max-w-56">
              <p className="mb-1 text-xs text-slate-300">Date (Local)</p>
              <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            </div>
            <div className="w-full max-w-44">
              <p className="mb-1 text-xs text-slate-300">Min Transition (sec)</p>
              <Input
                type="number"
                min={0}
                step={1}
                value={String(minTransitionSeconds)}
                onChange={(e) => {
                  const parsed = Number.parseInt(e.target.value, 10);
                  setMinTransitionSeconds(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
                }}
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {timelineLoading ? <p className="text-sm text-slate-300">Loading day timeline...</p> : null}
        {timelineError ? <p className="text-sm text-amber-200">{timelineError}</p> : null}
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
                tickFormatter={(value: number) => asLocalTimeLabel(value)}
                tick={{ fill: "#cbd5e1", fontSize: 12 }}
              />
              <YAxis
                type="category"
                dataKey="zone"
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
                cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) {
                    return null;
                  }

                  const row = payload[0].payload as TimelineRow;

                  return (
                    <div
                      style={{
                        border: "1px solid rgba(148, 163, 184, 0.35)",
                        borderRadius: "0.75rem",
                        backgroundColor: "rgba(15, 23, 42, 0.96)",
                        color: "#f8fafc",
                        padding: "0.5rem 0.625rem",
                      }}
                    >
                      <div style={{ color: "#f8fafc", fontWeight: 600, marginBottom: "0.125rem" }}>ON Window</div>
                      <div style={{ color: "#f8fafc" }}>{row.zone}</div>
                      {row.windows.slice(0, 4).map((window) => (
                        <div key={window.id} style={{ color: "#f8fafc" }}>
                          {asLocalTimeLabel(window.start)} - {asLocalTimeLabel(window.end)} ({asDuration(window.duration)})
                        </div>
                      ))}
                      {row.windows.length > 4 ? <div style={{ color: "#cbd5e1" }}>+{row.windows.length - 4} more...</div> : null}
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="laneSpan"
                isAnimationActive={false}
                shape={(props) => (
                  <g>
                    {(props.payload?.windows || []).map((window: TimelineRow["windows"][number]) => {
                      const safeWidth = Math.max(1, (window.duration / 86400) * props.width);
                      const x = props.x + (window.start / 86400) * props.width;
                      return (
                        <Rectangle
                          key={window.id}
                          x={x}
                          y={props.y + 2}
                          width={safeWidth}
                          height={Math.max(1, props.height - 4)}
                          fill={window.color}
                          radius={[6, 6, 6, 6]}
                        />
                      );
                    })}
                  </g>
                )}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="text-xs text-slate-400">
          Timeline is displayed in your browser local time for {selectedDate}. Marker: {asLocalTimeLabel(nowSeconds)}.
        </p>
      </CardContent>
    </Card>
  );
}
