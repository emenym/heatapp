import { DashboardProvider, useDashboardContext } from "@/components/dashboard/DashboardContext";
import { ConcurrencyPanel } from "@/components/dashboard/ConcurrencyPanel";
import { CycleDurationDistributionPanel } from "@/components/dashboard/CycleDurationDistributionPanel";
import { HeroHeader } from "@/components/dashboard/HeroHeader";
import { MappingPanel } from "@/components/dashboard/MappingPanel";
import { PortBitMatrixPanel } from "@/components/dashboard/PortBitMatrixPanel";
import { RecentEventsTimelinePanel } from "@/components/dashboard/RecentEventsTimelinePanel";
import { RuntimeCompositionPanel } from "@/components/dashboard/RuntimeCompositionPanel";
import { RuntimeTargetsPanel } from "@/components/dashboard/RuntimeTargetsPanel";
import { UptimeChartsPanel } from "@/components/dashboard/UptimeChartsPanel";
import { ZoneAnomalyPanel } from "@/components/dashboard/ZoneAnomalyPanel";
import { ZoneCalendarHeatmapPanel } from "@/components/dashboard/ZoneCalendarHeatmapPanel";
import { ZoneDayTimelinePanel } from "@/components/dashboard/ZoneDayTimelinePanel";
import { ZonesPanel } from "@/components/dashboard/ZonesPanel";

function DashboardView() {
  const { error } = useDashboardContext();

  return (
    <div className="mx-auto grid w-[min(1380px,95vw)] gap-4 py-6">
      <HeroHeader />

      {error ? (
        <div className="rounded-xl border border-red-500/80 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      ) : null}

      <UptimeChartsPanel />
      <ZoneDayTimelinePanel />
      <RuntimeCompositionPanel />

      <section className="grid grid-cols-1 gap-4 min-[1180px]:grid-cols-2">
        <PortBitMatrixPanel />
        <RecentEventsTimelinePanel />
        <CycleDurationDistributionPanel />
        <ConcurrencyPanel />
        <ZoneCalendarHeatmapPanel />
        <RuntimeTargetsPanel />
        <ZoneAnomalyPanel />
      </section>

      <section className="grid grid-cols-[2fr_1fr] gap-4 max-[980px]:grid-cols-1">
        <ZonesPanel />
        <MappingPanel />
      </section>
    </div>
  );
}

function App() {
  return (
    <DashboardProvider>
      <DashboardView />
    </DashboardProvider>
  );
}

export default App;
