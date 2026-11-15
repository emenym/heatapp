import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";
import { InfoTooltip } from "@/components/dashboard/InfoTooltip";
import { Input } from "@/components/ui/input";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
  ReferenceArea,
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
  compressed?: boolean;
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
    unoccupied: boolean;
  }>;
  unoccupiedSeconds: number;
};

const COLORS = ["#f59e0b", "#22c55e", "#60a5fa", "#f97316", "#14b8a6", "#f43f5e", "#eab308", "#a78bfa"];
const DEFAULT_MIN_TRANSITION_SECONDS = 2;
const UNOCCUPIED_COLOR = "#ef4444";
const SCHEDULE_STORAGE_KEY = "heat.unoccupiedSchedule";
const DEFAULT_SCHEDULE = { start: "08:00", end: "17:00" };

function parseClock(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60;
}

// Returns [start, end] ranges within one day; a schedule that crosses midnight is split in two.
function unoccupiedRanges(startClock: string, endClock: string): Array<[number, number]> {
  const start = parseClock(startClock);
  const end = parseClock(endClock);
  if (start === null || end === null || start === end) {
    return [];
  }
  return start < end
    ? [[start, end]]
    : [
        [0, end],
        [start, 86400],
      ];
}

function loadSchedule(): { schedule: { start: string; end: string }; error: string } {
  try {
    const raw = window.localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (!raw) return { schedule: DEFAULT_SCHEDULE, error: "" };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.start === "string" && typeof parsed.end === "string"
      && parseClock(parsed.start) !== null && parseClock(parsed.end) !== null) {
      return { schedule: { start: parsed.start, end: parsed.end }, error: "" };
    }
    return { schedule: DEFAULT_SCHEDULE, error: "Saved comparison schedule is invalid; showing the default." };
  } catch {
    return { schedule: DEFAULT_SCHEDULE, error: "Unable to load the saved comparison schedule; showing the default." };
  }
}

// Splits an ON window into occupied / unoccupied pieces so the unoccupied heating stands out.
function splitWindow<T extends { id: string; start: number; end: number; duration: number }>(
  window: T,
  ranges: Array<[number, number]>,
): Array<T & { unoccupied: boolean }> {
  const cuts = new Set<number>([window.start, window.end]);
  ranges.forEach(([a, b]) => {
    [a, b].forEach((edge) => {
      if (edge > window.start && edge < window.end) {
        cuts.add(edge);
      }
    });
  });
  const points = Array.from(cuts).sort((a, b) => a - b);
  const pieces: Array<T & { unoccupied: boolean }> = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    const mid = (start + end) / 2;
    pieces.push({
      ...window,
      id: `${window.id}-${i}`,
      start,
      end,
      duration: end - start,
      unoccupied: ranges.some(([a, b]) => mid >= a && mid < b),
    });
  }
  return pieces;
}

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
  if (seconds > 0 && seconds < 60 && !Number.isInteger(seconds)) {
    return `${Number(seconds.toFixed(3))}s`;
  }
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
  const [initialSchedule] = useState(loadSchedule);
  const [schedule, setSchedule] = useState(initialSchedule.schedule);
  const [scheduleError, setScheduleError] = useState(initialSchedule.error);

  const updateSchedule = (next: { start: string; end: string }) => {
    setSchedule(next);
    try {
      window.localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(next));
      setScheduleError("");
    } catch {
      setScheduleError("Unable to save the comparison schedule in this browser.");
    }
  };

  const ranges = useMemo(() => unoccupiedRanges(schedule.start, schedule.end), [schedule]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let cancelled = false;

    setTimelineLoading(true);
    setTimelineError("");
    setTimelineData(null);

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
            setTimelineLoading(false);
            return;
          }
          if (!Array.isArray(payload.segments) || typeof payload.compressed !== "boolean") throw new Error("Incomplete timeline data");
          setTimelineData(payload);
          setTimelineLoading(false);
          setTimelineError("");
        } catch {
          setTimelineError("Received invalid day timeline payload");
          setTimelineLoading(false);
        }
      };

      socket.onerror = () => {
        if (!cancelled) {
          setTimelineError("Day timeline stream connection failed");
          setTimelineLoading(false);
        }
      };

      socket.onclose = () => {
        if (cancelled) {
          return;
        }
        setTimelineError("Day timeline stream connection lost");
        setTimelineLoading(false);
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

  const baseRows = useMemo<TimelineRow[]>(() => {
    const zoneColorByKey = new Map<string, string>();
    const getZoneColor = (zoneKey: string): string => {
      const existing = zoneColorByKey.get(zoneKey);
      if (existing) {
        return existing;
      }

      const zoneIndex = zones.findIndex((zone) => zone.zone_key === zoneKey);
      const resolved = COLORS[(zoneIndex >= 0 ? zoneIndex : zoneColorByKey.size) % COLORS.length];
      zoneColorByKey.set(zoneKey, resolved);
      return resolved;
    };

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
          unoccupiedSeconds: 0,
        });
      }

      grouped.get(key)?.windows.push({
        id: `${segment.zone_key}-${segment.start_seconds}-${segment.end_seconds}-${index}`,
        start: segment.start_seconds,
        duration: segment.duration_seconds,
        end: segment.end_seconds,
        color: getZoneColor(key),
        unoccupied: false,
      });
    });

    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        windows: row.windows.filter((window) => window.duration > minTransitionSeconds),
      }))
      .filter((row) => row.windows.length > 0);
  }, [minTransitionSeconds, segments, zones]);

  const rows = useMemo<TimelineRow[]>(
    () =>
      baseRows
        .map((row) => {
          const windows = row.windows.flatMap((window) =>
            splitWindow(window, ranges).map((piece) => ({
              ...piece,
              color: piece.unoccupied ? UNOCCUPIED_COLOR : window.color,
            })),
          );
          const unoccupiedSeconds = windows.reduce((sum, w) => sum + (w.unoccupied ? w.duration : 0), 0);
          return { ...row, windows, unoccupiedSeconds };
        })
        .sort((a, b) => b.unoccupiedSeconds - a.unoccupiedSeconds),
    [baseRows, ranges],
  );
  const offenders = rows.filter((row) => row.unoccupiedSeconds > 0);

  return (
    <Card className="panel-glass gap-3 text-slate-100">
      <CardHeader className="pb-0">
        <div className="flex items-end justify-between gap-3 max-[640px]:flex-col max-[640px]:items-start">
          <div className="flex items-center gap-2">
            <CardTitle>Zone On-Times {!isTodaySelection && `(${selectedDate})`}{isTodaySelection && "(Today)"}</CardTitle>
            <InfoTooltip label="About zone on-times">Shows when each zone called for heat on the selected day. The comparison schedule highlights calls during a chosen time window, not actual occupancy.</InfoTooltip>
          </div>
          <div className="flex w-full max-w-[46rem] gap-3 max-[640px]:max-w-full max-[480px]:flex-col">
            <div className="w-full max-w-56">
              <p className="mb-1 text-xs text-slate-300">Date (Local)</p>
              <Input type="date" aria-label="Timeline date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            </div>
            <div className="w-full max-w-44">
              <p className="mb-1 text-xs text-slate-300">Min Transition (sec)</p>
              <Input
                type="number"
                aria-label="Minimum transition duration in seconds"
                min={0}
                step={1}
                value={String(minTransitionSeconds)}
                onChange={(e) => {
                  const parsed = Number.parseInt(e.target.value, 10);
                  setMinTransitionSeconds(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
                }}
              />
            </div>
            <div className="w-full max-w-60">
              <p className="mb-1 text-xs text-slate-300">Comparison schedule (From / To)</p>
              <div className="flex gap-2">
                <Input
                  type="time"
                  aria-label="Comparison schedule start"
                  value={schedule.start}
                  onChange={(e) => parseClock(e.target.value) !== null && updateSchedule({ ...schedule, start: e.target.value })}
                />
                <Input
                  type="time"
                  aria-label="Comparison schedule end"
                  value={schedule.end}
                  onChange={(e) => parseClock(e.target.value) !== null && updateSchedule({ ...schedule, end: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {timelineLoading ? <p className="text-sm text-slate-300">Loading day timeline...</p> : null}
        {timelineError ? <p className="text-sm text-amber-200">{timelineError}</p> : null}
        {scheduleError ? <p className="text-sm text-amber-200">{scheduleError}</p> : null}
        {timelineData?.compressed ? <p className="text-sm text-amber-200">Timeline compressed because of the number of windows; displayed times and totals are approximate.</p> : null}
        {!timelineLoading && !timelineError && rows.length === 0 ? (
          <p className="text-sm text-slate-300">No ON periods shown for {selectedDate}. Recording gaps and periods below the transition filter may not appear.</p>
        ) : null}

        {!timelineLoading && !timelineError && offenders.length > 0 ? (
          <div className="rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            <p className="font-semibold">Heating calls during the comparison schedule ({schedule.start}–{schedule.end})</p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {offenders.map((row) => (
                <li key={row.zoneKey}>
                  {row.zone}: {asDuration(row.unoccupiedSeconds)}
                </li>
              ))}
            </ul>
          </div>
        ) : !timelineLoading && !timelineError && rows.length > 0 && !timelineData?.compressed ? (
          <p className="text-sm text-slate-300">No displayed calls during the comparison schedule.</p>
        ) : null}

        {!timelineLoading && !timelineError && rows.length > 0 ? <div className="h-[340px] w-full">
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
              {ranges.map(([from, to]) => (
                <ReferenceArea key={`${from}-${to}`} x1={from} x2={to} fill="#ef4444" fillOpacity={0.08} stroke="none" />
              ))}
              {isTodaySelection ? <ReferenceLine
                x={nowSeconds}
                stroke="#f43f5e"
                strokeDasharray="6 4"
                label={{ value: "Now", fill: "#fecaca", position: "insideTopRight" }}
              /> : null}
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
                          {window.unoccupied ? " – comparison schedule" : ""}
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
        </div> : null}

        <p className="text-xs text-slate-400">
          Timeline uses your browser's current time-zone offset. Red indicates calls during the comparison schedule, saved in this browser; it does not detect occupancy. The default schedule is 08:00–17:00. Recording gaps cannot be detected from transitions.
        </p>
      </CardContent>
    </Card>
  );
}
