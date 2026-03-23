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
