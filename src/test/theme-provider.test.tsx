import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ThemeProvider } from "../app/ThemeProvider";
import { getSettings } from "../lib/api/settings";

vi.mock("../lib/api/settings", () => ({
  getSettings: vi.fn(),
}));

const mockedGetSettings = vi.mocked(getSettings);

function renderThemeProvider(children: ReactNode = <div />) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>,
  );
}

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue(query),
  });

  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      listeners.forEach((listener) => listener({ matches: nextMatches } as MediaQueryListEvent));
    },
  };
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-preference");
    document.documentElement.style.colorScheme = "";
    mockedGetSettings.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies persisted dark preference", async () => {
    installMatchMedia(false);
    mockedGetSettings.mockResolvedValue({ theme: "dark" } as Awaited<ReturnType<typeof getSettings>>);

    renderThemeProvider();

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(document.documentElement.dataset.themePreference).toBe("dark");
      expect(document.documentElement.style.colorScheme).toBe("dark");
    });
  });

  it("applies persisted light preference", async () => {
    installMatchMedia(true);
    mockedGetSettings.mockResolvedValue({ theme: "light" } as Awaited<ReturnType<typeof getSettings>>);

    renderThemeProvider();

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(document.documentElement.dataset.themePreference).toBe("light");
      expect(document.documentElement.style.colorScheme).toBe("light");
    });
  });

  it("resolves system preference and reacts to system changes", async () => {
    const media = installMatchMedia(true);
    mockedGetSettings.mockResolvedValue({ theme: "system" } as Awaited<ReturnType<typeof getSettings>>);

    renderThemeProvider();

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(document.documentElement.dataset.themePreference).toBe("system");
    });

    media.setMatches(false);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(document.documentElement.dataset.themePreference).toBe("system");
      expect(document.documentElement.style.colorScheme).toBe("light");
    });
  });
});
