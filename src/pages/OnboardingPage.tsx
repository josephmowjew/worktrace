import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardEdit,
  Database,
  FileText,
  FolderKanban,
  GitCommit,
  LockKeyhole,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { PageHeader } from "../components/ui/PageHeader";
import { useToast } from "../components/ui/ToastProvider";
import { useOnboardingProgress } from "../features/onboarding/useOnboardingProgress";
import { isRepositorySyncInProgressError, useRepositorySync } from "../features/repositorySync/RepositorySyncProvider";
import type { OnboardingStep, OnboardingStepId } from "../features/onboarding/onboardingSteps";
import { updateSettings } from "../lib/api/settings";

const stepIcons: Record<OnboardingStepId, React.ElementType> = {
  profile: Settings,
  projects: FolderKanban,
  sync: GitCommit,
  capture: ClipboardEdit,
  report: FileText,
};

export function OnboardingPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const repositorySync = useRepositorySync();
  const { progress, settingsQuery, projectsQuery, isLoading, weekRange } = useOnboardingProgress();

  const onboardingMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error) => {
      toast.error("Onboarding update failed", error instanceof Error ? error.message : "Could not update setup progress.");
    },
  });
  async function handleSyncRepositories() {
    try {
      const result = await repositorySync.syncRepositories(
        {
          from: null,
          to: null,
          authorEmail: settingsQuery.data?.gitAuthorEmail || null,
        },
        {
          scope: "onboarding",
          onAlreadyRunning: () => toast.info("Sync already running", "Repository activity is still being refreshed."),
        },
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["weeklyTasks"] }),
      ]);
      await markStep("sync");
      toast.success(
        "Sync complete",
        `Added ${result.newCommits} commits and updated ${result.updatedCommits}.`,
      );
    } catch (error) {
      if (isRepositorySyncInProgressError(error)) return;
      toast.error("Sync failed", error instanceof Error ? error.message : "Repository sync could not be completed.");
    }
  }

  async function markStep(stepId: OnboardingStepId) {
    const existing = settingsQuery.data?.onboardingCompletedSteps ?? [];
    if (existing.includes(stepId)) return;
    await onboardingMutation.mutateAsync({
      onboardingCompletedSteps: [...existing, stepId],
    });
  }

  async function finishOnboarding() {
    await onboardingMutation.mutateAsync({
      onboardingCompleted: true,
      onboardingDismissedWelcome: true,
      onboardingDismissedChecklist: true,
      onboardingCompletedSteps: progress.steps.map((step) => step.id),
      onboardingCompletedAt: new Date().toISOString(),
    });
    navigate("/", { replace: true });
  }

  async function leaveOnboarding() {
    await onboardingMutation.mutateAsync({
      onboardingDismissedWelcome: true,
      onboardingDismissedChecklist: true,
    });
    navigate("/", { replace: true });
  }

  async function handlePrimaryExit() {
    if (progress.isComplete) {
      await finishOnboarding();
      return;
    }

    await leaveOnboarding();
  }

  function runStep(step: OnboardingStep) {
    if (step.id === "profile") {
      navigate("/settings");
      return;
    }
    if (step.id === "projects") {
      navigate("/projects", { state: { openWorkspaceScan: true } });
      return;
    }
    if (step.id === "sync") {
      if (!progress.hasSyncableProjects) {
        navigate("/projects", { state: { openWorkspaceScan: true } });
        return;
      }
      void handleSyncRepositories();
      return;
    }
    if (step.id === "capture") {
      navigate("/", { state: { openManualLog: true } });
      return;
    }
    markStep("report");
    navigate("/", { state: { openReportPrep: true } });
  }

  const activeStep = progress.nextStep ?? progress.steps[progress.steps.length - 1];
  const activeProjects = (projectsQuery.data ?? []).filter((project) => project.status === "active");

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Sparkles}
        eyebrow="First run"
        title="Set up your reporting trail"
        description={`${weekRange.label} / local evidence stays on this machine`}
        actions={
          <>
            <Button
              variant="ghost"
              onClick={leaveOnboarding}
              disabled={onboardingMutation.isPending}
            >
              Skip setup
            </Button>
            <Button
              variant="primary"
              onClick={handlePrimaryExit}
              disabled={onboardingMutation.isPending}
            >
              <CheckCircle2 className="h-4 w-4" />
              {progress.isComplete ? "Finish" : "Start using WorkTrace"}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Panel className="p-0">
          <div className="border-b border-[var(--wt-border)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--wt-text-strong)]">Activation path</h2>
                <p className="mt-1 text-xs text-[var(--wt-text-muted)]">
                  {progress.completedCount} of {progress.steps.length} steps complete.
                </p>
              </div>
              <Badge tone={progress.isComplete ? "green" : "blue"}>{progress.isComplete ? "Ready" : "In progress"}</Badge>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--wt-surface-muted)]">
              <div
                className="h-full rounded-full bg-blue-500 transition-[width] duration-200 ease-out"
                style={{ width: `${(progress.completedCount / progress.steps.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="space-y-2 p-3">
            {progress.steps.map((step, index) => (
              <StepRow
                key={step.id}
                step={step}
                index={index}
                active={activeStep?.id === step.id}
                isBusy={repositorySync.isSyncing && step.id === "sync"}
                onRun={() => runStep(step)}
              />
            ))}
          </div>
        </Panel>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Panel className="min-h-[520px] p-0">
            <div className="border-b border-[var(--wt-border)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-blue-500/15 bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-200">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Local-first setup
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight text-[var(--wt-text-strong)]">
                    {activeStep?.done ? "Your report trail is coming together" : activeStep?.title}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--wt-text-muted)]">
                    {activeStep?.done
                      ? "WorkTrace now has enough signal to keep building the week in the background."
                      : activeStep?.detail}
                  </p>
                </div>
                {activeStep ? (
                  <div className="flex flex-wrap gap-2">
                    {activeStep.id === "profile" && !activeStep.done ? (
                      <Button
                        variant="secondary"
                        onClick={() => markStep("profile")}
                        disabled={onboardingMutation.isPending}
                      >
                        Skip profile
                      </Button>
                    ) : null}
                    <Button
                      variant="primary"
                      onClick={() => runStep(activeStep)}
                      disabled={activeStep.disabled || repositorySync.isSyncing || activeStep.done}
                    >
                      {activeStep.id === "sync" && repositorySync.isSyncing ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                      {activeStep.done ? "Done" : activeStep.action}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-3">
              <EvidenceTile icon={FolderKanban} label="Active projects" value={activeProjects.length.toString()} done={progress.projectsComplete} />
              <EvidenceTile icon={GitCommit} label="Local commits" value={progress.commitCount.toString()} done={progress.syncComplete} />
              <EvidenceTile icon={ClipboardEdit} label="Manual logs" value={progress.manualLogCount.toString()} done={progress.captureComplete} />
            </div>

            <div className="px-5 pb-5">
              <div className="rounded-2xl border border-[var(--wt-border)] bg-[var(--wt-surface-muted)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--wt-text-strong)]">Report preview signal</h3>
                    <p className="mt-1 text-xs text-[var(--wt-text-muted)]">
                      A useful first report needs source evidence and one piece of human context.
                    </p>
                  </div>
                  <Badge tone={progress.reportReadyCount > 0 ? "green" : "slate"}>
                    {progress.reportReadyCount} ready
                  </Badge>
                </div>

                <div className="mt-4 space-y-3">
                  <PreviewLine done={progress.syncComplete} text="Commit evidence synced from local repositories" />
                  <PreviewLine done={progress.captureComplete} text="Manual context captured for work Git cannot see" />
                  <PreviewLine done={progress.reportComplete} text="Weekly report preview opened" />
                </div>
              </div>
            </div>
          </Panel>

          <aside className="space-y-4">
            <Panel>
              <div className="flex items-center gap-2">
                <LockKeyhole className="h-4 w-4 text-cyan-300" />
                <h3 className="text-sm font-semibold text-[var(--wt-text-strong)]">Privacy boundary</h3>
              </div>
              <p className="mt-3 text-xs leading-5 text-[var(--wt-text-muted)]">
                This setup reads local projects and local settings. Online integrations stay off until you configure them.
              </p>
            </Panel>

            <Panel>
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-blue-300" />
                <h3 className="text-sm font-semibold text-[var(--wt-text-strong)]">Recommended next</h3>
              </div>
              <div className="mt-3 space-y-2 text-xs text-[var(--wt-text-muted)]">
                <p>After the report preview, tune background tray access, backups, calendar, and optional AI providers from Settings.</p>
                <Button className="mt-2 w-full" onClick={() => navigate("/settings")}>
                  Open Settings
                </Button>
              </div>
            </Panel>

            {isLoading ? (
              <Panel className="text-xs text-[var(--wt-text-muted)]">Loading setup evidence...</Panel>
            ) : null}
          </aside>
        </section>
      </div>
    </div>
  );
}

function StepRow({
  step,
  index,
  active,
  isBusy,
  onRun,
}: {
  step: OnboardingStep;
  index: number;
  active: boolean;
  isBusy: boolean;
  onRun: () => void;
}) {
  const Icon = stepIcons[step.id];

  return (
    <button
      type="button"
      aria-current={active ? "step" : undefined}
      onClick={onRun}
      disabled={step.disabled && !step.done}
      className={[
        "grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/55 disabled:cursor-not-allowed disabled:opacity-55",
        active
          ? "border-blue-400/35 bg-blue-500/10 shadow-[0_12px_32px_rgba(37,99,235,0.14)]"
          : "border-[var(--wt-border)] bg-[var(--wt-surface-muted)] hover:border-blue-400/25",
      ].join(" ")}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--wt-border)] bg-[var(--wt-surface)]">
        {step.done ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Icon className="h-4 w-4 text-blue-300" />}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-[var(--wt-text-muted)]">{index + 1}</span>
          <span className="truncate text-sm font-semibold text-[var(--wt-text-strong)]">{step.title}</span>
        </span>
        <span className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--wt-text-muted)]">{step.detail}</span>
      </span>
      <span className="text-xs font-semibold text-[var(--wt-text-muted)]">
        {isBusy ? "Syncing" : step.done ? "Done" : step.action}
      </span>
    </button>
  );
}

function EvidenceTile({
  icon: Icon,
  label,
  value,
  done,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  done: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--wt-border)] bg-[var(--wt-surface-muted)] p-4">
      <div className="flex items-center justify-between gap-3">
        <Icon className={done ? "h-4 w-4 text-emerald-300" : "h-4 w-4 text-blue-300"} />
        {done ? <Badge tone="green">Detected</Badge> : <Badge>Waiting</Badge>}
      </div>
      <p className="mt-4 text-2xl font-semibold text-[var(--wt-text-strong)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--wt-text-muted)]">{label}</p>
    </div>
  );
}

function PreviewLine({ done, text }: { done: boolean; text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <CheckCircle2 className={done ? "h-4 w-4 text-emerald-300" : "h-4 w-4 text-[var(--wt-text-muted)]"} />
      <span className={done ? "text-[var(--wt-text-strong)]" : "text-[var(--wt-text-muted)]"}>{text}</span>
    </div>
  );
}
