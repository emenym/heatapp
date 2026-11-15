import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";
import { formatSeconds, isFresh } from "@/components/dashboard/chartUtils";
import {
  CYCLE_RULE_FIELDS,
  DEFAULT_CYCLE_RULES,
  cycleIndicators,
  validCycleRules,
  type CycleCounts,
  type CycleRuleKey,
  type CycleRules,
} from "@/components/dashboard/cycleRules";
import { InfoTooltip } from "@/components/dashboard/InfoTooltip";

const STORAGE_KEY = "heatapp-cycle-indicator-rules";

type CycleResponse = {
  as_of: string;
  zones: CycleCounts[];
};

type Anomaly = {
  zone: string;
  severity: "high" | "medium";
  reason: string;
};

function isCycleResponse(value: unknown): value is CycleResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.as_of === "string" && Number.isFinite(Date.parse(record.as_of))
    && Array.isArray(record.zones) && record.zones.every((zone: unknown) => {
      if (!zone || typeof zone !== "object" || Array.isArray(zone)) return false;
      const item = zone as Record<string, unknown>;
      return typeof item.zone_key === "string"
        && typeof item.brief_pulses === "number" && Number.isSafeInteger(item.brief_pulses) && item.brief_pulses >= 0
        && typeof item.short_calls === "number" && Number.isSafeInteger(item.short_calls) && item.short_calls >= 0;
    });
}

function loadRules(): { rules: CycleRules; error: string } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { rules: DEFAULT_CYCLE_RULES, error: "" };
    const value: unknown = JSON.parse(raw);
    if (validCycleRules(value)) return { rules: value, error: "" };
    return { rules: DEFAULT_CYCLE_RULES, error: "Saved indicator settings are invalid; using defaults." };
  } catch {
    return { rules: DEFAULT_CYCLE_RULES, error: "Unable to load indicator settings; using defaults." };
  }
}

function rulesToDraft(rules: CycleRules): Record<CycleRuleKey, string> {
  return {
    pulseMaxSeconds: String(rules.pulseMaxSeconds),
    pulseCount: String(rules.pulseCount),
    pulseWindowHours: String(rules.pulseWindowHours),
    shortMaxMinutes: String(rules.shortMaxMinutes),
    shortCount: String(rules.shortCount),
    shortWindowMinutes: String(rules.shortWindowMinutes),
  };
}

export function ZoneAnomalyPanel() {
  const { zones, pollIntervalMs, dataFresh, monitoring } = useDashboardContext();
  const [initialRules] = useState(loadRules);
  const [rules, setRules] = useState(initialRules.rules);
  const [draft, setDraft] = useState(() => rulesToDraft(initialRules.rules));
  const [settingsError, setSettingsError] = useState(initialRules.error);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const countsQuery = useQuery<CycleResponse>({
    queryKey: ["cycle-indicators", rules.pulseMaxSeconds, rules.shortMaxMinutes, rules.pulseWindowHours, rules.shortWindowMinutes],
    refetchInterval: pollIntervalMs,
    queryFn: async () => {
      const params = new URLSearchParams({
        pulse_max_seconds: String(rules.pulseMaxSeconds),
        short_max_minutes: String(rules.shortMaxMinutes),
        pulse_window_hours: String(rules.pulseWindowHours),
        short_window_minutes: String(rules.shortWindowMinutes),
      });
      const response = await fetch(`/api/charts/cycle-indicators?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Cycle indicator request failed (${response.status})`);
      const payload: unknown = await response.json();
      if (!isCycleResponse(payload)) throw new Error("Invalid cycle indicator response");
      return payload;
    },
  });

  const countsAvailable = countsQuery.isSuccess && !countsQuery.isError
    && isFresh(countsQuery.dataUpdatedAt, pollIntervalMs, nowMs);
  const hasEnabledZones = zones.some((zone) => zone.enabled);
  const countsByZone = useMemo(
    () => new Map((countsAvailable ? countsQuery.data?.zones ?? [] : []).map((item) => [item.zone_key, item])),
    [countsAvailable, countsQuery.data],
  );

  const anomalies = useMemo<Anomaly[]>(() => {
    if (!dataFresh) return [];
    const out: Anomaly[] = [];

    zones.forEach((zone) => {
      if (!zone.enabled) return;
      const name = zone.zone_name || zone.zone_key;
      const counts = countsByZone.get(zone.zone_key);
      if (counts) {
        const indicators = cycleIndicators(counts, rules);
        if (indicators.briefPulses) {
          out.push({
            zone: name,
            severity: "medium",
            reason: `${counts.brief_pulses} brief pulses (at most ${rules.pulseMaxSeconds}s) in the last ${rules.pulseWindowHours}h. Possible input chatter or thermostat power behavior; not proof of charging.`,
          });
        }
        if (indicators.shortCalls) {
          out.push({
            zone: name,
            severity: "medium",
            reason: `${counts.short_calls} completed calls longer than ${rules.pulseMaxSeconds}s and shorter than ${rules.shortMaxMinutes}m in the last ${rules.shortWindowMinutes}m; possible short cycling.`,
          });
        }
      }

      if (zone.state === "1" && zone.current_uptime >= 4 * 3600) {
        out.push({ zone: name, severity: "high", reason: `Continuous ON for ${formatSeconds(zone.current_uptime)}.` });
      }
      if (zone.total_uptime > 24 * 3600 && zone.day_uptime <= 3 * 60) {
        out.push({
          zone: name,
          severity: "medium",
          reason: "Over 24 hours of historical runtime, but little activity in the last 24 hours. Check whether a call is expected.",
        });
      }
      if (zone.day_uptime > 20 * 3600) {
        out.push({
          zone: name,
          severity: "high",
          reason: `Very high daily utilization (${Math.round((zone.day_uptime / 86400) * 100)}%).`,
        });
      }
    });
    return out;
  }, [countsByZone, dataFresh, rules, zones]);

  const saveRules = (next: CycleRules) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setRules(next);
      setDraft(rulesToDraft(next));
      setSettingsError("");
    } catch {
      setSettingsError("Unable to save indicator settings in this browser; previous settings remain active.");
    }
  };

  const submitRules = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(CYCLE_RULE_FIELDS.map(({ key }) => [key, Number(draft[key])]));
    if (!validCycleRules(values)) {
      setSettingsError("Enter whole numbers within the shown ranges. The short-call maximum must exceed the brief-pulse maximum.");
      return;
    }
    saveRules(values);
  };

  return (
    <Card className="panel-glass gap-3 text-slate-100">
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-2">
          <CardTitle>Anomaly Watch</CardTitle>
          <InfoTooltip label="Show anomaly rules">
            <p className="mb-1 font-semibold text-slate-100">Current anomaly rules</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>High: zone is ON continuously for 4+ hours.</li>
              <li>Medium: {rules.pulseCount}+ completed pulses of at most {rules.pulseMaxSeconds}s in {rules.pulseWindowHours}h.</li>
              <li>Medium: {rules.shortCount}+ completed calls longer than {rules.pulseMaxSeconds}s and shorter than {rules.shortMaxMinutes}m in {rules.shortWindowMinutes}m.</li>
              <li>Medium: total runtime exceeds 24 hours while last 24h runtime is 3 minutes or less.</li>
              <li>High: daily runtime exceeds 20 hours.</li>
            </ul>
          </InfoTooltip>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-slate-300">Rule-based indicators, not a diagnosis. Brief pulses may reflect input chatter or thermostat power behavior; they do not prove charging or boiler operation. Recording gaps cannot be detected.</p>
        {monitoring ? <p className="text-xs text-slate-400">Durations are estimates from {monitoring.expected_interval_seconds}s hardware samples; brief pulses may be measured inaccurately or missed.</p> : null}
        {!dataFresh || !hasEnabledZones ? (
          <p className="text-sm text-amber-200">Unable to assess: hardware data is unavailable or stale, or no zones are enabled.</p>
        ) : null}
        {dataFresh && hasEnabledZones && !countsAvailable ? (
          countsQuery.isLoading ? (
            <p className="text-sm text-slate-300">Loading cycle indicators...</p>
          ) : (
            <p className="text-sm text-amber-200">
              Unable to assess cycle indicators: completed-call data is unavailable or stale.
              {countsQuery.error instanceof Error ? ` ${countsQuery.error.message}` : ""}
            </p>
          )
        ) : null}
        {dataFresh && hasEnabledZones && countsAvailable && anomalies.length === 0 ? (
          <p className="text-sm text-slate-300">No indicators triggered by the current rules.</p>
        ) : null}
        {anomalies.length > 0 ? (
          <div className="space-y-2">
            {anomalies.map((item, index) => (
              <div
                key={`${item.zone}-${item.reason}-${index}`}
                className={`rounded-lg border p-3 ${
                  item.severity === "high" ? "border-red-400/50 bg-red-500/15" : "border-amber-300/45 bg-amber-500/12"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm">{item.zone}</strong>
                  <span className="text-xs uppercase tracking-wide text-slate-300">{item.severity}</span>
                </div>
                <p className="mt-1 text-sm text-slate-200">{item.reason}</p>
              </div>
            ))}
          </div>
        ) : null}
        {dataFresh && hasEnabledZones && countsAvailable ? (
          <details className="rounded-lg border border-slate-500/30 p-3">
            <summary className="cursor-pointer text-sm text-slate-200">Recorded completed-call counts</summary>
            <p className="mt-2 text-xs text-slate-300">Brief pulses in the last {rules.pulseWindowHours}h; short calls in the last {rules.shortWindowMinutes}m. Counts below the warning thresholds are included.</p>
            <div className="mt-2">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Zone</TableHead><TableHead>Brief pulses</TableHead><TableHead>Short calls</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {zones.filter((zone) => zone.enabled).map((zone) => (
                    <TableRow key={zone.zone_key}>
                      <TableCell>{zone.zone_name || zone.zone_key}</TableCell>
                      <TableCell>{countsByZone.get(zone.zone_key)?.brief_pulses ?? 0}</TableCell>
                      <TableCell>{countsByZone.get(zone.zone_key)?.short_calls ?? 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        ) : null}
        <details className="rounded-lg border border-slate-500/30 p-3">
          <summary className="cursor-pointer text-sm text-slate-200">Cycle indicator settings</summary>
          <form className="mt-3 space-y-3" onSubmit={submitRules}>
            <p className="text-xs text-slate-300">Completed calls are counted by their end time in rolling windows. Settings apply to all zones and are saved only in this browser.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CYCLE_RULE_FIELDS.map(({ key, label, min, max }) => (
                <label key={key} className="grid gap-1 text-xs text-slate-300">
                  {label} ({min}–{max})
                  <Input
                    type="number"
                    min={min}
                    max={max}
                    step={1}
                    required
                    value={draft[key]}
                    onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
                  />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="outline" size="sm">Save settings</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => saveRules(DEFAULT_CYCLE_RULES)}>Restore defaults</Button>
            </div>
          </form>
        </details>
        {settingsError ? <p className="text-sm text-amber-200" role="alert">{settingsError}</p> : null}
      </CardContent>
    </Card>
  );
}
