import { useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const [actionError, setActionError] = useState<string>("");
  const [renameDraft, setRenameDraft] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const invalidateDashboardQueries = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["zones"] }),
      queryClient.invalidateQueries({ queryKey: ["mapping"] }),
    ]);
  };

  const {
    data: zones = [],
    isLoading: zonesLoading,
    error: zonesError,
  } = useQuery<Zone[]>({
    queryKey: ["zones"],
    queryFn: async () => {
      const zonesRes = await fetch("/api/zones");
      if (!zonesRes.ok) {
        throw new Error("Failed to load zones");
      }

      const zonesData: ZonesResponse = await zonesRes.json();
      return (zonesData.zones || []).slice().sort(sortByPortBit);
    },
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  const {
    data: mapping = [],
    isLoading: mappingLoading,
    error: mappingError,
  } = useQuery<MappingItem[]>({
    queryKey: ["mapping"],
    queryFn: async () => {
      const mapRes = await fetch("/api/mapping");
      if (!mapRes.ok) {
        throw new Error("Failed to load mapping");
      }

      const mapData: MappingResponse = await mapRes.json();
      return (mapData.mapping || []).slice().sort(sortByPortBit);
    },
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  const loading = zonesLoading || mappingLoading;
  const error =
    actionError ||
    (zonesError instanceof Error ? zonesError.message : "") ||
    (mappingError instanceof Error ? mappingError.message : "");

  const [mapForm, setMapForm] = useState<MapFormState>({
    port: "PORTA",
    bit: 0,
    zone_key: "",
    zone_name: "",
    enabled: true,
  });

  const zoneCount = zones.length;
  const onlineCount = useMemo(() => zones.filter((z) => z.state === "1").length, [zones]);

  const pollMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/poll", { method: "POST" });
      if (!res.ok) {
        throw new Error("Poll request failed");
      }
    },
    onSuccess: invalidateDashboardQueries,
  });

  const renameMutation = useMutation({
    mutationFn: async ({ zoneKey, zoneName }: { zoneKey: string; zoneName: string }) => {
      const res = await fetch(`/api/zones/${encodeURIComponent(zoneKey)}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zone_name: zoneName }),
      });

      if (!res.ok) {
        const body: ApiErrorResponse = await res.json().catch(() => ({} as ApiErrorResponse));
        throw new Error(body.error || "Rename failed");
      }
    },
    onSuccess: invalidateDashboardQueries,
  });

  const mappingMutation = useMutation({
    mutationFn: async (body: {
      port: Port;
      bit: number;
      zone_key?: string;
      zone_name?: string;
      enabled: boolean;
    }) => {
      const res = await fetch("/api/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data: ApiErrorResponse = await res.json().catch(() => ({} as ApiErrorResponse));
        throw new Error(data.error || "Mapping update failed");
      }
    },
    onSuccess: invalidateDashboardQueries,
  });

  const doPoll = async (): Promise<void> => {
    setActionError("");
    try {
      await pollMutation.mutateAsync();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Poll request failed");
    }
  };

  const submitRename = async (zoneKey: string): Promise<void> => {
    const zoneName = (renameDraft[zoneKey] || "").trim();
    if (!zoneName) {
      setActionError("Rename requires a non-empty zone_name");
      return;
    }

    try {
      await renameMutation.mutateAsync({ zoneKey, zoneName });
      setRenameDraft((prev) => ({ ...prev, [zoneKey]: "" }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Rename failed");
    }
  };

  const submitMapping = async (e: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setActionError("");

    const body = {
      port: mapForm.port,
      bit: Number(mapForm.bit),
      zone_key: mapForm.zone_key || undefined,
      zone_name: mapForm.zone_name || undefined,
      enabled: !!mapForm.enabled,
    };

    try {
      await mappingMutation.mutateAsync(body);
      setMapForm((prev) => ({ ...prev, zone_name: "", zone_key: "" }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Mapping update failed");
    }
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
