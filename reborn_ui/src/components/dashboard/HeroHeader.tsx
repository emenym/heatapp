import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";

function streamBadgeClasses(state: "connecting" | "open" | "reconnecting" | "error"): string {
  if (state === "open") {
    return "border-emerald-300/40 bg-emerald-500/20 text-emerald-100";
  }
  if (state === "error") {
    return "border-rose-300/40 bg-rose-500/20 text-rose-100";
  }
  return "border-amber-300/40 bg-amber-500/20 text-amber-100";
}

function streamLabel(state: "connecting" | "open" | "reconnecting" | "error"): string {
  if (state === "open") {
    return "Live";
  }
  if (state === "reconnecting") {
    return "Reconnecting";
  }
  if (state === "error") {
    return "Stream Error";
  }
  return "Connecting";
}

export function HeroHeader() {
  const {
    zoneCount,
    onlineCount,
    doPoll,
    pollIntervalMs,
    setPollIntervalMs,
    streamState,
    lastStreamMessageAt,
  } = useDashboardContext();
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const handlePollIntervalChange = (value: string) => {
    const seconds = Number(value);

    if (!Number.isFinite(seconds)) {
      return;
    }

    const boundedSeconds = Math.min(300, Math.max(1, Math.round(seconds)));
    setPollIntervalMs(boundedSeconds * 1000);
  };

  const lastUpdateSeconds =
    typeof lastStreamMessageAt === "number"
      ? Math.max(0, Math.floor((nowMs - lastStreamMessageAt) / 1000))
      : null;

  return (
    <header className="panel-glass flex items-end justify-between gap-4 p-4 max-[980px]:flex-col max-[980px]:items-start">
      <div className="space-y-1">
        <p className="text-accent m-0 text-[0.72rem] uppercase tracking-[0.12em]">heatapp reborn</p>
        <h1 className="m-0 text-3xl font-semibold tracking-tight max-[980px]:text-[1.35rem]">Zone Control Matrix</h1>
        <p className="m-0 text-sm text-slate-300">Stable identity by zone_key, mutable display labels, and live channel mapping.</p>
        <div className="flex items-center gap-2 pt-1">
          <span
            className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-medium tracking-wide ${streamBadgeClasses(streamState)}`}
          >
            {streamLabel(streamState)}
          </span>
          <span className="text-xs text-slate-300">
            {lastUpdateSeconds === null ? "Waiting for first stream frame..." : `Last update ${lastUpdateSeconds}s ago`}
          </span>
        </div>
      </div>

      <div className="flex w-full items-center justify-end gap-4 max-[980px]:justify-between">
        <label className="grid gap-1 text-right text-xs text-slate-300 max-[980px]:text-left">
          Stream (s)
          <Input
            type="number"
            min={1}
            max={300}
            step={1}
            value={Math.round(pollIntervalMs / 1000)}
            onChange={(e) => handlePollIntervalChange(e.target.value)}
            className="h-8 w-24"
            aria-label="Dashboard stream interval in seconds"
          />
        </label>
        <div className="grid text-right max-[980px]:text-left">
          <span className="text-xs text-slate-300">Zones</span>
          <strong className="text-2xl">{zoneCount}</strong>
        </div>
        <div className="grid text-right max-[980px]:text-left">
          <span className="text-xs text-slate-300">Active</span>
          <strong className="text-2xl">{onlineCount}</strong>
        </div>
        <Button variant="outline" onClick={() => void doPoll()}>
          Poll Now
        </Button>
      </div>
    </header>
  );
}
