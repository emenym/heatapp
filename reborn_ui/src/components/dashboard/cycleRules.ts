export type CycleRules = {
  pulseMaxSeconds: number;
  pulseCount: number;
  pulseWindowHours: number;
  shortMaxMinutes: number;
  shortCount: number;
  shortWindowMinutes: number;
};

export type CycleRuleKey = keyof CycleRules;

export const DEFAULT_CYCLE_RULES: CycleRules = {
  pulseMaxSeconds: 5,
  pulseCount: 25,
  pulseWindowHours: 24,
  shortMaxMinutes: 5,
  shortCount: 5,
  shortWindowMinutes: 60,
};

export const CYCLE_RULE_FIELDS: Array<{ key: CycleRuleKey; label: string; min: number; max: number }> = [
  { key: "pulseMaxSeconds", label: "Brief pulse maximum (seconds)", min: 1, max: 300 },
  { key: "pulseCount", label: "Brief pulses to flag", min: 1, max: 100000 },
  { key: "pulseWindowHours", label: "Brief pulse window (hours)", min: 1, max: 168 },
  { key: "shortMaxMinutes", label: "Short call maximum (minutes)", min: 1, max: 1440 },
  { key: "shortCount", label: "Short calls to flag", min: 1, max: 100000 },
  { key: "shortWindowMinutes", label: "Short call window (minutes)", min: 1, max: 10080 },
];

export type CycleCounts = {
  zone_key: string;
  brief_pulses: number;
  short_calls: number;
};

export function validCycleRules(value: unknown): value is CycleRules {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return CYCLE_RULE_FIELDS.every(({ key, min, max }) => {
    const number = record[key];
    return typeof number === "number" && Number.isSafeInteger(number) && number >= min && number <= max;
  }) && Number(record.pulseMaxSeconds) < Number(record.shortMaxMinutes) * 60;
}

export function cycleIndicators(counts: CycleCounts, rules: CycleRules) {
  return {
    briefPulses: counts.brief_pulses >= rules.pulseCount,
    shortCalls: counts.short_calls >= rules.shortCount,
  };
}
