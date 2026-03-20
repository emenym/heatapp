import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type UptimeMetric = "current_uptime" | "day_uptime" | "total_uptime";

const CHART_COLORS = [
  "#f59e0b",
  "#22c55e",
  "#60a5fa",
  "#f97316",
  "#14b8a6",
  "#f43f5e",
  "#eab308",
  "#a78bfa",
];

function formatSeconds(value: number): string {
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

type ChartPanelProps = {
  title: string;
  metric: UptimeMetric;
};

function ChartPanel({ title, metric }: ChartPanelProps) {
  const { zones } = useDashboardContext();

  const rows = zones.map((zone, index) => ({
    zone: zone.zone_name || zone.zone_key,
    seconds: zone[metric],
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));

  return (
    <Card className="panel-glass gap-3 text-slate-100">
      <CardHeader className="pb-0">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 30 }}>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.22)" strokeDasharray="3 3" />
              <XAxis
                dataKey="zone"
                interval={0}
                angle={-30}
                textAnchor="end"
                tick={{ fill: "#cbd5e1", fontSize: 12 }}
                height={58}
              />
              <YAxis
                tick={{ fill: "#cbd5e1", fontSize: 12 }}
                tickFormatter={(value: number) => formatSeconds(value)}
                label={{
                  value: "Uptime in Seconds",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#93c5fd",
                }}
              />
              <Tooltip
                cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                formatter={(value) => {
                  const seconds = typeof value === "number" ? value : Number(value ?? 0);
                  return [`${seconds}s (${formatSeconds(seconds)})`, "Uptime"];
                }}
                contentStyle={{
                  borderColor: "rgba(148, 163, 184, 0.35)",
                  borderRadius: "0.75rem",
                  backgroundColor: "rgba(15, 23, 42, 0.96)",
                  color: "#f8fafc",
                }}
                labelStyle={{ color: "#f8fafc", fontWeight: 600 }}
                itemStyle={{ color: "#f8fafc" }}
              />
              <Bar dataKey="seconds" name="Uptime" radius={[6, 6, 0, 0]}>
                {rows.map((entry) => (
                  <Cell key={entry.zone} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function UptimeChartsPanel() {
  return (
    <section className="grid gap-4">
      <ChartPanel title="Uptime" metric="current_uptime" />
      <ChartPanel title="Uptime over the last 24 hours" metric="day_uptime" />
      <ChartPanel title="Total Uptime" metric="total_uptime" />
    </section>
  );
}
