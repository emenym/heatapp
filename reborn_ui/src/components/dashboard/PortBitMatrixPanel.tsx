import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";

const PORTS = ["PORTA", "PORTB"];

export function PortBitMatrixPanel() {
  const { mapping, zones } = useDashboardContext();

  const zoneByKey = new Map(zones.map((zone) => [zone.zone_key, zone]));
  const cellByPortBit = new Map(mapping.map((item) => [`${item.port}:${item.bit}`, item]));

  return (
    <Card className="panel-glass gap-3 text-slate-100">
      <CardHeader className="pb-0">
        <CardTitle>Port/Bit Matrix</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
                    : isOn
                      ? "border-green-400/70 bg-green-500/20"
                      : "border-red-400/65 bg-red-500/20";

                return (
                  <div key={`${port}-${bit}`} className={`rounded-lg border px-2 py-2 ${tone}`}>
                    <div className="text-[0.7rem] text-slate-300">B{bit}</div>
                    <div className="truncate text-xs font-semibold text-slate-100">
                      {mapItem?.zone_name || mapItem?.zone_key || "Unmapped"}
                    </div>
                    <div className="text-[0.68rem] text-slate-300">
                      {!mapItem ? "-" : !isEnabled ? "DISABLED" : isOn ? "ON" : "OFF"}
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
