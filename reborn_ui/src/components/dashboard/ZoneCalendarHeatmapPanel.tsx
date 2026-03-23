import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { clamp01, formatSeconds } from "@/components/dashboard/chartUtils";

type DailyUptimeZone = {
  zone_key: string;
  zone_name: string;
  seconds_by_day: number[];
};

type DailyUptimeResponse = {
  dates?: string[];
  zones?: DailyUptimeZone[];
};

function colorForRatio(ratio: number): string {
  const r = clamp01(ratio);
  if (r <= 0.01) return "rgba(51, 65, 85, 0.55)";
  if (r <= 0.15) return "rgba(56, 189, 248, 0.35)";
  if (r <= 0.35) return "rgba(34, 197, 94, 0.45)";
  if (r <= 0.55) return "rgba(250, 204, 21, 0.52)";
  if (r <= 0.8) return "rgba(249, 115, 22, 0.58)";
  return "rgba(239, 68, 68, 0.66)";
}

export function ZoneCalendarHeatmapPanel() {
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  const [selectedZone, setSelectedZone] = useState<string>("");

  const dailyUptimeQuery = useQuery<DailyUptimeResponse>({
    queryKey: ["daily-uptime", 35, tzOffsetMinutes],
    queryFn: async () => {
      const res = await fetch(
        `/api/charts/daily-uptime?days=35&tz_offset_minutes=${encodeURIComponent(String(tzOffsetMinutes))}`,
      );
      if (!res.ok) {
        throw new Error("Unable to load historical daily uptime");
      }
      return res.json();
    },
  });

  const loading = dailyUptimeQuery.isLoading;
  const error = dailyUptimeQuery.error instanceof Error ? dailyUptimeQuery.error.message : "";
  const dates = dailyUptimeQuery.data?.dates || [];
  const zones = dailyUptimeQuery.data?.zones || [];

  useEffect(() => {
    if (zones.length > 0) {
      setSelectedZone((prev) => (prev && zones.some((z) => z.zone_key === prev) ? prev : zones[0].zone_key));
    }
  }, [zones]);

  const selected = useMemo(
    () => zones.find((zone) => zone.zone_key === selectedZone) || zones[0],
    [selectedZone, zones],
  );

  return (
    <Card className="panel-glass gap-3 text-slate-100">
      <CardHeader className="pb-0">
        <div className="flex items-end justify-between gap-3 max-[640px]:flex-col max-[640px]:items-start">
          <CardTitle>Daily Uptime Heatmap</CardTitle>
          <div className="w-full max-w-60">
            <p className="mb-1 text-xs text-slate-300">Zone</p>
            <Select
              value={selected?.zone_key || ""}
              onValueChange={(value) => setSelectedZone(value || "")}
            >
              <SelectTrigger className="bg-[rgba(15,23,42,0.65)]">
                <SelectValue placeholder="Select zone">
                  {selected ? selected.zone_name || selected.zone_key : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {zones.map((zone) => (
                  <SelectItem key={zone.zone_key} value={zone.zone_key}>
                    {zone.zone_name || zone.zone_key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <p className="text-sm text-slate-300">Loading history...</p> : null}
        {error ? <p className="text-sm text-amber-200">{error}</p> : null}

        {!loading && !error && selected ? (
          <div className="grid grid-cols-5 gap-2 min-[520px]:grid-cols-7">
            {dates.map((date, i) => {
              const seconds = selected.seconds_by_day[i] || 0;
              const ratio = seconds / 86400;
              return (
                <div
                  key={`${selected.zone_key}-${date}`}
                  className="rounded-md border border-slate-500/30 p-2"
                  style={{ background: colorForRatio(ratio) }}
                  title={`${date}: ${formatSeconds(seconds)} (${Math.round(ratio * 100)}%)`}
                >
                  <div className="text-[0.66rem] text-slate-200">{date.slice(5)}</div>
                  <div className="text-[0.68rem] font-semibold text-slate-50">{Math.round(ratio * 100)}%</div>
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
