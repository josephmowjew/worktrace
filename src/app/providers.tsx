import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import type { PropsWithChildren } from "react";
import { SpeechProvider } from "../components/ui/SpeechProvider";
import { ToastProvider } from "../components/ui/ToastProvider";
import { WorkTraceCommandError } from "../lib/api/client";
import { ThemeProvider } from "./ThemeProvider";
import { RepositorySyncProvider } from "../features/repositorySync/RepositorySyncProvider";
import { useExperienceChanges } from "../features/experience/useExperience";
import { useTaskChanges } from "../hooks/useTaskChanges";

export function shouldRetryQueryError(failureCount: number, error: unknown) {
  return !(error instanceof WorkTraceCommandError && error.code === "TAURI_RUNTIME_UNAVAILABLE") &&
    failureCount < 1;
}

export function createAppQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        // Commands reach the local Tauri process, including when the device is offline.
        networkMode: "always",
        refetchOnWindowFocus: false,
        retry: shouldRetryQueryError,
        staleTime: 30_000,
      },
      mutations: { networkMode: "always" },
    },
  });
  // Screens share this preference query. A failed read must not repeatedly
  // remount the first-run gate as each screen subscribes to settings.
  client.setQueryDefaults(["settings"], { retryOnMount: false });
  return client;
}

const queryClient = createAppQueryClient();

function LocalWorkspaceUpdates() {
  useExperienceChanges();
  useTaskChanges();
  return null;
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <LocalWorkspaceUpdates />
      <RepositorySyncProvider>
        <ThemeProvider>
          <BrowserRouter>
            <SpeechProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </SpeechProvider>
          </BrowserRouter>
        </ThemeProvider>
      </RepositorySyncProvider>
    </QueryClientProvider>
  );
}
