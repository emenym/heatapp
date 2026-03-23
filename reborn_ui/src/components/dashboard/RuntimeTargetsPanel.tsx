import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const STORAGE_KEY = "heatapp-runtime-targets-seconds";
const DEFAULT_TARGET_SECONDS = 2 * 3600;

export function RuntimeTargetsPanel() {
  const { zones } = useDashboardContext();
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [targetMinutesInput, setTargetMinutesInput] = useState<string>("120");
  const [selectedZone, setSelectedZone] = useState<string>("");

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, number>;
      setTargets(parsed);
    } catch {
      setTargets({});
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(targets));
  }, [targets]);

  useEffect(() => {
    if (zones.length > 0 && !selectedZone) {
      setSelectedZone(zones[0].zone_key);
    }
  }, [selectedZone, zones]);

  const rows = useMemo(
    () =>
      zones.map((zone) => ({
        zone: zone.zone_name || zone.zone_key,
        actual: zone.day_uptime,
        target: targets[zone.zone_key] ?? DEFAULT_TARGET_SECONDS,
      })),
    [targets, zones],
  );

  const saveTarget = () => {
    const mins = Number(targetMinutesInput);
    if (!selectedZone || !Number.isFinite(mins) || mins <= 0) {
      return;
    }
    setTargets((prev) => ({ ...prev, [selectedZone]: Math.round(mins * 60) }));
  };

  return (
    <Card className="panel-glass gap-3 text-slate-100">
      <CardHeader className="pb-0">
        <CardTitle>Target vs Actual Runtime</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 rounded-lg border border-slate-500/30 bg-slate-900/35 p-3 min-[680px]:grid-cols-[1fr_auto_auto]">
          <select
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            className="rounded-md border border-slate-500/40 bg-slate-900/45 px-2 py-2 text-sm"
          >
            {zones.map((zone) => (
              <option key={zone.zone_key} value={zone.zone_key}>
                {zone.zone_name || zone.zone_key}
              </option>
            ))}
          </select>
          <Input
            type="number"
            min="1"
            value={targetMinutesInput}
            onChange={(e) => setTargetMinutesInput(e.target.value)}
            className="max-w-40 bg-[rgba(15,23,42,0.65)]"
            placeholder="minutes"
          />
          <Button variant="outline" onClick={saveTarget}>
            Save Target
          </Button>
        </div>

        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 32 }}>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.2)" strokeDasharray="3 3" />
              <XAxis
                dataKey="zone"
                interval={0}
                angle={-30}
                textAnchor="end"
                tick={{ fill: "#cbd5e1", fontSize: 12 }}
                height={58}
              />
              <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} />
              <Tooltip
                formatter={(value) => [`${value}s`, "Runtime"]}
                contentStyle={{
                  borderColor: "rgba(148, 163, 184, 0.35)",
                  borderRadius: "0.75rem",
                  backgroundColor: "rgba(15, 23, 42, 0.96)",
                  color: "#f8fafc",
                }}
              />
              <Legend />
              <Bar dataKey="actual" fill="rgba(34, 197, 94, 0.75)" name="Actual 24h" radius={[4, 4, 0, 0]} />
              <Bar dataKey="target" fill="rgba(96, 165, 250, 0.7)" name="Target 24h" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
