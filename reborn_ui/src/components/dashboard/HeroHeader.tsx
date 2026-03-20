import { Button } from "@/components/ui/button";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";

export function HeroHeader() {
  const { zoneCount, onlineCount, doPoll } = useDashboardContext();

  return (
    <header className="panel-glass flex items-end justify-between gap-4 p-4 max-[980px]:flex-col max-[980px]:items-start">
      <div className="space-y-1">
        <p className="text-accent m-0 text-[0.72rem] uppercase tracking-[0.12em]">heatapp reborn</p>
        <h1 className="m-0 text-3xl font-semibold tracking-tight max-[980px]:text-[1.35rem]">Zone Control Matrix</h1>
        <p className="m-0 text-sm text-slate-300">Stable identity by zone_key, mutable display labels, and live channel mapping.</p>
      </div>

      <div className="flex w-full items-center justify-end gap-4 max-[980px]:justify-between">
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
