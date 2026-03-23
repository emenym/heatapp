import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ApiErrorResponse,
  MappingItem,
  MapFormState,
  Port,
  Zone,
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
  const [pollIntervalMs, setPollIntervalMs] = useState<number>(10000);
  const [streamState, setStreamState] = useState<"connecting" | "open" | "reconnecting" | "error">("connecting");
  const [lastStreamMessageAt, setLastStreamMessageAt] = useState<number | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [mapping, setMapping] = useState<MappingItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [streamError, setStreamError] = useState<string>("");

  const refreshSnapshot = async (): Promise<void> => {
    const [zonesRes, mapRes] = await Promise.all([fetch("/api/zones"), fetch("/api/mapping")]);
    if (!zonesRes.ok) {
      throw new Error("Failed to load zones");
    }
    if (!mapRes.ok) {
      throw new Error("Failed to load mapping");
    }

    const zonesData = (await zonesRes.json()) as { zones?: Zone[] };
    const mapData = (await mapRes.json()) as { mapping?: MappingItem[] };

    setZones((zonesData.zones || []).slice().sort(sortByPortBit));
    setMapping((mapData.mapping || []).slice().sort(sortByPortBit));
  };

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let cancelled = false;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = () => {
      clearReconnectTimer();
      setStreamState((prev) => (prev === "open" ? "reconnecting" : "connecting"));

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/dashboard?interval_ms=${encodeURIComponent(String(pollIntervalMs))}`;
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        if (cancelled) {
          socket?.close();
          return;
        }
        setStreamState("open");
        setStreamError("");
      };

      socket.onmessage = (event) => {
        if (cancelled) {
          return;
        }

        try {
          const payload = JSON.parse(event.data) as {
            zones?: Zone[];
            mapping?: MappingItem[];
          };
          setZones((payload.zones || []).slice().sort(sortByPortBit));
          setMapping((payload.mapping || []).slice().sort(sortByPortBit));
          setLastStreamMessageAt(Date.now());
          setLoading(false);
          setStreamError("");
        } catch {
          setStreamError("Received invalid stream payload");
          setStreamState("error");
        }
      };

      socket.onerror = () => {
        if (!cancelled) {
          setStreamState("error");
          setStreamError("Dashboard stream connection failed");
        }
      };

      socket.onclose = () => {
        if (cancelled) {
          return;
        }
        setStreamState("reconnecting");
        reconnectTimer = window.setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearReconnectTimer();
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [pollIntervalMs]);

  const error = actionError || streamError;

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
    onSuccess: refreshSnapshot,
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
    onSuccess: refreshSnapshot,
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
    onSuccess: refreshSnapshot,
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
    pollIntervalMs,
    setPollIntervalMs,
    streamState,
    lastStreamMessageAt,
    doPoll,
    submitRename,
    submitMapping,
  };
}
