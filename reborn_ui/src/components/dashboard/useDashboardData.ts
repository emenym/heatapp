import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import {
  ApiErrorResponse,
  MappingItem,
  MappingResponse,
  MapFormState,
  Port,
  Zone,
  ZonesResponse,
} from "@/components/dashboard/types";

const sortByPortBit = <T extends { port: Port; bit: number }>(a: T, b: T): number => {
  if (a.port === b.port) {
    return a.bit - b.bit;
  }
  return a.port.localeCompare(b.port);
};

export function useDashboardData() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [mapping, setMapping] = useState<MappingItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [renameDraft, setRenameDraft] = useState<Record<string, string>>({});
  const [mapForm, setMapForm] = useState<MapFormState>({
    port: "PORTA",
    bit: 0,
    zone_key: "",
    zone_name: "",
    enabled: true,
  });

  const zoneCount = zones.length;
  const onlineCount = useMemo(() => zones.filter((z) => z.state === "1").length, [zones]);

  const fetchAll = async (): Promise<void> => {
    setError("");
    try {
      const [zonesRes, mapRes] = await Promise.all([fetch("/api/zones"), fetch("/api/mapping")]);

      if (!zonesRes.ok) {
        throw new Error("Failed to load zones");
      }
      if (!mapRes.ok) {
        throw new Error("Failed to load mapping");
      }

      const zonesData: ZonesResponse = await zonesRes.json();
      const mapData: MappingResponse = await mapRes.json();
      setZones((zonesData.zones || []).slice().sort(sortByPortBit));
      setMapping((mapData.mapping || []).slice().sort(sortByPortBit));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAll();
    const id = setInterval(() => {
      void fetchAll();
    }, 10000);

    return () => clearInterval(id);
  }, []);

  const doPoll = async (): Promise<void> => {
    setError("");
    const res = await fetch("/api/poll", { method: "POST" });
    if (!res.ok) {
      setError("Poll request failed");
      return;
    }

    void fetchAll();
  };

  const submitRename = async (zoneKey: string): Promise<void> => {
    const zoneName = (renameDraft[zoneKey] || "").trim();
    if (!zoneName) {
      setError("Rename requires a non-empty zone_name");
      return;
    }

    const res = await fetch(`/api/zones/${encodeURIComponent(zoneKey)}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zone_name: zoneName }),
    });

    if (!res.ok) {
      const body: ApiErrorResponse = await res.json().catch(() => ({} as ApiErrorResponse));
      setError(body.error || "Rename failed");
      return;
    }

    setRenameDraft((prev) => ({ ...prev, [zoneKey]: "" }));
    void fetchAll();
  };

  const submitMapping = async (e: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError("");

    const body = {
      port: mapForm.port,
      bit: Number(mapForm.bit),
      zone_key: mapForm.zone_key || undefined,
      zone_name: mapForm.zone_name || undefined,
      enabled: !!mapForm.enabled,
    };

    const res = await fetch("/api/mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data: ApiErrorResponse = await res.json().catch(() => ({} as ApiErrorResponse));
      setError(data.error || "Mapping update failed");
      return;
    }

    setMapForm((prev) => ({ ...prev, zone_name: "", zone_key: "" }));
    void fetchAll();
  };

  return {
    zones,
    mapping,
    loading,
    error,
    renameDraft,
    mapForm,
    zoneCount,
    onlineCount,
    setRenameDraft,
    setMapForm,
    doPoll,
    submitRename,
    submitMapping,
  };
}
