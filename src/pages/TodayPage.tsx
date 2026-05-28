import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CheckCheck,
  ClipboardEdit,
  FileText,
  Focus,
  GitCommit,
  Layers3,
  ListChecks,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AddTaskModal } from "../components/ui/AddTaskModal";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { CarryoverAssistant } from "../components/ui/CarryoverAssistant";
import { EndOfDayReviewModal } from "../components/ui/EndOfDayReviewModal";
import { FocusSessionPanel } from "../components/ui/FocusSessionPanel";
import { NudgePanel, type TodayNudge } from "../components/ui/NudgePanel";
import { Panel } from "../components/ui/Panel";
import { PageHeader } from "../components/ui/PageHeader";
import { PrepareReportModal } from "../components/ui/PrepareReportModal";
import { QuickManualLogModal } from "../components/ui/QuickManualLogModal";
import { StopFocusModal } from "../components/ui/StopFocusModal";
import { TodayQuickAddBar } from "../components/ui/TodayQuickAddBar";
import { useSpeech } from "../components/ui/SpeechProvider";
import { useToast } from "../components/ui/ToastProvider";
import { listActivity } from "../lib/api/activity";
import {
  cancelFocusSession,
  getActiveFocusSession,
  listFocusSessions,
  startFocusSession,
  stopFocusSession,
} from "../lib/api/focusSessions";
import { syncCommits } from "../lib/api/gitSync";
import { createManualLog } from "../lib/api/manualLogs";
import { listManualLogs } from "../lib/api/manualLogs";
import { dismissNudge, listNudgeDismissals } from "../lib/api/nudges";
import { listProjects } from "../lib/api/projects";
import { listReportNotes, listReports, saveDailyReviewNote } from "../lib/api/reports";
import { getSettings, updateSettings } from "../lib/api/settings";
import { listWorkspaces } from "../lib/api/workspaces";
import { getWeekCapacity } from "../lib/api/calendar";
import {
  getTodayCommandCenter,
  replaceDailyPlanItems,
  updateDailyPlanItem,
  upsertDailyPlan,
} from "../lib/api/dailyPlan";
import { weeklyTaskQueryRoots } from "../lib/api/queryKeys";
import {
  manualLogAnnouncement,
  syncAnnouncement,
  syncStartedAnnouncement,
  taskAnnouncement,
  taskUpdateAnnouncement,
} from "../lib/announcements";
import { createWeeklyTask, listWeeklyTasks, updateWeeklyTask } from "../lib/api/weeklyTasks";
import { currentWeekRange, todayRange } from "../lib/dates";
import type { CreateManualLogInput } from "../types/manualLog";
import type { StopFocusSessionInput } from "../types/focusSession";
import type { WeeklyTask, WeeklyTaskPriority, WeeklyTaskStatus, WeeklyTaskType } from "../types/weeklyTask";
import type { DailyPlanItem } from "../types/dailyPlan";

type LocationState = {
  openTask?: boolean;
  openManualLog?: boolean;
  openFocus?: boolean;
  openReview?: boolean;
  openReportPrep?: boolean;
  powerCommand?: string;
} | null;

export function TodayPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const speech = useSpeech();
  const navigate = useNavigate();
  const location = useLocation();
  const weekRange = currentWeekRange();
  const today = todayRange();
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reportPrepOpen, setReportPrepOpen] = useState(false);
  const [stopFocusOpen, setStopFocusOpen] = useState(false);
  const [priorityDraft, setPriorityDraft] = useState<Array<{ title: string; plannedMinutes: string; weeklyTaskId?: string }>>([]);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });
  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: listWorkspaces,
  });
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  const tasksQuery = useQuery({
    queryKey: ["weeklyTasks", weekRange.from, weekRange.to, "today"],
    queryFn: () =>
      listWeeklyTasks({
        weekStartDate: weekRange.from,
        weekEndDate: weekRange.to,
      }),
  });
  const capacityQuery = useQuery({
    queryKey: ["weekCapacity", weekRange.from, weekRange.to, "today"],
    queryFn: () =>
      getWeekCapacity({
        weekStartDate: weekRange.from,
        weekEndDate: weekRange.to,
      }),
  });
  const activityQuery = useQuery({
    queryKey: ["activity", today.from, today.to, "today"],
    queryFn: () =>
      listActivity({
        from: today.from,
        to: today.to,
      }),
  });
  const weekActivityQuery = useQuery({
    queryKey: ["activity", weekRange.from, weekRange.to, "onboarding"],
    queryFn: () =>
      listActivity({
        from: weekRange.from,
        to: weekRange.to,
      }),
  });
  const manualLogsQuery = useQuery({
    queryKey: ["manualLogs", weekRange.from, weekRange.to, "onboarding"],
    queryFn: () =>
      listManualLogs({
        from: weekRange.from,
        to: weekRange.to,
      }),
  });
  const reportsQuery = useQuery({
    queryKey: ["reports", "onboarding"],
    queryFn: listReports,
  });
  const activeFocusQuery = useQuery({
    queryKey: ["focusSession", "active"],
    queryFn: getActiveFocusSession,
    refetchInterval: 5_000,
  });
  const focusSessionsQuery = useQuery({
    queryKey: ["focusSessions", today.from, today.to, "today"],
    queryFn: () =>
      listFocusSessions({
        from: today.from,
        to: today.to,
      }),
  });
  const dailyReviewNotesQuery = useQuery({
    queryKey: ["reportNotes", today.date, "dailyReview"],
    queryFn: () =>
      listReportNotes({
        from: today.date,
        to: today.date,
      }),
  });
  const nudgeDismissalsQuery = useQuery({
    queryKey: ["nudgeDismissals", today.date, "today"],
    queryFn: () =>
      listNudgeDismissals({
        dismissedForDate: today.date,
        scope: "today",
      }),
  });
  const commandCenterQuery = useQuery({
    queryKey: ["todayCommandCenter", today.date],
    queryFn: () => getTodayCommandCenter({ date: today.date }),
  });

  useEffect(() => {
    const state = location.state as LocationState;
    if (state?.openReview) {
      setReviewOpen(true);
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    if (state?.openTask) {
      setTaskModalOpen(true);
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    if (state?.openManualLog) {
      setLogModalOpen(true);
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    if (state?.openFocus) {
      window.setTimeout(() => {
        document.getElementById("focus-session-panel")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    if (state?.openReportPrep) {
      setReportPrepOpen(true);
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    if (state?.powerCommand) {
      handlePowerCommand(state.powerCommand);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    const source = commandCenterQuery.data?.topPriorities ?? [];
    if (!source.length) {
      setPriorityDraft([
        { title: "", plannedMinutes: "" },
        { title: "", plannedMinutes: "" },
        { title: "", plannedMinutes: "" },
      ]);
      return;
    }
    const next = Array.from({ length: 3 }, (_, index) => source[index]).map((item) => ({
      title: item?.title ?? "",
      plannedMinutes: item?.plannedMinutes ? String(item.plannedMinutes) : "",
      weeklyTaskId: item?.weeklyTaskId ?? undefined,
    }));
    setPriorityDraft(next);
  }, [commandCenterQuery.data?.topPriorities]);

  async function invalidateDailyViews() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["activity"] }),
      queryClient.invalidateQueries({ queryKey: ["manualLogs"] }),
      queryClient.invalidateQueries({ queryKey: ["reports"] }),
      queryClient.invalidateQueries({ queryKey: ["reportNotes"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["weekCapacity"] }),
      queryClient.invalidateQueries({ queryKey: ["focusSession"] }),
      queryClient.invalidateQueries({ queryKey: ["focusSessions"] }),
      queryClient.invalidateQueries({ queryKey: ["nudgeDismissals"] }),
      ...weeklyTaskQueryRoots.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    ]);
  }

  const syncMutation = useMutation({
    mutationFn: () =>
      syncCommits({
        from: null,
        to: null,
        authorEmail: settingsQuery.data?.gitAuthorEmail || null,
      }),
    onMutate: () => {
      speech.announce(syncStartedAnnouncement("today's activity"), { category: "sync" });
    },
    onSuccess: async (result) => {
      await invalidateDailyViews();
      toast.success(
        "Sync complete",
        `Added ${result.newCommits} commits and updated ${result.updatedCommits}.`,
      );
      speech.announce(syncAnnouncement(result), { category: "sync" });
      if (result.errors.length) {
        toast.error("Some repositories did not sync", result.errors.join(" "));
      }
    },
    onError: (error) => {
      toast.error("Sync failed", error instanceof Error ? error.message : "Repository sync could not be completed.");
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: (values: {
      title: string;
      taskType?: WeeklyTaskType;
      status?: WeeklyTaskStatus;
      projectId?: string;
      priority: WeeklyTaskPriority;
      details?: string;
      weekStartDate: string;
      targetDate?: string;
      completedAt?: string;
      includedInReport?: boolean;
      progressPercent?: number;
      estimatedMinutes?: number;
    }) =>
      createWeeklyTask({
        title: values.title,
        taskType: values.taskType || "planned_work",
        status: values.status || "todo",
        projectId: values.projectId || null,
        priority: values.priority,
        details: values.details || null,
        weekStartDate: values.weekStartDate,
        targetDate: values.targetDate || null,
        completedAt: values.completedAt || null,
        includedInReport: values.includedInReport ?? false,
        progressPercent: values.progressPercent,
        estimatedMinutes: values.estimatedMinutes,
      }),
    onSuccess: async (task) => {
      await invalidateDailyViews();
      setTaskModalOpen(false);
      toast.success("Task added");
      speech.announce(taskAnnouncement("Task added", task, { projectName: task.projectName }), {
        category: "task",
      });
    },
    onError: (error) => {
      toast.error("Task save failed", error instanceof Error ? error.message : "The task could not be saved.");
    },
  });

  const createLogMutation = useMutation({
    mutationFn: (input: CreateManualLogInput) => createManualLog(input),
    onSuccess: async (log, input) => {
      await invalidateDailyViews();
      setLogModalOpen(false);
      toast.success("Manual log saved");
      speech.announce(
        manualLogAnnouncement("Manual log saved", log, projectNameFor(input.projectId, projectsQuery.data)),
        { category: "general" },
      );
    },
    onError: (error) => {
      toast.error("Manual log failed", error instanceof Error ? error.message : "The log could not be saved.");
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateWeeklyTask>[1] }) =>
      updateWeeklyTask(id, input),
    onSuccess: async (task, variables) => {
      await invalidateDailyViews();
      toast.success("Task updated");
      speech.announce(taskUpdateAnnouncement(task, variables.input, { projectName: task.projectName }), {
        category: "task",
      });
    },
    onError: (error) => {
      toast.error("Task update failed", error instanceof Error ? error.message : "The task could not be updated.");
    },
  });
  const saveDailyReviewMutation = useMutation({
    mutationFn: saveDailyReviewNote,
    onSuccess: async () => {
      await invalidateDailyViews();
      toast.success("Daily review saved", "It will appear in the weekly report notes.");
      speech.announce("Daily review saved. It will appear in the weekly report notes.", {
        category: "general",
      });
    },
    onError: (error) => {
      toast.error("Review save failed", error instanceof Error ? error.message : "The daily review could not be saved.");
    },
  });
  const startFocusMutation = useMutation({
    mutationFn: startFocusSession,
    onSuccess: async () => {
      await invalidateDailyViews();
      toast.success("Focus session started");
      speech.announce("Focus session started.", { category: "focus", interrupt: true });
    },
    onError: (error) => {
      toast.error("Focus failed", error instanceof Error ? error.message : "Focus session could not start.");
    },
  });
  const stopFocusMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: StopFocusSessionInput }) =>
      stopFocusSession(id, input),
    onSuccess: async () => {
      await invalidateDailyViews();
      setStopFocusOpen(false);
      toast.success("Focus session stopped");
      speech.announce("Focus session stopped.", { category: "focus", interrupt: true });
    },
    onError: (error) => {
      toast.error("Stop focus failed", error instanceof Error ? error.message : "Focus session could not be stopped.");
    },
  });
  const cancelFocusMutation = useMutation({
    mutationFn: cancelFocusSession,
    onSuccess: async () => {
      await invalidateDailyViews();
      toast.success("Focus session cancelled");
      speech.announce("Focus session cancelled.", { category: "focus", interrupt: true });
    },
    onError: (error) => {
      toast.error("Cancel focus failed", error instanceof Error ? error.message : "Focus session could not be cancelled.");
    },
  });
  const dismissNudgeMutation = useMutation({
    mutationFn: (nudgeKey: string) =>
      dismissNudge({
        nudgeKey,
        scope: "today",
        dismissedForDate: today.date,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["nudgeDismissals", today.date, "today"] });
    },
    onError: (error) => {
      toast.error("Nudge dismiss failed", error instanceof Error ? error.message : "The nudge could not be dismissed.");
    },
  });
  const onboardingMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error) => {
      toast.error("Onboarding update failed", error instanceof Error ? error.message : "Could not update setup progress.");
    },
  });
  const replacePrioritiesMutation = useMutation({
    mutationFn: (items: Array<{ rank: number; title: string; weeklyTaskId?: string; plannedMinutes?: number }>) =>
      replaceDailyPlanItems({
        date: today.date,
        items,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["todayCommandCenter", today.date] });
      toast.success("Top priorities updated");
    },
    onError: (error) => {
      toast.error("Priority update failed", error instanceof Error ? error.message : "Could not update top priorities.");
    },
  });
  const updatePriorityMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateDailyPlanItem>[1] }) =>
      updateDailyPlanItem(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["todayCommandCenter", today.date] });
    },
    onError: (error) => {
      toast.error("Priority update failed", error instanceof Error ? error.message : "Could not update priority item.");
    },
  });
  const updateFocusGoalMutation = useMutation({
    mutationFn: (minutes: number) =>
      upsertDailyPlan({
        date: today.date,
        focusGoalMinutes: minutes,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["todayCommandCenter", today.date] });
      toast.success("Focus goal updated");
    },
    onError: (error) => {
      toast.error("Focus goal update failed", error instanceof Error ? error.message : "Could not update focus goal.");
    },
  });

  const projects = (projectsQuery.data ?? []).filter((project) => project.status === "active");
  const tasks = tasksQuery.data ?? [];
  const days = activityQuery.data ?? [];
  const activityItems = days.flatMap((day) => day.items);
  const focusSessions = focusSessionsQuery.data ?? [];
  const dailyReviewNote = (dailyReviewNotesQuery.data ?? []).find((note) => note.noteType === "daily_review") ?? null;
  const todayTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.status !== "completed" &&
          task.status !== "dropped" &&
          (!task.targetDate || task.targetDate <= today.date),
      ),
    [tasks, today.date],
  );
  const reviewTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.completedAt === today.date ||
          task.status === "blocked" ||
          task.taskType === "carryover" ||
          (
            task.status !== "completed" &&
            task.status !== "dropped" &&
            (!task.targetDate || task.targetDate <= today.date)
          ),
      ),
    [tasks, today.date],
  );
  const inProgress = todayTasks.filter((task) => task.status === "in_progress");
  const blockers = tasks.filter((task) => task.status === "blocked");
  const planned = todayTasks.filter((task) => task.status === "todo");
  const previousOpenTasks = tasks.filter(
    (task) =>
      task.weekStartDate < weekRange.from &&
      (task.status === "todo" || task.status === "in_progress" || task.status === "blocked"),
  );
  const reportReadyCount =
    activityItems.filter((item) => item.includedInReport).length +
    tasks.filter((task) => task.includedInReport).length;
  const persistedOnboardingSteps = new Set(settingsQuery.data?.onboardingCompletedSteps ?? []);
  const weekActivityItems = weekActivityQuery.data?.flatMap((day) => day.items) ?? [];
  const profileComplete = Boolean(
    settingsQuery.data &&
      settingsQuery.data.name.trim() &&
      settingsQuery.data.email.trim() &&
      settingsQuery.data.name !== "John Developer" &&
      settingsQuery.data.email !== "johndev@worktrace.app",
  );
  const projectsComplete =
    projects.length > 0 ||
    (workspacesQuery.data ?? []).some((workspace) => workspace.status === "active") ||
    persistedOnboardingSteps.has("projects");
  const syncComplete =
    weekActivityItems.some((item) => item.activityType === "commit") ||
    persistedOnboardingSteps.has("sync");
  const captureComplete =
    manualLogsQuery.data?.length ? true : tasks.length > 0 || persistedOnboardingSteps.has("capture");
  const reportComplete =
    reportsQuery.data?.length ? true : persistedOnboardingSteps.has("report");
  const onboardingSteps = [
    {
      id: "profile",
      title: "Complete profile basics",
      detail: "Set your name, email, manager, and Git author email so reports read cleanly.",
      action: "Open Settings",
      done: profileComplete || persistedOnboardingSteps.has("profile"),
      onAction: () => navigate("/settings"),
    },
    {
      id: "projects",
      title: "Add a project or workspace",
      detail: "Point WorkTrace at a Git repo or workspace root so it can discover real work.",
      action: "Add Projects",
      done: projectsComplete,
      onAction: () => navigate("/projects", { state: { openWorkspaceScan: true } }),
    },
    {
      id: "sync",
      title: "Sync commits",
      detail: "Pull local Git activity into this week so the report has source material.",
      action: "Sync Now",
      done: syncComplete,
      onAction: () => syncMutation.mutate(),
      disabled: !projects.some((project) => Boolean(project.repoPath)) || syncMutation.isPending,
    },
    {
      id: "capture",
      title: "Capture one non-code item",
      detail: "Add a task or quick log for meetings, support, research, QA, or planning.",
      action: "Quick Log",
      done: captureComplete,
      onAction: () => setLogModalOpen(true),
    },
    {
      id: "report",
      title: "Preview the weekly report",
      detail: "Open report prep and make sure the trail can become a polished update.",
      action: "Prep Report",
      done: reportComplete,
      onAction: () => {
        markOnboardingStep("report");
        setReportPrepOpen(true);
      },
    },
  ];
  const onboardingDoneCount = onboardingSteps.filter((step) => step.done).length;
  const onboardingIsComplete = onboardingDoneCount === onboardingSteps.length;
  const hasMeaningfulSetup =
    projectsComplete || syncComplete || captureComplete || reportComplete || profileComplete;
  const showWelcomeModal =
    Boolean(settingsQuery.data) &&
    !settingsQuery.data?.onboardingDismissedWelcome &&
    !settingsQuery.data?.onboardingCompleted &&
    !hasMeaningfulSetup;
  const showOnboardingPanel =
    Boolean(settingsQuery.data) &&
    !settingsQuery.data?.onboardingCompleted &&
    !settingsQuery.data?.onboardingDismissedChecklist;
  const dismissedNudgeKeys = new Set((nudgeDismissalsQuery.data ?? []).map((dismissal) => dismissal.nudgeKey));
  const activeNudges = buildTodayNudges({
    activityCount: activityItems.length,
    blockerCount: blockers.length,
    reportReadyCount,
    hasSyncableProjects: projects.some((project) => Boolean(project.repoPath)),
    hasPreviousOpenTasks: previousOpenTasks.length > 0,
    staleInProgressCount: inProgress.filter((task) => task.updatedAt.slice(0, 10) < today.date).length,
    focusStartedAt: activeFocusQuery.data?.startedAt ?? null,
    onSync: () => syncMutation.mutate(),
    onQuickLog: () => setLogModalOpen(true),
    onReview: () => setReviewOpen(true),
    onReportPrep: () => setReportPrepOpen(true),
    onCarryover: () => document.getElementById("carryover-assistant")?.scrollIntoView({ behavior: "smooth", block: "start" }),
    onStopFocus: () => setStopFocusOpen(true),
  }).filter((nudge) => !dismissedNudgeKeys.has(nudge.key));

  function handlePowerCommand(command: string) {
    const [prefix, ...rest] = command.split(":");
    const value = rest.join(":").trim();
    const normalized = prefix.trim().toLowerCase();

    if (normalized === "task" && value) {
      createTaskMutation.mutate({
        title: value,
        taskType: "planned_work",
        status: "todo",
        priority: "normal",
        weekStartDate: weekRange.from,
        targetDate: today.date,
        includedInReport: false,
      });
      return;
    }

    if (normalized === "log" && value) {
      const { summary, durationMinutes } = parseLogCommand(value);
      createLogMutation.mutate({
        projectId: null,
        date: today.date,
        activityType: "Development",
        summary,
        outcome: null,
        durationMinutes,
        followUp: null,
        includedInReport: true,
      });
      return;
    }

    if (normalized === "focus") {
      startFocusMutation.mutate({
        title: value || "Focus session",
        projectId: null,
        taskId: null,
        notes: null,
      });
    }
  }

  function markOnboardingStep(stepId: string) {
    const existing = settingsQuery.data?.onboardingCompletedSteps ?? [];
    if (existing.includes(stepId)) return;
    onboardingMutation.mutate({
      onboardingCompletedSteps: [...existing, stepId],
    });
  }

  function dismissWelcome() {
    onboardingMutation.mutate({
      onboardingDismissedWelcome: true,
    });
  }

  function dismissChecklist() {
    onboardingMutation.mutate({
      onboardingDismissedChecklist: true,
    });
  }

  useEffect(() => {
    if (!settingsQuery.data || settingsQuery.data.onboardingCompleted || !onboardingIsComplete) {
      return;
    }

    onboardingMutation.mutate({
      onboardingCompleted: true,
      onboardingCompletedSteps: onboardingSteps.map((step) => step.id),
      onboardingCompletedAt: new Date().toISOString(),
    });
  }, [onboardingIsComplete, settingsQuery.data?.onboardingCompleted]);

  return (
    <div className="space-y-4">
      {showWelcomeModal ? (
        <OnboardingWelcomeModal
          isPending={onboardingMutation.isPending}
          onStart={dismissWelcome}
          onSkip={() =>
            onboardingMutation.mutate({
              onboardingDismissedWelcome: true,
              onboardingDismissedChecklist: true,
            })
          }
        />
      ) : null}

      <PageHeader
        icon={Sparkles}
        eyebrow="Daily workflow"
        title="Today"
        description={`${today.label} / ${weekRange.label}`}
        actions={
          <>
            <Button onClick={() => setTaskModalOpen(true)}>
              <Plus className="h-4 w-4" />
              Full Task
            </Button>
            <Button onClick={() => setLogModalOpen(true)}>
              <ClipboardEdit className="h-4 w-4" />
              Quick Log
            </Button>
            <Button variant="primary" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              {syncMutation.isPending ? "Syncing..." : "Sync Now"}
            </Button>
            <Button onClick={() => setReviewOpen(true)}>
              <ListChecks className="h-4 w-4" />
              Review
            </Button>
            <Button onClick={() => navigate("/reports")}>
              <FileText className="h-4 w-4" />
              Report
            </Button>
            <Button onClick={() => setReportPrepOpen(true)}>
              <FileText className="h-4 w-4" />
              Prep
            </Button>
          </>
        }
      />

      {showOnboardingPanel ? (
        <OnboardingPipelinePanel
          steps={onboardingSteps}
          completedCount={onboardingDoneCount}
          isComplete={onboardingIsComplete}
          isPending={onboardingMutation.isPending}
          onDismiss={dismissChecklist}
        />
      ) : null}

      <TodayCommandCenterPanel
        todayDate={today.date}
        commandCenter={commandCenterQuery.data}
        isLoading={commandCenterQuery.isLoading}
        isError={commandCenterQuery.isError}
        errorMessage={commandCenterQuery.error instanceof Error ? commandCenterQuery.error.message : null}
        priorityDraft={priorityDraft}
        onPriorityDraftChange={setPriorityDraft}
        onSavePriorities={() =>
          replacePrioritiesMutation.mutate(
            priorityDraft
              .map((item, index) => ({
                rank: index + 1,
                title: item.title.trim(),
                weeklyTaskId: item.weeklyTaskId,
                plannedMinutes: item.plannedMinutes.trim() ? Number(item.plannedMinutes) : undefined,
              }))
              .filter((item) => item.title),
          )
        }
        onSetFocusGoal={(minutes) => updateFocusGoalMutation.mutate(minutes)}
        onMarkPriorityDone={(item) =>
          item.id.startsWith("suggested_daily_plan_item_")
            ? replacePrioritiesMutation.mutate(
                priorityDraft
                  .map((draftItem, index) => ({
                    rank: index + 1,
                    title: draftItem.title.trim(),
                    weeklyTaskId: draftItem.weeklyTaskId,
                    plannedMinutes: draftItem.plannedMinutes.trim() ? Number(draftItem.plannedMinutes) : undefined,
                  }))
                  .filter((draftItem) => draftItem.title),
              )
            : updatePriorityMutation.mutate({
                id: item.id,
                input: { status: "done" },
              })
        }
        isSaving={
          replacePrioritiesMutation.isPending ||
          updatePriorityMutation.isPending ||
          updateFocusGoalMutation.isPending
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <TodayStat icon={Target} label="Planned Today" value={planned.length.toString()} />
        <TodayStat icon={Activity} label="In Progress" value={inProgress.length.toString()} />
        <TodayStat icon={AlertTriangle} label="Blockers" value={blockers.length.toString()} />
        <TodayStat icon={FileText} label="Report Ready" value={reportReadyCount.toString()} />
        <TodayStat
          icon={Focus}
          label="Capacity Today"
          value={formatMinutes(
            capacityQuery.data?.days.find((day) => day.date === today.date)?.remainingMinutes ?? 0,
          )}
        />
      </div>

      <TodayQuickAddBar
        projects={projects}
        todayDate={today.date}
        isPending={createTaskMutation.isPending}
        onAdd={(values) =>
          createTaskMutation.mutate({
            title: values.title,
            taskType: "planned_work",
            status: "todo",
            projectId: values.projectId ?? undefined,
            priority: values.priority,
            weekStartDate: weekRange.from,
            targetDate: values.targetDate,
            includedInReport: false,
          })
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div id="carryover-assistant">
            <CarryoverAssistant
              tasks={previousOpenTasks}
              isUpdating={updateTaskMutation.isPending}
              onCarry={(task) =>
                updateTaskMutation.mutate({
                  id: task.id,
                  input: {
                    weekStartDate: weekRange.from,
                    taskType: "carryover",
                    status: task.status,
                  },
                })
              }
              onDrop={(task) =>
                updateTaskMutation.mutate({
                  id: task.id,
                  input: { status: "dropped", completedAt: today.date },
                })
              }
              onDone={(task) =>
                updateTaskMutation.mutate({
                  id: task.id,
                  input: { status: "completed", completedAt: today.date },
                })
              }
              onInclude={(task) =>
                updateTaskMutation.mutate({
                  id: task.id,
                  input: { includedInReport: true },
                })
              }
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <TaskPanel
              title="Active Work"
              empty="No active work yet. Add a task or move one into progress."
              tasks={[...inProgress, ...planned].slice(0, 8)}
              onComplete={(task) => updateTaskMutation.mutate({ id: task.id, input: { status: "completed", completedAt: today.date } })}
              onStart={(task) => updateTaskMutation.mutate({ id: task.id, input: { status: "in_progress", progressPercent: task.progressPercent ?? 25 } })}
              onFocus={(task) =>
                startFocusMutation.mutate({
                  projectId: task.projectId ?? null,
                  taskId: task.id,
                  title: task.title,
                  notes: null,
                })
              }
            />
            <TaskPanel
              title="Blockers"
              empty="No blockers are open."
              tasks={blockers.slice(0, 8)}
              onComplete={(task) => updateTaskMutation.mutate({ id: task.id, input: { status: "completed", completedAt: today.date } })}
              onStart={(task) => updateTaskMutation.mutate({ id: task.id, input: { status: "in_progress", taskType: "planned_work" } })}
              onFocus={(task) =>
                startFocusMutation.mutate({
                  projectId: task.projectId ?? null,
                  taskId: task.id,
                  title: task.title,
                  notes: null,
                })
              }
            />
          </div>
        </div>

        <div className="space-y-4">
          <NudgePanel
            nudges={activeNudges}
            onDismiss={(key) => dismissNudgeMutation.mutate(key)}
            isDismissing={dismissNudgeMutation.isPending}
          />
          <div id="focus-session-panel">
            <FocusSessionPanel
              activeSession={activeFocusQuery.data}
              projects={projects}
              onStart={(input) =>
                startFocusMutation.mutate({
                  title: input.title,
                  projectId: input.projectId ?? null,
                  taskId: null,
                  notes: null,
                })
              }
              onStop={() => setStopFocusOpen(true)}
              onCancel={() => activeFocusQuery.data && cancelFocusMutation.mutate(activeFocusQuery.data.id)}
              isPending={
                startFocusMutation.isPending ||
                stopFocusMutation.isPending ||
                cancelFocusMutation.isPending
              }
            />
          </div>
          <Panel>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white">Today's Activity</h2>
              <Badge tone={activityItems.length > 0 ? "green" : "slate"}>{activityItems.length} items</Badge>
            </div>
            <div className="space-y-2">
              {activityQuery.isLoading ? (
                <div className="h-24 animate-pulse rounded-xl bg-white/[0.03]" />
              ) : activityItems.length > 0 ? (
                activityItems.slice(0, 7).map((item) => (
                  <div key={item.id} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-cyan-200">
                        {item.activityType === "commit" ? <GitCommit className="h-4 w-4" /> : <ClipboardEdit className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-100">{item.summary}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.projectName ?? "General"} / {item.activityType}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs leading-5 text-slate-400">
                  Sync repositories or add a quick log to build today's trail.
                </div>
              )}
            </div>
          </Panel>

          <Panel className="border-cyan-300/15 bg-cyan-400/10">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-cyan-200" />
              <h2 className="text-sm font-semibold text-white">Report Readiness</h2>
            </div>
            <div className="space-y-2 text-xs text-slate-300">
              <ReadinessRow done={activityItems.length > 0} label="Today has captured activity" />
              <ReadinessRow done={tasks.some((task) => task.includedInReport)} label="Weekly tasks flagged for report" />
              <ReadinessRow done={blockers.length === 0} label="Blockers reviewed" />
            </div>
          </Panel>
        </div>
      </div>

      <AddTaskModal
        isOpen={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        onSubmit={(values) => createTaskMutation.mutate(values)}
        projects={projects}
        weekStartDate={weekRange.from}
        editingTask={null}
        isPending={createTaskMutation.isPending}
        error={createTaskMutation.error instanceof Error ? createTaskMutation.error.message : undefined}
      />
      <QuickManualLogModal
        isOpen={logModalOpen}
        onClose={() => setLogModalOpen(false)}
        onSubmit={(input) => createLogMutation.mutate(input)}
        projects={projects}
        date={today.date}
        isPending={createLogMutation.isPending}
        error={createLogMutation.error instanceof Error ? createLogMutation.error.message : undefined}
      />
      <EndOfDayReviewModal
        isOpen={reviewOpen}
        onClose={() => setReviewOpen(false)}
        dateLabel={today.label}
        activityItems={activityItems}
        focusSessions={focusSessions}
        openTasks={reviewTasks}
        blockers={blockers}
        existingNote={dailyReviewNote}
        noteLoadWarning={dailyReviewNotesQuery.error instanceof Error ? dailyReviewNotesQuery.error.message : null}
        isSyncing={syncMutation.isPending}
        isUpdating={updateTaskMutation.isPending}
        isSaving={saveDailyReviewMutation.isPending}
        onSync={() => syncMutation.mutate()}
        onQuickLog={() => setLogModalOpen(true)}
        onGenerateReport={() => navigate("/reports")}
        onCompleteTask={(task) => updateTaskMutation.mutate({ id: task.id, input: { status: "completed", completedAt: today.date } })}
        onCarryTask={(task) => updateTaskMutation.mutate({ id: task.id, input: { taskType: "carryover", status: task.status === "completed" ? "todo" : task.status } })}
        onIncludeTask={(task) => updateTaskMutation.mutate({ id: task.id, input: { includedInReport: true } })}
        onSaveReview={(input) => saveDailyReviewMutation.mutate({ date: today.date, ...input, includedInReport: true })}
      />
      <StopFocusModal
        isOpen={stopFocusOpen}
        session={activeFocusQuery.data}
        onClose={() => setStopFocusOpen(false)}
        onSubmit={(input) =>
          activeFocusQuery.data &&
          stopFocusMutation.mutate({ id: activeFocusQuery.data.id, input })
        }
        isPending={stopFocusMutation.isPending}
        error={stopFocusMutation.error instanceof Error ? stopFocusMutation.error.message : undefined}
      />
      <PrepareReportModal
        isOpen={reportPrepOpen}
        onClose={() => setReportPrepOpen(false)}
        activityItems={activityItems}
        tasks={tasks}
        blockers={blockers}
        isSyncing={syncMutation.isPending}
        isUpdating={updateTaskMutation.isPending}
        onSync={() => syncMutation.mutate()}
        onCarryTask={(task) => updateTaskMutation.mutate({ id: task.id, input: { taskType: "carryover", status: task.status === "completed" ? "todo" : task.status } })}
        onIncludeTask={(task) => updateTaskMutation.mutate({ id: task.id, input: { includedInReport: true } })}
        onOpenReports={() => navigate("/reports")}
      />
    </div>
  );
}

function TodayStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <Panel className="group relative overflow-hidden border-white/10 bg-gradient-to-br from-slate-950/85 via-[#07142a]/95 to-slate-950/90 p-4">
      <div className="absolute -bottom-2 right-0 h-8 w-20 rounded-full bg-cyan-400/10 blur-xl transition-opacity group-hover:opacity-90" />
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">{label}</p>
          <p className="mt-2 text-5xl font-semibold leading-none text-white">{value}</p>
          <p className="mt-1 text-sm text-slate-400">minutes</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
          <Icon className="h-4 w-4 text-cyan-200" />
        </div>
      </div>
    </Panel>
  );
}

function OnboardingWelcomeModal({
  isPending,
  onStart,
  onSkip,
}: {
  isPending: boolean;
  onStart: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-cyan-300/20 bg-[#06101d] p-5 shadow-2xl shadow-blue-950/50">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(59,130,246,0.28),transparent_34%),radial-gradient(circle_at_90%_10%,rgba(20,184,166,0.16),transparent_28%)]" />
        <div className="relative">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
            <Sparkles className="h-3.5 w-3.5" />
            Welcome to WorkTrace
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-white">
            Get to a useful weekly report in under five minutes.
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            We will set up only what matters: profile details, one project or workspace,
            a commit sync, one captured non-code item, and a quick report preview.
          </p>
          <div className="mt-5 grid gap-2 text-sm text-slate-300">
            {["Profile", "Project or workspace", "Commit sync", "Manual capture", "Report preview"].map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <CheckCircle2 className="h-4 w-4 text-cyan-200" />
                {item}
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onSkip} disabled={isPending}>
              Skip for now
            </Button>
            <Button variant="primary" onClick={onStart} disabled={isPending}>
              Start setup
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OnboardingPipelinePanel({
  steps,
  completedCount,
  isComplete,
  isPending,
  onDismiss,
}: {
  steps: Array<{
    id: string;
    title: string;
    detail: string;
    action: string;
    done: boolean;
    disabled?: boolean;
    onAction: () => void;
  }>;
  completedCount: number;
  isComplete: boolean;
  isPending: boolean;
  onDismiss: () => void;
}) {
  return (
    <Panel className="relative overflow-hidden border-cyan-300/20 bg-cyan-400/10 p-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_6%_20%,rgba(34,211,238,0.14),transparent_28%),linear-gradient(135deg,rgba(14,165,233,0.08),transparent_50%)]" />
      <div className="relative p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
              <ListChecks className="h-3.5 w-3.5" />
              Setup pipeline
            </div>
            <h2 className="text-xl font-semibold text-white">
              {isComplete ? "WorkTrace is ready for weekly reporting" : "Turn WorkTrace into your reporting trail"}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {completedCount} of {steps.length} steps complete. Each action opens the real WorkTrace flow.
            </p>
          </div>
          <Button variant="ghost" onClick={onDismiss} disabled={isPending}>
            Hide
          </Button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          {steps.map((step, index) => (
            <article
              key={step.id}
              className={[
                "rounded-2xl border p-3 transition",
                step.done
                  ? "border-emerald-300/25 bg-emerald-400/10"
                  : "border-white/10 bg-slate-950/45",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-xs font-semibold text-slate-200">
                  {step.done ? <CheckCircle2 className="h-4 w-4 text-emerald-200" /> : index + 1}
                </div>
                {step.done ? <Badge tone="green">Done</Badge> : null}
              </div>
              <h3 className="mt-3 text-sm font-semibold text-white">{step.title}</h3>
              <p className="mt-2 min-h-[52px] text-xs leading-5 text-slate-400">{step.detail}</p>
              <Button
                className="mt-3 h-8 w-full px-2 text-xs"
                variant={step.done ? "secondary" : "primary"}
                onClick={step.onAction}
                disabled={step.disabled}
              >
                {step.done ? "Open" : step.action}
              </Button>
            </article>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function TodayCommandCenterPanel({
  todayDate,
  commandCenter,
  isLoading,
  isError,
  errorMessage,
  priorityDraft,
  onPriorityDraftChange,
  onSavePriorities,
  onSetFocusGoal,
  onMarkPriorityDone,
  isSaving,
}: {
  todayDate: string;
  commandCenter?: import("../types/dailyPlan").TodayCommandCenter;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  priorityDraft: Array<{ title: string; plannedMinutes: string; weeklyTaskId?: string }>;
  onPriorityDraftChange: (draft: Array<{ title: string; plannedMinutes: string; weeklyTaskId?: string }>) => void;
  onSavePriorities: () => void;
  onSetFocusGoal: (minutes: number) => void;
  onMarkPriorityDone: (item: DailyPlanItem) => void;
  isSaving: boolean;
}) {
  return (
    <Panel className="border-white/10 bg-gradient-to-b from-[#05112a]/88 to-[#040c1f]/92 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-2xl font-semibold text-white">Today Command Center</h2>
        <span className="rounded-lg border border-blue-300/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-200">{todayDate}</span>
      </div>
      {isLoading ? (
        <div className="h-24 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]" />
      ) : isError ? (
        <div className="rounded-xl border border-amber-300/20 bg-amber-500/10 p-3 text-xs text-amber-100">
          Command Center is unavailable. Existing Today tools remain usable. {errorMessage ?? ""}
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-gradient-to-br from-slate-950/80 to-[#081832]/80 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Top 3 Priorities</p>
            <div className="space-y-2">
              {priorityDraft.map((item, index) => (
                <div key={index} className="grid grid-cols-[24px_1fr_84px] items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-500/10 text-[11px] font-semibold text-cyan-200">
                    {index + 1}
                  </div>
                  <input
                    value={item.title}
                    onChange={(event) => {
                      const next = [...priorityDraft];
                      next[index] = { ...next[index], title: event.currentTarget.value };
                      onPriorityDraftChange(next);
                    }}
                    placeholder={`Priority ${index + 1}`}
                    className="h-9 rounded-lg border border-white/10 bg-slate-950/70 px-2 text-sm text-slate-100 outline-none focus:border-blue-300/50"
                  />
                  <input
                    value={item.plannedMinutes}
                    onChange={(event) => {
                      const next = [...priorityDraft];
                      next[index] = { ...next[index], plannedMinutes: event.currentTarget.value };
                      onPriorityDraftChange(next);
                    }}
                    placeholder="mins"
                    className="h-9 rounded-lg border border-white/10 bg-slate-950/70 px-2 text-xs text-slate-100 outline-none focus:border-blue-300/50"
                  />
                </div>
              ))}
            </div>
            <Button onClick={onSavePriorities} className="mt-3 h-9 px-3 text-sm" disabled={isSaving}>
              Save priorities
            </Button>
          </div>

          <div className="rounded-xl border border-white/10 bg-gradient-to-br from-slate-950/80 to-[#071428]/80 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Plan vs Actual</p>
            <div className="flex items-center gap-4">
              <div className="flex h-28 w-28 items-center justify-center rounded-full border-8 border-white/10">
                <div className="text-center">
                  <p className="text-2xl font-semibold text-white">
                    {Math.round(
                      ((commandCenter?.endOfDayProgress.actualMinutes ?? 0) /
                        Math.max(commandCenter?.endOfDayProgress.plannedMinutes ?? 1, 1)) *
                        100,
                    )}%
                  </p>
                  <p className="text-[11px] text-slate-400">Completed</p>
                </div>
              </div>
              <div className="space-y-1 text-sm text-slate-300">
                <p>Plan: {(commandCenter?.endOfDayProgress.plannedMinutes ?? 0)}m</p>
                <p>Actual: {(commandCenter?.endOfDayProgress.actualMinutes ?? 0)}m</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-gradient-to-br from-slate-950/80 to-[#07122a]/80 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Focus + Risk</p>
            <p className="text-sm text-slate-300">Goal: {commandCenter?.focusGoalMinutes ?? 240}m</p>
            <p className="text-sm text-slate-300">Actual: {commandCenter?.focusActualMinutes ?? 0}m</p>
            <p className="mt-2 text-sm text-slate-300">
              Risk: {commandCenter?.distractionRisk.level ?? "low"} ({commandCenter?.distractionRisk.score ?? 0})
            </p>
            <Button
              onClick={() => onSetFocusGoal(240)}
              className="mt-3 h-8 px-3 text-sm"
              disabled={isSaving}
            >
              Reset goal to 4h
            </Button>
          </div>

          <div className="rounded-xl border border-white/10 bg-gradient-to-br from-slate-950/80 to-[#07122a]/80 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Current + Next</p>
              <Layers3 className="h-4 w-4 text-slate-500" />
            </div>
            <p className="text-sm text-slate-300">Current: {commandCenter?.currentTask?.title ?? "None"}</p>
            <p className="mt-1 text-sm text-slate-300">Suggested: {commandCenter?.suggestedNextTask?.title ?? "None"}</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-gradient-to-br from-slate-950/80 to-[#07122a]/80 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Meetings + EOD</p>
              <CalendarClock className="h-4 w-4 text-slate-500" />
            </div>
            <p className="text-sm text-slate-300">Meetings today: {commandCenter?.meetings.length ?? 0}</p>
            <p className="mt-1 text-sm text-slate-300">
              Progress: {commandCenter?.endOfDayProgress.completedPriorities ?? 0}/
              {commandCenter?.endOfDayProgress.totalPriorities ?? 0}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-gradient-to-br from-slate-950/80 to-[#07122a]/80 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Mark Done</p>
              <CheckCheck className="h-4 w-4 text-slate-500" />
            </div>
            <div className="space-y-2">
              {(commandCenter?.topPriorities ?? []).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/[0.02] p-2">
                  <p className="truncate text-sm text-slate-200">{item.rank}. {item.title}</p>
                  {item.status !== "done" ? (
                    <Button onClick={() => onMarkPriorityDone(item)} className="h-7 px-2 text-xs" disabled={isSaving}>
                      {item.id.startsWith("suggested_daily_plan_item_") ? "Save" : "Done"}
                    </Button>
                  ) : (
                    <Badge tone="green">Done</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

function TaskPanel({
  title,
  empty,
  tasks,
  onComplete,
  onStart,
  onFocus,
}: {
  title: string;
  empty: string;
  tasks: WeeklyTask[];
  onComplete: (task: WeeklyTask) => void;
  onStart: (task: WeeklyTask) => void;
  onFocus: (task: WeeklyTask) => void;
}) {
  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <Badge tone="blue">{tasks.length}</Badge>
      </div>
      <div className="space-y-2">
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <div key={task.id} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">{task.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{task.projectName ?? "General"} / {task.priority}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" onClick={() => onFocus(task)} className="h-8 px-2 text-xs">
                    <Focus className="h-3.5 w-3.5" />
                  </Button>
                  {task.status !== "in_progress" ? (
                    <Button variant="ghost" onClick={() => onStart(task)} className="h-8 px-2 text-xs">
                      Start
                    </Button>
                  ) : null}
                  <Button variant="ghost" onClick={() => onComplete(task)} className="h-8 px-2 text-xs">
                    Done
                  </Button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs leading-5 text-slate-400">
            {empty}
          </div>
        )}
      </div>
    </Panel>
  );
}

function parseLogCommand(value: string) {
  const match = value.match(/\b(\d+)\s*m(?:in)?\b/i);
  const durationMinutes = match ? Number(match[1]) : null;
  const summary = value.replace(/\b\d+\s*m(?:in)?\b/i, "").trim() || value.trim();

  return { summary, durationMinutes };
}

function buildTodayNudges(input: {
  activityCount: number;
  blockerCount: number;
  reportReadyCount: number;
  hasSyncableProjects: boolean;
  hasPreviousOpenTasks: boolean;
  staleInProgressCount: number;
  focusStartedAt: string | null;
  onSync: () => void;
  onQuickLog: () => void;
  onReview: () => void;
  onReportPrep: () => void;
  onCarryover: () => void;
  onStopFocus: () => void;
}): TodayNudge[] {
  const nudges: TodayNudge[] = [];

  if (input.activityCount === 0) {
    nudges.push({
      key: "missing_activity",
      title: "No activity captured today",
      detail: "Add a quick log or sync repositories so the day has a useful trail.",
      actionLabel: "Quick Log",
      onAction: input.onQuickLog,
    });
  }

  if (input.hasSyncableProjects) {
    nudges.push({
      key: "sync_recommended",
      title: "Repository sync is available",
      detail: "A quick sync can pull in recent commits before review or reporting.",
      actionLabel: "Sync Now",
      onAction: input.onSync,
    });
  }

  if (input.blockerCount > 0) {
    nudges.push({
      key: "open_blockers",
      title: `${input.blockerCount} blocker${input.blockerCount === 1 ? "" : "s"} open`,
      detail: "Review blockers while they are still fresh and decide what needs follow-up.",
      actionLabel: "Review",
      onAction: input.onReview,
    });
  }

  if (input.hasPreviousOpenTasks) {
    nudges.push({
      key: "carryover_waiting",
      title: "Previous work needs a decision",
      detail: "Carry it forward, drop it, mark it done, or flag it for the report.",
      actionLabel: "Open Carryover",
      onAction: input.onCarryover,
    });
  }

  if (input.staleInProgressCount > 0) {
    nudges.push({
      key: "stale_in_progress",
      title: "In-progress work looks stale",
      detail: "Check whether it is done, blocked, or still the best thing to focus on.",
      actionLabel: "Review",
      onAction: input.onReview,
    });
  }

  if (input.reportReadyCount === 0) {
    nudges.push({
      key: "no_report_ready_items",
      title: "Nothing is report-ready yet",
      detail: "Flag at least one useful task or activity before the week-end report pass.",
      actionLabel: "Prep Report",
      onAction: input.onReportPrep,
    });
  }

  if (input.focusStartedAt && minutesSince(input.focusStartedAt) >= 90) {
    nudges.push({
      key: "focus_running_long",
      title: "Focus session has been running a while",
      detail: "Stop it when the work block is done so the log stays accurate.",
      actionLabel: "Stop Focus",
      onAction: input.onStopFocus,
    });
  }

  return nudges;
}

function minutesSince(timestamp: string) {
  const started = new Date(timestamp).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.floor((Date.now() - started) / 60_000);
}

function formatMinutes(minutes: number) {
  const sign = minutes < 0 ? "-" : "";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const remaining = absolute % 60;
  if (!hours) return `${sign}${remaining}m`;
  if (!remaining) return `${sign}${hours}h`;
  return `${sign}${hours}h ${remaining}m`;
}

function projectNameFor(
  projectId: string | null | undefined,
  projects: Array<{ id: string; name: string }> | undefined,
) {
  if (!projectId) return null;
  return projects?.find((project) => project.id === projectId)?.name ?? null;
}

function ReadinessRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <CheckCircle2 className={`h-4 w-4 ${done ? "text-emerald-300" : "text-slate-600"}`} />
      <span>{label}</span>
    </div>
  );
}
