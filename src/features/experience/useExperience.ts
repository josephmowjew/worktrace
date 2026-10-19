import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getSettings, updateSettings } from "../../lib/api/settings";
import type { ExperienceMode, OptionalFeature, Settings } from "../../types/settings";

export function experienceMode(settings?: Partial<Settings>): ExperienceMode {
  // Old clients/exports retain their established workflow. A failed browser query
  // can preview Essentials, but never pretends that a preference was saved.
  if (!settings) return "essentials";
  return settings.experienceMode === "essentials" ? "essentials" : "developer";
}

export function featureEnabled(settings: Partial<Settings> | undefined, feature: OptionalFeature) {
  return experienceMode(settings) === "developer" || Boolean(settings?.enabledFeatures?.includes(feature));
}

export function useExperience() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(["settings"], settings);
    },
  });
  return {
    settingsQuery,
    settings: settingsQuery.data,
    mode: experienceMode(settingsQuery.data),
    isDeveloper: experienceMode(settingsQuery.data) === "developer",
    hasFeature: (feature: OptionalFeature) => featureEnabled(settingsQuery.data, feature),
    save: mutation.mutateAsync,
    isSaving: mutation.isPending,
    saveError: mutation.error,
  };
}

export function useExperienceChanges() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen("experience://changed", () => void queryClient.invalidateQueries({ queryKey: ["settings"] }))
      .then((cleanup) => { if (disposed) cleanup(); else unlisten = cleanup; }).catch(() => {});
    return () => { disposed = true; unlisten?.(); };
  }, [queryClient]);
}
