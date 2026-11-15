import { DashboardProvider, useDashboardContext } from "@/components/dashboard/DashboardContext";
import { ConcurrencyPanel } from "@/components/dashboard/ConcurrencyPanel";
import { CycleDurationDistributionPanel } from "@/components/dashboard/CycleDurationDistributionPanel";
import { HeroHeader } from "@/components/dashboard/HeroHeader";
import { MappingPanel } from "@/components/dashboard/MappingPanel";
import { PortBitMatrixPanel } from "@/components/dashboard/PortBitMatrixPanel";
import { RecentEventsTimelinePanel } from "@/components/dashboard/RecentEventsTimelinePanel";
import { RuntimeTargetsPanel } from "@/components/dashboard/RuntimeTargetsPanel";
import { UptimeChartsPanel } from "@/components/dashboard/UptimeChartsPanel";
import { ZoneAnomalyPanel } from "@/components/dashboard/ZoneAnomalyPanel";
import { ZoneCalendarHeatmapPanel } from "@/components/dashboard/ZoneCalendarHeatmapPanel";
import { ZoneDayTimelinePanel } from "@/components/dashboard/ZoneDayTimelinePanel";
import { ZonesPanel } from "@/components/dashboard/ZonesPanel";
import { Tooltip } from "@base-ui/react/tooltip";

function DashboardView() {
  const { error } = useDashboardContext();

  return (
    <div className="mx-auto grid w-[min(1380px,95vw)] gap-4 py-6">
      <HeroHeader />

      {error ? (
        <div className="rounded-xl border border-red-500/80 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      ) : null}

      <ZonesPanel />
      <ZoneAnomalyPanel />
      <UptimeChartsPanel />
      <ZoneDayTimelinePanel />

      <section className="grid grid-cols-1 gap-4 min-[1180px]:grid-cols-2">
        <RecentEventsTimelinePanel />
        <CycleDurationDistributionPanel />
        <ConcurrencyPanel />
        <ZoneCalendarHeatmapPanel />
        <RuntimeTargetsPanel />
      </section>

      <details className="panel-glass p-4">
        <summary className="cursor-pointer font-semibold">Advanced: hardware setup and diagnostics</summary>
        <section className="mt-4 grid grid-cols-1 gap-4 min-[1180px]:grid-cols-2">
          <MappingPanel />
          <PortBitMatrixPanel />
        </section>
      </details>
    </div>
  );
}

function App() {
  return (
    <DashboardProvider>
      <Tooltip.Provider delay={250} closeDelay={100}>
        <DashboardView />
      </Tooltip.Provider>
    </DashboardProvider>
  );
}

export default App;
