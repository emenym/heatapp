import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";
import { InfoTooltip } from "@/components/dashboard/InfoTooltip";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const STORAGE_KEY = "heatapp-runtime-targets-seconds";
export function RuntimeTargetsPanel() {
  const { zones, dataFresh } = useDashboardContext();
  const [initialTargets] = useState((): { values: Record<string, number>; error: string } => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { values: {}, error: "" };
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid saved references");
      return {
        values: Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value > 0)),
        error: "",
      };
    } catch (error) {
      console.error("Unable to load saved runtime references", error);
      return { values: {}, error: "Unable to load saved references from this browser." };
    }
  });
  const [targets, setTargets] = useState<Record<string, number>>(initialTargets.values);
  const [targetMinutesInput, setTargetMinutesInput] = useState<string>("");
  const [selectedZone, setSelectedZone] = useState<string>("");
  const [error, setError] = useState(initialTargets.error);

  useEffect(() => {
    if (zones.length > 0 && !selectedZone) {
      setSelectedZone(zones[0].zone_key);
      setTargetMinutesInput(targets[zones[0].zone_key] ? String(targets[zones[0].zone_key] / 60) : "");
    }
  }, [selectedZone, zones, targets]);

  const rows = useMemo(
    () =>
      zones.map((zone) => ({
        zone: zone.zone_name || zone.zone_key,
        actual: zone.day_uptime,
        target: targets[zone.zone_key] ?? null,
      })),
    [targets, zones],
  );

  const saveTarget = () => {
    const mins = Number(targetMinutesInput);
    if (!selectedZone || !Number.isFinite(mins) || mins <= 0) {
      setError("Select a zone and enter a positive number of minutes.");
      return;
    }
    const updated = { ...targets, [selectedZone]: Math.round(mins * 60) };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setTargets(updated);
      setError("");
    } catch {
      setError("Unable to save the reference in this browser.");
    }
  };

  const removeTarget = () => {
    const updated = { ...targets };
    delete updated[selectedZone];
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setTargets(updated);
      setTargetMinutesInput("");
      setError("");
    } catch {
      setError("Unable to remove the reference in this browser.");
    }
  };

  return (
    <Card className="panel-glass gap-3 text-slate-100">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Optional Runtime Reference</CardTitle>
          <InfoTooltip label="About runtime references">Compares 24-hour runtime with optional values you choose and save in this browser. References are not recommended targets.</InfoTooltip>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-slate-300">Compare the last 24 hours with your own reference. This is not a recommended runtime or a measure of heating performance. References are saved only in this browser.</p>
        {!dataFresh ? <p className="text-sm text-amber-200">Actual values are last reported; current hardware data is unavailable.</p> : null}
        <div className="grid gap-2 rounded-lg border border-slate-500/30 bg-slate-900/35 p-3 min-[680px]:grid-cols-[1fr_auto_auto_auto]">
          <select
            aria-label="Zone for runtime reference"
            value={selectedZone}
            onChange={(e) => {
              const key = e.target.value;
              setSelectedZone(key);
              setTargetMinutesInput(targets[key] ? String(targets[key] / 60) : "");
            }}
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
            aria-label="Reference runtime in minutes"
          />
          <Button variant="outline" onClick={saveTarget}>
            Save Reference
          </Button>
          <Button variant="outline" onClick={removeTarget} disabled={!targets[selectedZone]}>
            Remove
          </Button>
        </div>
        {error ? <p className="text-sm text-amber-200">{error}</p> : null}

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
                formatter={(value, name) => [`${value}s`, name]}
                contentStyle={{
                  borderColor: "rgba(148, 163, 184, 0.35)",
                  borderRadius: "0.75rem",
                  backgroundColor: "rgba(15, 23, 42, 0.96)",
                  color: "#f8fafc",
                }}
              />
              <Legend />
              <Bar dataKey="actual" fill="rgba(34, 197, 94, 0.75)" name="Actual 24h" radius={[4, 4, 0, 0]} />
              <Bar dataKey="target" fill="rgba(96, 165, 250, 0.7)" name="Your reference" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
