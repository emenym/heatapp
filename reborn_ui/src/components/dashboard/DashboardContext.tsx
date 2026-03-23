import { createContext, ReactNode, useContext } from "react";
import { useDashboardData } from "@/components/dashboard/useDashboardData";

type DashboardContextValue = ReturnType<typeof useDashboardData>;

const DashboardContext = createContext<DashboardContextValue | null>(null);

const fallbackContext: DashboardContextValue = {
  zones: [],
  mapping: [],
  loading: true,
  error: "",
  renameDraft: {},
  mapForm: {
    port: "PORTA",
    bit: 0,
    zone_key: "",
    zone_name: "",
    enabled: true,
  },
  zoneCount: 0,
  onlineCount: 0,
  setRenameDraft: () => {},
  setMapForm: () => {},
  pollIntervalMs: 10000,
  setPollIntervalMs: () => {},
  doPoll: async () => {},
  submitRename: async () => {},
  submitMapping: async () => {},
};

type DashboardProviderProps = {
  children: ReactNode;
};

export function DashboardProvider({ children }: DashboardProviderProps) {
  const value = useDashboardData();
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboardContext() {
  const context = useContext(DashboardContext);
  if (!context) {
    if (typeof window !== "undefined") {
      console.warn("Dashboard context unavailable, using fallback state.");
    }
    return fallbackContext;
  }
  return context;
}