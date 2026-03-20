import { createContext, ReactNode, useContext } from "react";
import { useDashboardData } from "@/components/dashboard/useDashboardData";

type DashboardContextValue = ReturnType<typeof useDashboardData>;

const DashboardContext = createContext<DashboardContextValue | null>(null);

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
    throw new Error("useDashboardContext must be used within DashboardProvider");
  }
  return context;
}