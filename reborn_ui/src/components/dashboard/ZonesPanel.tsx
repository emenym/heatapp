import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDurationHms(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function ZonesPanel() {
  const { loading, zones, renameDraft, setRenameDraft, submitRename } = useDashboardContext();

  const confirmAndRename = async (zoneKey: string, currentName: string): Promise<void> => {
    const nextName = (renameDraft[zoneKey] || "").trim();
    if (!nextName) {
      await submitRename(zoneKey);
      return;
    }

    const confirmed = window.confirm(`Rename zone "${currentName}" to "${nextName}"?`);
    if (!confirmed) {
      return;
    }

    await submitRename(zoneKey);
  };

  return (
    <Card className="panel-glass gap-3 text-slate-100">
      <CardHeader className="pb-0">
        <CardTitle>Zones</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <p className="text-sm text-slate-300">Loading zones...</p> : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zone Key</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Current</TableHead>
              <TableHead>24h</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Rename</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {zones.map((zone) => (
              <TableRow key={zone.zone_key}>
                <TableCell className="font-mono">{zone.zone_key}</TableCell>
                <TableCell>{zone.zone_name}</TableCell>
                <TableCell>
                  <Badge
                    className={
                      zone.state === "1"
                        ? "bg-green-500/20 text-green-200 hover:bg-green-500/30"
                        : "bg-red-500/20 text-red-200 hover:bg-red-500/30"
                    }
                  >
                    {zone.state === "1" ? "ON" : "OFF"}
                  </Badge>
                </TableCell>
                <TableCell>{formatDurationHms(zone.current_uptime)}</TableCell>
                <TableCell>{formatDurationHms(zone.day_uptime)}</TableCell>
                <TableCell>{formatDurationHms(zone.total_uptime)}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Input
                      value={renameDraft[zone.zone_key] || ""}
                      onChange={(e) => setRenameDraft((prev) => ({ ...prev, [zone.zone_key]: e.target.value }))}
                      placeholder="New name"
                      className="h-8 min-w-28"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void confirmAndRename(zone.zone_key, zone.zone_name)}
                    >
                      Save
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
