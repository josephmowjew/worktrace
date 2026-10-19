import { ArrowRight, Check, Code2, ListTodo } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useExperience } from "./useExperience";
import type { ExperienceMode } from "../../types/settings";
import { Button } from "../../components/ui/Button";

export function ExperienceWelcome() {
  const experience = useExperience();
  const navigate = useNavigate();
  async function choose(mode: ExperienceMode) {
    try {
      await experience.save({
        experienceMode: mode,
        experienceConfigured: true,
        ...(mode === "essentials" ? { onboardingCompleted: true, onboardingDismissedWelcome: true, onboardingDismissedChecklist: true } : {}),
      });
      navigate(mode === "developer" ? "/onboarding" : "/", { replace: true });
    } catch { /* The inline error keeps the choice visible and retryable. */ }
  }
  return <div className="wt-welcome mx-auto max-w-2xl py-8 sm:py-14">
    <span className="text-xs font-medium text-[var(--wt-text-muted)]">Welcome to WorkTrace</span>
    <h1 className="mt-3">Make room for what matters.</h1>
    <p className="mt-3 max-w-lg text-sm leading-6 text-[var(--wt-text-muted)]">What would you like WorkTrace to help you with? You can change this anytime.</p>
    <div className="mt-8 divide-y divide-[var(--wt-border)] border-y border-[var(--wt-border)]">
      <div className="flex items-start gap-4 py-6">
        <ListTodo className="mt-1 h-5 w-5 shrink-0 text-[var(--wt-text-muted)]" />
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold">Organize my tasks</h2><span className="wt-small-label">Recommended</span></div><p className="mt-2 text-sm leading-6 text-[var(--wt-text-muted)]">A clear daily list. Add a task, finish it, and keep going. No setup required.</p><Button className="mt-4" variant="primary" disabled={experience.isSaving || experience.settingsQuery.isError} onClick={() => void choose("essentials")}>Start with Essentials <ArrowRight size={14} /></Button></div>
      </div>
      <div className="flex items-start gap-4 py-6">
        <Code2 className="mt-1 h-5 w-5 shrink-0 text-[var(--wt-text-muted)]" />
        <div className="min-w-0 flex-1"><h2 className="text-base font-semibold">Track development work</h2><p className="mt-2 text-sm leading-6 text-[var(--wt-text-muted)]">Tasks, repositories, code activity, and weekly reports, together in one workspace.</p><Button className="mt-4" disabled={experience.isSaving || experience.settingsQuery.isError} onClick={() => void choose("developer")}>Use Developer <ArrowRight size={14} /></Button></div>
      </div>
    </div>
    <p className="mt-5 flex items-center gap-2 text-xs text-[var(--wt-text-muted)]"><Check size={13} />Your work stays on this device. No account needed.</p>
    {experience.saveError ? <p role="alert" className="mt-4 text-sm text-[var(--wt-danger)]">Could not save your choice. Please try again.</p> : null}
    {experience.settingsQuery.isError ? <p className="mt-4 text-xs text-[var(--wt-text-muted)]">Open WorkTrace on your desktop to save your experience.</p> : null}
  </div>;
}
