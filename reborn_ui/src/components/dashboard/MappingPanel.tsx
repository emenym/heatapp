import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDashboardContext } from "@/components/dashboard/DashboardContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
export function MappingPanel() {
  const { mapping, mapForm, setMapForm, submitMapping } = useDashboardContext();

  return (
    <Card className="panel-glass gap-3 text-slate-100">
      <CardHeader className="pb-0">
        <CardTitle>Hardware Map</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form className="grid gap-3" onSubmit={(e) => void submitMapping(e)}>
          <div className="grid gap-2">
            <Label htmlFor="port">Port</Label>
            <Select
              value={mapForm.port}
              onValueChange={(value) => setMapForm({ ...mapForm, port: value ?? "PORTA" })}
            >
              <SelectTrigger id="port" className="w-full bg-[rgba(15,23,42,0.65)]">
                <SelectValue placeholder="Select port" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PORTA">PORTA</SelectItem>
                <SelectItem value="PORTB">PORTB</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="bit">Bit</Label>
            <Input
              id="bit"
              type="number"
              min="0"
              max="7"
              value={mapForm.bit}
              onChange={(e) => setMapForm({ ...mapForm, bit: Number(e.target.value) })}
              className="bg-[rgba(15,23,42,0.65)]"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="zone-key">Zone Key (optional)</Label>
            <Input
              id="zone-key"
              value={mapForm.zone_key}
              onChange={(e) => setMapForm({ ...mapForm, zone_key: e.target.value })}
              placeholder="PORTA:3"
              className="bg-[rgba(15,23,42,0.65)]"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="zone-name">Zone Name (required for new key)</Label>
            <Input
              id="zone-name"
              value={mapForm.zone_name}
              onChange={(e) => setMapForm({ ...mapForm, zone_name: e.target.value })}
              placeholder="Studio"
              className="bg-[rgba(15,23,42,0.65)]"
            />
          </div>

          <Label className="flex items-center gap-2 text-slate-200">
            <Checkbox
              checked={mapForm.enabled}
              onCheckedChange={(checked) => setMapForm({ ...mapForm, enabled: checked === true })}
            />
            Enabled
          </Label>

          <Button type="submit" variant="outline">
            Apply Mapping Change
          </Button>
        </form>

        <div className="max-h-[380px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Port</TableHead>
                <TableHead>Bit</TableHead>
                <TableHead>Zone Key</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Enabled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mapping.map((item) => (
                <TableRow key={`${item.port}-${item.bit}`}>
                  <TableCell>{item.port}</TableCell>
                  <TableCell>{item.bit}</TableCell>
                  <TableCell className="font-mono">{item.zone_key}</TableCell>
                  <TableCell>{item.zone_name}</TableCell>
                  <TableCell>{item.enabled ? "yes" : "no"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
