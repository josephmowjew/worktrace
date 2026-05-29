import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import { getSettings } from "../lib/api/settings";
import type { ThemePreference } from "../types/settings";

export type ResolvedTheme = "dark" | "light";

const THEME_QUERY_KEY = ["settings"];
const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";
export const THEME_PREVIEW_EVENT = "worktrace:theme-preview";

export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "system" ? value : "dark";
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === "system") {
    return prefersDark ? "dark" : "light";
  }

  return preference;
}

export function applyThemeToDocument(
  root: HTMLElement,
  preference: ThemePreference,
  resolvedTheme: ResolvedTheme,
) {
  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolvedTheme;
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const settingsQuery = useQuery({
    queryKey: THEME_QUERY_KEY,
    queryFn: getSettings,
    staleTime: 30_000,
  });
  const savedPreference = normalizeThemePreference(settingsQuery.data?.theme);
  const [previewPreference, setPreviewPreference] = useState<ThemePreference | null>(null);
  const preference = previewPreference ?? savedPreference;
  const [prefersDark, setPrefersDark] = useState(() => systemPrefersDark());
  const resolvedTheme = useMemo(
    () => resolveTheme(preference, prefersDark),
    [preference, prefersDark],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const query = window.matchMedia(SYSTEM_DARK_QUERY);
    setPrefersDark(query.matches);

    if (preference !== "system") {
      return;
    }

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersDark(event.matches);
    };

    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, [preference]);

  useEffect(() => {
    const handleThemePreview = (event: Event) => {
      const preference = (event as CustomEvent<ThemePreference | null>).detail;
      setPreviewPreference(preference ? normalizeThemePreference(preference) : null);
    };

    window.addEventListener(THEME_PREVIEW_EVENT, handleThemePreview);
    return () => window.removeEventListener(THEME_PREVIEW_EVENT, handleThemePreview);
  }, []);

  useEffect(() => {
    applyThemeToDocument(document.documentElement, preference, resolvedTheme);
  }, [preference, resolvedTheme]);

  return <>{children}</>;
}

function systemPrefersDark() {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(SYSTEM_DARK_QUERY).matches;
}
