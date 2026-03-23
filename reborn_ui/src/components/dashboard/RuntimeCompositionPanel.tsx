import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function RuntimeCompositionPanel() {
  const { zones } = useDashboardContext();

  const rows = zones.map((zone) => {
    const onSeconds = Math.max(0, zone.day_uptime);
    const offSeconds = Math.max(0, 86400 - onSeconds);
    return {
      zone: zone.zone_name || zone.zone_key,
      onSeconds,
      offSeconds,
      onPct: Math.round((onSeconds / 86400) * 100),
    };
  });

  return (
    <Card className="panel-glass gap-3 text-slate-100">
      <CardHeader className="pb-0">
        <CardTitle>24h Runtime Composition</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, left: 16, bottom: 36 }}>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.22)" strokeDasharray="3 3" />
              <XAxis
                dataKey="zone"
                interval={0}
                angle={-30}
                textAnchor="end"
                tick={{ fill: "#cbd5e1", fontSize: 12 }}
                height={60}
              />
              <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} tickFormatter={(v) => `${Math.round((v / 86400) * 100)}%`} />
              <Tooltip
                formatter={(value, key, item) => {
                  const numeric = typeof value === "number" ? value : Number(value ?? 0);
                  if (key === "onSeconds") {
                    return [`${numeric}s`, `ON (${item.payload.onPct}%)`];
                  }
                  return [`${numeric}s`, "OFF"];
                }}
                contentStyle={{
                  borderColor: "rgba(148, 163, 184, 0.35)",
                  borderRadius: "0.75rem",
                  backgroundColor: "rgba(15, 23, 42, 0.96)",
                  color: "#f8fafc",
                }}
              />
              <Bar dataKey="offSeconds" stackId="runtime" fill="rgba(100, 116, 139, 0.45)" name="OFF" />
              <Bar dataKey="onSeconds" stackId="runtime" fill="rgba(34, 197, 94, 0.75)" name="ON" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
