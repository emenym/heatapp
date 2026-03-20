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
              <TableHead>Port</TableHead>
              <TableHead>Bit</TableHead>
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
                <TableCell>{zone.port}</TableCell>
                <TableCell>{zone.bit}</TableCell>
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
                <TableCell>{zone.current_uptime}s</TableCell>
                <TableCell>{zone.day_uptime}s</TableCell>
                <TableCell>{zone.total_uptime}s</TableCell>
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
