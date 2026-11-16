import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/components/dashboard/chartUtils.ts", import.meta.url), "utf8");
const javascript = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 });
const { formatElapsedMinutes, isFresh, peakConcurrentZones, secondsSince } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

test("elapsed time displays whole minutes and updates at minute boundaries", () => {
  assert.equal(formatElapsedMinutes(0), "0m");
  assert.equal(formatElapsedMinutes(59), "0m");
  assert.equal(formatElapsedMinutes(60), "1m");
  assert.equal(formatElapsedMinutes(3599), "59m");
  assert.equal(formatElapsedMinutes(3600), "1h 00m");
  assert.equal(formatElapsedMinutes(3660), "1h 01m");
});

test("elapsed time uses the last recorded edge and handles missing or invalid timestamps", () => {
  const now = Date.parse("2026-01-01T12:00:10.500Z");
  assert.equal(secondsSince("2026-01-01T12:00:00.123456Z", now), 10);
  assert.equal(secondsSince("2026-01-01T12:00:10.500Z", now), 0);
  assert.equal(secondsSince(null, now), null);
  assert.equal(secondsSince("invalid", now), null);
  assert.equal(secondsSince("2026-01-01T12:00:11Z", now), null);
});

test("freshness accounts for interval, stale samples, missing values and clock skew", () => {
  const now = 100000;
  assert.equal(isFresh(now - 30000, 10000, now), true);
  assert.equal(isFresh(now - 30001, 10000, now), false);
  assert.equal(isFresh(now - 15000, 2000, now), true);
  assert.equal(isFresh(null, 2000, now), false);
  assert.equal(isFresh(NaN, 2000, now), false);
  assert.equal(isFresh(now + 15001, 2000, now), false);
});

test("concurrency counts distinct simultaneous zones, not windows in a bin", () => {
  const segment = (zone_key, start_seconds, end_seconds) => ({ zone_key, start_seconds, end_seconds });
  assert.equal(peakConcurrentZones([segment("a", 0, 100), segment("a", 150, 200), segment("b", 100, 150)], 0, 900), 1);
  assert.equal(peakConcurrentZones([segment("a", 0, 200), segment("a", 50, 150), segment("b", 100, 250)], 0, 900), 2);
  assert.equal(peakConcurrentZones([segment("a", 0, 100), segment("b", 100, 200)], 0, 900), 1);
  assert.equal(peakConcurrentZones([segment("a", 0, 100)], 100, 900), 0);
});
