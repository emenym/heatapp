export function getTodayLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatSeconds(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours === 0) {
    return `${minutes}m ${paddedSeconds}s`;
  }
    return `${hours}h ${minutes}m ${paddedSeconds}s`;
  }

  export function secondsSince(timestamp: string | null, nowMs: number): number | null {
    if (!timestamp) return null;
    const timestampMs = Date.parse(timestamp);
    if (!Number.isFinite(timestampMs) || !Number.isFinite(nowMs) || timestampMs > nowMs) return null;
    return Math.floor((nowMs - timestampMs) / 1000);
  }

export function formatElapsedMinutes(totalSeconds: number): string {
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m`;
}

export function asLocalTimeLabel(seconds: number): string {
  const clamped = Math.max(0, Math.min(86399, Math.floor(seconds)));
  const hh = Math.floor(clamped / 3600);
  const mm = Math.floor((clamped % 3600) / 60);
  const day = new Date();
  day.setHours(hh, mm, 0, 0);
  return day.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function peakConcurrentZones(
  segments: Array<{ zone_key: string; start_seconds: number; end_seconds: number }>,
  start: number,
  end: number,
): number {
  const events = segments.flatMap((segment) => {
    const from = Math.max(start, segment.start_seconds);
    const to = Math.min(end, segment.end_seconds);
    return from < to ? [{ at: from, key: segment.zone_key, delta: 1 }, { at: to, key: segment.zone_key, delta: -1 }] : [];
  }).sort((a, b) => a.at - b.at || a.delta - b.delta);
  const active = new Map<string, number>();
  let peak = 0;
  for (const event of events) {
    const count = (active.get(event.key) ?? 0) + event.delta;
    if (count === 0) active.delete(event.key);
    else active.set(event.key, count);
    peak = Math.max(peak, active.size);
  }
  return peak;
}

export function isFresh(timestampMs: number | null, intervalMs: number, nowMs: number): boolean {
  if (timestampMs === null || !Number.isFinite(timestampMs) || !Number.isFinite(intervalMs) || intervalMs <= 0) return false;
  const age = nowMs - timestampMs;
  return age >= -15000 && age <= Math.max(intervalMs * 3, 15000);
}
