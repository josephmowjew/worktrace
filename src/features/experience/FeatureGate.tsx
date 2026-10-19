import type { PropsWithChildren } from "react";
import { useExperience } from "./useExperience";
import { Button } from "../../components/ui/Button";
import type { OptionalFeature } from "../../types/settings";

export function FeatureGate({ feature, title, children }: PropsWithChildren<{ feature?: OptionalFeature; title: string }>) {
  const experience = useExperience();
  if (experience.isDeveloper || (feature && experience.hasFeature(feature))) return <>{children}</>;
  return <div className="mx-auto max-w-lg py-12">
    <h1>{title}</h1>
    <p className="mt-3 text-sm leading-6 text-[var(--wt-text-muted)]">{feature ? "Add this optional tool to your Essentials workspace whenever you need it." : "This tool is part of the Developer experience. Switching keeps all your tasks and existing settings."}</p>
    <Button className="mt-5" variant="primary" disabled={experience.isSaving || experience.settingsQuery.isError} onClick={() => {
      void experience.save(feature ? { enabledFeatures: [...(experience.settings?.enabledFeatures ?? []), feature] } : { experienceMode: "developer", experienceConfigured: true }).catch(() => {});
    }}>{experience.isSaving ? "Saving..." : feature ? `Enable ${title.toLowerCase()}` : "Switch to Developer"}</Button>
    {experience.saveError ? <p role="alert" className="mt-3 text-sm text-[var(--wt-danger)]">Could not save. Please try again.</p> : null}
  </div>;
}
