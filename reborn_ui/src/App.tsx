import { DashboardProvider, useDashboardContext } from "@/components/dashboard/DashboardContext";
import { HeroHeader } from "@/components/dashboard/HeroHeader";
import { MappingPanel } from "@/components/dashboard/MappingPanel";
import { UptimeChartsPanel } from "@/components/dashboard/UptimeChartsPanel";
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

      <main className="grid grid-cols-[2fr_1fr] gap-4 max-[980px]:grid-cols-1">
        <ZonesPanel />
        <MappingPanel />
      </main>
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
