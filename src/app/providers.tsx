import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import type { PropsWithChildren } from "react";
import { SpeechProvider } from "../components/ui/SpeechProvider";
import { ToastProvider } from "../components/ui/ToastProvider";
import { WorkTraceCommandError } from "../lib/api/client";

export function shouldRetryQueryError(failureCount: number, error: unknown) {
  return !(error instanceof WorkTraceCommandError && error.code === "TAURI_RUNTIME_UNAVAILABLE") &&
    failureCount < 1;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: shouldRetryQueryError,
      staleTime: 30_000,
    },
  },
});

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SpeechProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </SpeechProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
