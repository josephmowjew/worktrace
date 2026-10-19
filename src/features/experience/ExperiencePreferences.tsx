import { Link } from "react-router-dom";
import { useExperience } from "./useExperience";
import { Button } from "../../components/ui/Button";
import type { ExperienceMode, OptionalFeature } from "../../types/settings";

const tools: Array<{ id: OptionalFeature; title: string; detail: string }> = [
  { id: "focus", title: "Focus timer", detail: "Spend a little uninterrupted time on a task." },
  { id: "journal", title: "Work journal", detail: "Keep notes about meetings, progress, and other work." },
  { id: "reports", title: "Reports", detail: "Turn your tasks and journal into a weekly update. No code required." },
];

export function ExperiencePreferences() {
  const experience = useExperience();
  const disabled = experience.isSaving || !experience.settingsQuery.isSuccess;
  function changeMode(mode: ExperienceMode) {
    void experience.save({ experienceMode: mode, experienceConfigured: true }).catch(() => {});
  }
  return <section className="space-y-5 border-b border-[var(--wt-border)] pb-6">
    <div><h2 className="text-sm font-semibold">Your experience</h2><p className="mt-1 text-xs leading-5 text-[var(--wt-text-muted)]">Choose how much you want to see. Switching keeps your tasks, history, and integration settings. Repository auto-sync runs in Developer.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">{([['essentials', 'Essentials', 'Tasks first. A quiet workspace with optional tools.'], ['developer', 'Developer', 'Tasks, code activity, repositories, and reporting.']] as const).map(([mode, title, detail]) => <button type="button" key={mode} disabled={disabled} aria-pressed={experience.mode === mode} className={`wt-experience-choice ${experience.mode === mode ? "is-active" : ""}`} onClick={() => changeMode(mode)}><span className="text-sm font-semibold">{title}</span><span className="mt-1 block text-xs leading-5 text-[var(--wt-text-muted)]">{detail}</span></button>)}</div>
    {!experience.isDeveloper ? <div><h3 className="mb-2 text-xs font-semibold">Optional tools</h3><div className="divide-y divide-[var(--wt-border)]">{tools.map((tool) => <label key={tool.id} className="flex cursor-pointer items-center justify-between gap-5 py-3"><span><span className="block text-sm font-medium">{tool.title}</span><span className="mt-1 block text-xs text-[var(--wt-text-muted)]">{tool.detail}</span></span><input type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--wt-accent)]" checked={experience.hasFeature(tool.id)} disabled={disabled} onChange={(event) => {
      const current = experience.settings?.enabledFeatures ?? [];
      void experience.save({ enabledFeatures: event.target.checked ? [...new Set([...current, tool.id])] : current.filter((id) => id !== tool.id) }).catch(() => {});
    }} /></label>)}</div></div> : <p className="text-xs text-[var(--wt-text-muted)]">Developer includes all tools. Your Essentials tool choices are kept for when you switch back.</p>}
    {experience.isSaving ? <p role="status" className="text-xs text-[var(--wt-text-muted)]">Saving preferences...</p> : null}
    {experience.saveError ? <p role="alert" className="text-xs text-[var(--wt-danger)]">Preferences could not be saved. Please try again.</p> : null}
  </section>;
}

export function EssentialsSettings({ onAdvanced }: { onAdvanced: (tab?: string) => void }) {
  const experience = useExperience();
  return <div className="mx-auto max-w-3xl space-y-7"><header className="wt-page-header"><h1>Settings</h1><p className="mt-2 text-sm text-[var(--wt-text-muted)]">Make WorkTrace work for you.</p></header>
    {experience.settingsQuery.isError ? <p role="alert" className="text-xs text-[var(--wt-danger)]">Preferences are available in the desktop app. Your changes cannot be saved in this preview.</p> : null}
    <ExperiencePreferences />
    <section className="space-y-4 border-b border-[var(--wt-border)] pb-6"><h2 className="text-sm font-semibold">Appearance</h2><label className="wt-field-label max-w-xs">Theme<select className="wt-input rounded-md px-3 py-2" value={experience.settings?.theme ?? "dark"} disabled={experience.isSaving || !experience.settingsQuery.isSuccess} onChange={(event) => void experience.save({ theme: event.target.value }).catch(() => {})}><option value="dark">Dark</option><option value="light">Light</option><option value="system">Follow system</option></select></label></section>
    <section><h2 className="text-sm font-semibold">Your data</h2><p className="mt-2 text-xs leading-5 text-[var(--wt-text-muted)]">Tasks stay on this device. Keep a backup somewhere you trust.</p><div className="mt-3 flex flex-wrap gap-2"><Link className="wt-text-link" to="/backup">Data & backups</Link><Button size="sm" variant="ghost" onClick={() => onAdvanced("portability")}>Import / export settings</Button></div></section>
    <section className="border-t border-[var(--wt-border)] pt-5"><h2 className="text-sm font-semibold">Need more control?</h2><p className="mt-2 text-xs leading-5 text-[var(--wt-text-muted)]">Profile, integrations, voice, and work preferences are available in advanced settings.</p><Button className="mt-3" size="sm" onClick={() => onAdvanced()}>Advanced settings</Button></section>
  </div>;
}
