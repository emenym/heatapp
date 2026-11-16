import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";
import { formatElapsedMinutes, secondsSince } from "@/components/dashboard/chartUtils";
import { InfoTooltip } from "@/components/dashboard/InfoTooltip";
import { useState } from "react";
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
  const { loading, zones, renameDraft, setRenameDraft, submitRename, dataFresh, nowMs } = useDashboardContext();
  const [showZoneKey, setShowZoneKey] = useState(false);

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
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Zones</CardTitle>
          <InfoTooltip label="About zones">Shows each zone's last reported call state and runtime. Since OFF shows whole minutes since the last recorded falling edge, even if the zone is now ON. You can rename zones here; ON does not confirm heat delivery.</InfoTooltip>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <p className="text-sm text-slate-300">Loading zones...</p> : null}
        <p className="text-sm text-slate-300">ON means a heating call, not confirmed heat delivery. {!dataFresh && "Values below are last reported, not current."}</p>
        {!loading && zones.length === 0 ? <p className="text-sm text-slate-300">No zones available. Check the connection and hardware mapping.</p> : null}
        <Label className="flex items-center gap-2 text-slate-200">
          <Checkbox checked={showZoneKey} onCheckedChange={setShowZoneKey} />
          Show Zone Key
        </Label>

        <Table>
          <TableHeader>
            <TableRow>
              {showZoneKey ? <TableHead>Zone Key</TableHead> : null}
              <TableHead>Name</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Current</TableHead>
              <TableHead>Since OFF</TableHead>
              <TableHead>24h</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Rename</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {zones.map((zone) => {
              const sinceOff = secondsSince(zone.last_off_at, nowMs);
              return (
                <TableRow key={zone.zone_key}>
                  {showZoneKey ? <TableCell className="font-mono">{zone.zone_key}</TableCell> : null}
                  <TableCell>{zone.zone_name}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        !zone.enabled
                          ? "bg-slate-500/20 text-slate-200"
                          : zone.state === "1"
                          ? "bg-green-500/20 text-green-200 hover:bg-green-500/30"
                          : "bg-slate-500/20 text-slate-200"
                      }
                    >
                      {!zone.enabled ? "DISABLED" : zone.state === "1" ? "ON" : "OFF"}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDurationHms(zone.current_uptime)}</TableCell>
                  <TableCell>{sinceOff === null ? "—" : formatElapsedMinutes(sinceOff)}</TableCell>
                  <TableCell>{formatDurationHms(zone.day_uptime)}</TableCell>
                  <TableCell>{formatDurationHms(zone.total_uptime)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Input
                        value={renameDraft[zone.zone_key] || ""}
                        onChange={(e) => setRenameDraft((prev) => ({ ...prev, [zone.zone_key]: e.target.value }))}
                        placeholder="New name"
                        aria-label={`New name for ${zone.zone_name}`}
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
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
