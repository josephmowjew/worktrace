import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import type { PropsWithChildren } from "react";
import { SpeechProvider } from "../components/ui/SpeechProvider";
import { ToastProvider } from "../components/ui/ToastProvider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SpeechProvider>
          <ToastProvider>{children}</ToastProvider>
        </SpeechProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
