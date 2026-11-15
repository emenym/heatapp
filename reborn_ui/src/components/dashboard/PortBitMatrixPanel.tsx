import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";
import { InfoTooltip } from "@/components/dashboard/InfoTooltip";

const PORTS = ["PORTA", "PORTB"];

export function PortBitMatrixPanel() {
  const { mapping, zones, dataFresh } = useDashboardContext();

  const zoneByKey = new Map(zones.map((zone) => [zone.zone_key, zone]));
  const cellByPortBit = new Map(mapping.map((item) => [`${item.port}:${item.bit}`, item]));

  return (
    <Card className="panel-glass gap-3 text-slate-100">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Port/Bit Matrix</CardTitle>
          <InfoTooltip label="About the port and bit matrix">Shows mapped hardware inputs and their last reported states to help troubleshoot wiring and configuration.</InfoTooltip>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!dataFresh ? <p className="text-sm text-amber-200">Last reported states; current hardware data is unavailable.</p> : null}
        {PORTS.map((port) => (
          <div key={port} className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-300">{port}</p>
            <div className="grid grid-cols-4 gap-2 min-[520px]:grid-cols-8">
              {Array.from({ length: 8 }).map((_, bit) => {
                const mapItem = cellByPortBit.get(`${port}:${bit}`);
                const zone = mapItem ? zoneByKey.get(mapItem.zone_key) : undefined;
                const isEnabled = !!mapItem?.enabled;
                const isOn = zone?.state === "1";
                const tone = !mapItem
                  ? "border-slate-600/40 bg-slate-900/45"
                  : !isEnabled
                    ? "border-slate-500/35 bg-slate-800/70"
                    : !zone
                      ? "border-amber-400/65 bg-amber-500/20"
                    : isOn
                      ? "border-green-400/70 bg-green-500/20"
                      : "border-slate-500/35 bg-slate-800/70";

                return (
                  <div key={`${port}-${bit}`} className={`rounded-lg border px-2 py-2 ${tone}`}>
                    <div className="text-[0.7rem] text-slate-300">B{bit}</div>
                    <div className="truncate text-xs font-semibold text-slate-100">
                      {mapItem?.zone_name || mapItem?.zone_key || "Unmapped"}
                    </div>
                    <div className="text-[0.68rem] text-slate-300">
                      {!mapItem ? "-" : !isEnabled ? "DISABLED" : !zone ? "UNKNOWN" : isOn ? "ON" : "OFF"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
