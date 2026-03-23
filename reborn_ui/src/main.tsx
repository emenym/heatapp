import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import App from "./App";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
    },
  },
});

if (import.meta.env.DEV && typeof window !== "undefined" && "performance" in window) {
  // React's development build emits many User Timing entries.
  // Clearing periodically avoids unbounded PerformanceMeasure growth in long-lived tabs.
  window.setInterval(() => {
    window.performance.clearMeasures();
    window.performance.clearMarks();
  }, 30000);
}

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element not found");
}

createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
);
