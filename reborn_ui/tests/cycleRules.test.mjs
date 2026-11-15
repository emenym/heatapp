import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/components/dashboard/cycleRules.ts", import.meta.url), "utf8");
const javascript = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 });
const { DEFAULT_CYCLE_RULES, cycleIndicators, validCycleRules } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

test("brief pulse and short call thresholds are independent", () => {
  const counts = { zone_key: "test", brief_pulses: 25, short_calls: 4 };
  assert.deepEqual(cycleIndicators(counts, DEFAULT_CYCLE_RULES), { briefPulses: true, shortCalls: false });
  assert.deepEqual(cycleIndicators({ ...counts, brief_pulses: 24, short_calls: 5 }, DEFAULT_CYCLE_RULES), { briefPulses: false, shortCalls: true });
  assert.deepEqual(cycleIndicators(counts, { ...DEFAULT_CYCLE_RULES, pulseCount: 30, shortCount: 4 }), { briefPulses: false, shortCalls: true });
});

test("custom settings reject missing, out-of-range and overlapping thresholds", () => {
  assert.equal(validCycleRules(DEFAULT_CYCLE_RULES), true);
  assert.equal(validCycleRules({ ...DEFAULT_CYCLE_RULES, pulseCount: 0 }), false);
  assert.equal(validCycleRules({ ...DEFAULT_CYCLE_RULES, pulseWindowHours: 169 }), false);
  assert.equal(validCycleRules({ ...DEFAULT_CYCLE_RULES, pulseMaxSeconds: 300, shortMaxMinutes: 5 }), false);
  assert.equal(validCycleRules({ ...DEFAULT_CYCLE_RULES, shortCount: 1.5 }), false);
  assert.equal(validCycleRules({ pulseCount: 25 }), false);
});
