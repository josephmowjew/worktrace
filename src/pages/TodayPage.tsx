import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  CheckCheck,
  ClipboardEdit,
  Clock3,
  FileText,
  Focus,
  GitCommit,
  Layers3,
  ListChecks,
  ListTodo,
  Monitor,
  Plus,
  Play,
  RefreshCw,
  Square,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { useLocation, useNavigate } from "react-router-dom";
import { AddTaskModal } from "../components/ui/AddTaskModal";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EndOfDayReviewModal } from "../components/ui/EndOfDayReviewModal";
import { Panel } from "../components/ui/Panel";
import { PrepareReportModal } from "../components/ui/PrepareReportModal";
import { QuickManualLogModal } from "../components/ui/QuickManualLogModal";
import { StopFocusModal } from "../components/ui/StopFocusModal";
import { TodayQuickAddBar } from "../components/ui/TodayQuickAddBar";
import { useSpeech } from "../components/ui/SpeechProvider";
import { useToast } from "../components/ui/ToastProvider";
import { useOnboardingProgress } from "../features/onboarding/useOnboardingProgress";
import { listActivity } from "../lib/api/activity";
import {
  cancelFocusSession,
  getActiveFocusSession,
  listFocusSessions,
  startFocusSession,
  stopFocusSession,
} from "../lib/api/focusSessions";
import { syncCommits } from "../lib/api/gitSync";
import { getFrictionInsights } from "../lib/api/friction";
import { createManualLog } from "../lib/api/manualLogs";
import { dismissNudge, listNudgeDismissals } from "../lib/api/nudges";
import {
  dismissPriorityReminder,
  listPriorityReminders,
  runPriorityReminderCheck,
  snoozePriorityReminder,
} from "../lib/api/priorityReminders";
import { listProjects } from "../lib/api/projects";
import { listReportNotes, saveDailyReviewNote } from "../lib/api/reports";
import { getSettings, updateSettings } from "../lib/api/settings";
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
import type { FocusSession, StopFocusSessionInput } from "../types/focusSession";
import type { Project } from "../types/project";
import type { WeeklyTask, WeeklyTaskPriority, WeeklyTaskStatus, WeeklyTaskType } from "../types/weeklyTask";
import type { DailyPlanItem, DailyPlanItemStatus } from "../types/dailyPlan";
import type { PriorityReminder } from "../types/priorityReminder";
import type { FrictionInsight } from "../types/friction";

type PriorityDraftItem = {
  title: string;
  plannedMinutes: string;
  weeklyTaskId?: string;
  status?: DailyPlanItemStatus;
};

type TodayNudge = {
  key: string;
  title: string;
  detail: string;
  actionLabel: string;
  onAction: () => void;
};

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
  const [priorityDraft, setPriorityDraft] = useState<PriorityDraftItem[]>([]);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  const { progress: onboardingProgress } = useOnboardingProgress();
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
  const frictionInsightsQuery = useQuery({
    queryKey: ["frictionInsights", today.from, today.to, "today"],
    queryFn: () =>
      getFrictionInsights({
        from: today.from,
        to: today.to,
        surface: "today",
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
  const priorityRemindersQuery = useQuery({
    queryKey: ["priorityReminders", today.date],
    queryFn: () => listPriorityReminders({ date: today.date }),
    refetchInterval: 60_000,
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
      status: item?.status,
    }));
    setPriorityDraft(next);
  }, [commandCenterQuery.data?.topPriorities]);

  useEffect(() => {
    if (!settingsQuery.data?.priorityRemindersEnabled) return;
    if (!commandCenterQuery.data?.topPriorities.length) return;
    runReminderMutation.mutate();
    const timer = window.setInterval(() => {
      runReminderMutation.mutate();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [
    settingsQuery.data?.priorityRemindersEnabled,
    commandCenterQuery.data?.topPriorities.length,
    today.date,
  ]);

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
      queryClient.invalidateQueries({ queryKey: ["frictionInsights"] }),
      queryClient.invalidateQueries({ queryKey: ["nudgeDismissals"] }),
      queryClient.invalidateQueries({ queryKey: ["priorityReminders"] }),
      queryClient.invalidateQueries({ queryKey: ["todayCommandCenter", today.date] }),
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
  const runReminderMutation = useMutation({
    mutationFn: () => runPriorityReminderCheck({ date: today.date }),
    onSuccess: async (reminders) => {
      if (reminders.length > 0) {
        await queryClient.invalidateQueries({ queryKey: ["priorityReminders", today.date] });
        const message =
          reminders.length === 1
            ? reminders[0].title
            : `${reminders.length} top priorities still need attention.`;
        toast.info("Today focus reminder", message);
        speech.announce(`Today focus reminder. ${message}`, { category: "nudge" });
        if (settingsQuery.data?.priorityReminderDesktopEnabled) {
          sendPriorityNotification(reminders).catch(() => null);
        }
      }
    },
  });
  const snoozeReminderMutation = useMutation({
    mutationFn: (reminderKey: string) =>
      snoozePriorityReminder({
        reminderKey,
        date: today.date,
        snoozeMinutes: settingsQuery.data?.priorityReminderSnoozeMinutes,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["priorityReminders", today.date] });
      toast.info("Reminder snoozed", "WorkTrace will nudge you again later.");
    },
    onError: (error) => {
      toast.error("Snooze failed", error instanceof Error ? error.message : "The reminder could not be snoozed.");
    },
  });
  const dismissPriorityReminderMutation = useMutation({
    mutationFn: (reminderKey: string) =>
      dismissPriorityReminder({
        reminderKey,
        date: today.date,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["priorityReminders", today.date] });
    },
    onError: (error) => {
      toast.error("Dismiss failed", error instanceof Error ? error.message : "The reminder could not be dismissed.");
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
      await queryClient.invalidateQueries({ queryKey: ["priorityReminders", today.date] });
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
      await queryClient.invalidateQueries({ queryKey: ["priorityReminders", today.date] });
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
  const todayRemainingCapacity =
    capacityQuery.data?.days.find((day) => day.date === today.date)?.remainingMinutes ?? 0;
  const showOnboardingEntry =
    Boolean(settingsQuery.data) &&
    !settingsQuery.data?.onboardingDismissedWelcome &&
    !settingsQuery.data?.onboardingCompleted &&
    !onboardingProgress.hasMeaningfulSetup;
  const showOnboardingPanel =
    Boolean(settingsQuery.data) &&
    !settingsQuery.data?.onboardingCompleted &&
    !settingsQuery.data?.onboardingDismissedChecklist;
  const dismissedNudgeKeys = new Set((nudgeDismissalsQuery.data ?? []).map((dismissal) => dismissal.nudgeKey));
  const incompletePriorityIds = new Set(
    (commandCenterQuery.data?.topPriorities ?? [])
      .filter((item) => item.status !== "done" && item.status !== "dropped")
      .map((item) => item.id),
  );
  const activePriorityReminders = (priorityRemindersQuery.data ?? []).filter(
    (reminder) => !reminder.dismissedAt && incompletePriorityIds.has(reminder.dailyPlanItemId),
  );
  const activeNudges = buildTodayNudges({
    activityCount: activityItems.length,
    blockerCount: blockers.length,
    reportReadyCount,
    hasSyncableProjects: projects.some((project) => Boolean(project.repoPath)),
    hasPreviousOpenTasks: previousOpenTasks.length > 0,
    staleInProgressCount: inProgress.filter((task) => task.updatedAt.slice(0, 10) < today.date).length,
    focusStartedAt: activeFocusQuery.data?.startedAt ?? null,
    todayDate: today.date,
    frictionInsights: frictionInsightsQuery.data ?? [],
    onFrictionAction: (insight) => {
      if (insight.primaryAction?.route) {
        navigate(insight.primaryAction.route, {
          state: insight.primaryAction.stateJson ?? undefined,
        });
        return;
      }
      navigate(insight.actionTarget);
    },
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

  function dismissChecklist() {
    onboardingMutation.mutate({
      onboardingDismissedChecklist: true,
    });
  }

  useEffect(() => {
    if (!settingsQuery.data || settingsQuery.data.onboardingCompleted || !onboardingProgress.isComplete) {
      return;
    }

    onboardingMutation.mutate({
      onboardingCompleted: true,
      onboardingCompletedSteps: onboardingProgress.steps.map((step) => step.id),
      onboardingCompletedAt: new Date().toISOString(),
    });
  }, [onboardingProgress.isComplete, settingsQuery.data?.onboardingCompleted]);

  return (
    <div className="space-y-4">
      {showOnboardingEntry ? (
        <OnboardingEntryPanel
          isPending={onboardingMutation.isPending}
          onStart={() => {
            onboardingMutation.mutate({ onboardingDismissedWelcome: true });
            navigate("/onboarding");
          }}
          onSkip={() =>
            onboardingMutation.mutate({
              onboardingDismissedWelcome: true,
              onboardingDismissedChecklist: true,
            })
          }
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Today</h1>
          <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/45 px-3 text-xs font-medium text-slate-200 tabular-nums">
            <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
            {today.label}
          </span>
          <span className="text-xs font-medium text-slate-400">+ {weekRange.label}</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={() => setTaskModalOpen(true)} size="sm">
            <Plus className="h-4 w-4" />
            New Task
          </Button>
          <Button onClick={() => setLogModalOpen(true)} size="sm">
            <ClipboardEdit className="h-4 w-4" />
            Quick Log
          </Button>
          <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} size="sm">
            <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Syncing..." : "Sync Repos"}
          </Button>
          <span className="mx-1 h-8 w-px bg-white/10" />
          <Button variant="primary" onClick={() => setReviewOpen(true)} size="sm">
            <ListChecks className="h-4 w-4" />
            End of Day Review
          </Button>
          <Button onClick={() => navigate("/reports")} size="sm">
            <FileText className="h-4 w-4" />
            Reports
          </Button>
          <Button onClick={() => setReportPrepOpen(true)} size="sm">
            <FileText className="h-4 w-4" />
            Prep Report
          </Button>
        </div>
      </div>

      {showOnboardingPanel ? (
        <OnboardingSetupPanel
          steps={onboardingProgress.steps}
          completedCount={onboardingProgress.completedCount}
          isComplete={onboardingProgress.isComplete}
          isPending={onboardingMutation.isPending}
          onOpen={() => navigate("/onboarding")}
          onDismiss={dismissChecklist}
        />
      ) : null}

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <TodayCommandCenterPanel
            todayDate={today.date}
            commandCenter={commandCenterQuery.data}
            isLoading={commandCenterQuery.isLoading}
            isError={commandCenterQuery.isError}
            errorMessage={commandCenterQuery.error instanceof Error ? commandCenterQuery.error.message : null}
            openTasks={todayTasks}
            reminders={priorityRemindersQuery.data ?? []}
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
            onStartPriorityFocus={(item) =>
              startFocusMutation.mutate({
                title: item.title,
                projectId: null,
                taskId: item.weeklyTaskId ?? null,
                notes: null,
              })
            }
            isSaving={
              replacePrioritiesMutation.isPending ||
              updatePriorityMutation.isPending ||
              updateFocusGoalMutation.isPending
            }
            backgroundModeEnabled={Boolean(settingsQuery.data?.minimizeToTrayOnClose)}
            startupEnabled={Boolean(settingsQuery.data?.startupEnabled)}
            onOpenBackgroundSettings={() => navigate("/settings")}
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <TodayStat icon={Target} label="Planned Today" value={planned.length.toString()} detail="open tasks" />
            <TodayStat icon={Activity} label="In Progress" value={inProgress.length.toString()} detail="tasks" />
            <TodayStat icon={AlertTriangle} label="Blockers" value={blockers.length.toString()} detail={blockers.length === 1 ? "task" : "tasks"} tone="amber" />
            <TodayStat icon={FileText} label="Report Ready" value={reportReadyCount.toString()} detail="items" tone="emerald" />
            <TodayStat icon={Focus} label="Capacity Today" value={formatMinutes(todayRemainingCapacity)} detail="remaining" tone="emerald" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)]">
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
            <div id="carryover-assistant">
              <CompactCarryoverAssistant
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
          <TodayNudgeStrip
            nudges={activeNudges}
            onDismiss={(key) => dismissNudgeMutation.mutate(key)}
            isDismissing={dismissNudgeMutation.isPending}
          />
        </div>

        <aside className="space-y-4">
          <div id="focus-session-panel">
            <TodayFocusPanel
              activeSession={activeFocusQuery.data}
              focusGoalMinutes={commandCenterQuery.data?.focusGoalMinutes ?? 240}
              focusActualMinutes={commandCenterQuery.data?.focusActualMinutes ?? 0}
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
          <PriorityReminderPanel
            reminders={activePriorityReminders}
            isPending={snoozeReminderMutation.isPending || dismissPriorityReminderMutation.isPending}
            onSnooze={(reminder) => snoozeReminderMutation.mutate(reminder.reminderKey)}
            onDismiss={(reminder) => dismissPriorityReminderMutation.mutate(reminder.reminderKey)}
            onStartFocus={(reminder) =>
              startFocusMutation.mutate({
                title: reminder.title,
                projectId: null,
                taskId: reminder.weeklyTaskId ?? null,
                notes: null,
              })
            }
            onMarkDone={(reminder) =>
              updatePriorityMutation.mutate({
                id: reminder.dailyPlanItemId,
                input: { status: "done" },
              })
            }
          />
          <TodayActivityPanel isLoading={activityQuery.isLoading} activityItems={activityItems} />
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
        </aside>
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
  detail,
  tone = "blue",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  detail: string;
  tone?: "blue" | "emerald" | "amber";
}) {
  const toneClass = {
    blue: "border-blue-400/20 bg-blue-500/12 text-blue-200",
    emerald: "border-emerald-400/20 bg-emerald-500/12 text-emerald-200",
    amber: "border-amber-400/25 bg-amber-500/12 text-amber-200",
  }[tone];
  return (
    <Panel className="border-white/10 bg-slate-950/55 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold leading-none text-white tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-slate-400">{detail}</p>
        </div>
      </div>
    </Panel>
  );
}

function OnboardingEntryPanel({
  isPending,
  onStart,
  onSkip,
}: {
  isPending: boolean;
  onStart: () => void;
  onSkip: () => void;
}) {
  return (
    <Panel className="border-blue-500/15 bg-[var(--wt-surface)] p-0">
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-blue-500/15 bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-200">
            <Sparkles className="h-3.5 w-3.5" />
            First run
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-[var(--wt-text-strong)]">
            Build your first reporting trail in a few focused steps.
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--wt-text-muted)]">
            Add local work evidence, capture one thing Git cannot see, then preview the weekly report it becomes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button variant="ghost" onClick={onSkip} disabled={isPending}>
            Skip setup
          </Button>
          <Button variant="primary" onClick={onStart} disabled={isPending}>
            <ArrowRight className="h-4 w-4" />
            Start setup
          </Button>
      </div>
      </div>
    </Panel>
  );
}

function OnboardingSetupPanel({
  steps,
  completedCount,
  isComplete,
  isPending,
  onOpen,
  onDismiss,
}: {
  steps: Array<{
    id: string;
    title: string;
    detail: string;
    action: string;
    done: boolean;
    disabled?: boolean;
  }>;
  completedCount: number;
  isComplete: boolean;
  isPending: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <Panel className="border-blue-500/15 bg-[var(--wt-surface)] p-0">
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-blue-500/15 bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-200">
              <ListChecks className="h-3.5 w-3.5" />
              Setup workspace
            </div>
            <h2 className="text-xl font-semibold text-[var(--wt-text-strong)]">
              {isComplete ? "Your first report trail is ready" : "Resume the WorkTrace setup path"}
            </h2>
            <p className="mt-1 text-sm text-[var(--wt-text-muted)]">
              {completedCount} of {steps.length} steps complete. The setup workspace keeps each action connected to the real app.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={onDismiss} disabled={isPending}>
              Hide
            </Button>
            <Button variant="primary" onClick={onOpen}>
              Open setup
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-5">
          {steps.map((step, index) => (
            <article
              key={step.id}
              className={[
                "min-h-28 rounded-xl border p-3 transition-[background-color,border-color] duration-150 ease-out",
                step.done
                  ? "border-emerald-300/25 bg-emerald-400/10"
                  : "border-[var(--wt-border)] bg-[var(--wt-surface-muted)]",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--wt-border)] bg-[var(--wt-surface)] text-xs font-semibold text-[var(--wt-text)]">
                  {step.done ? <CheckCircle2 className="h-4 w-4 text-emerald-200" /> : index + 1}
                </div>
                {step.done ? <Badge tone="green">Done</Badge> : null}
              </div>
              <h3 className="mt-3 text-sm font-semibold text-[var(--wt-text-strong)]">{step.title}</h3>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--wt-text-muted)]">{step.detail}</p>
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
  openTasks,
  reminders,
  priorityDraft,
  onPriorityDraftChange,
  onSavePriorities,
  onSetFocusGoal,
  onMarkPriorityDone,
  onStartPriorityFocus,
  isSaving,
  backgroundModeEnabled,
  startupEnabled,
  onOpenBackgroundSettings,
}: {
  todayDate: string;
  commandCenter?: import("../types/dailyPlan").TodayCommandCenter;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  openTasks: WeeklyTask[];
  reminders: PriorityReminder[];
  priorityDraft: PriorityDraftItem[];
  onPriorityDraftChange: (draft: PriorityDraftItem[]) => void;
  onSavePriorities: () => void;
  onSetFocusGoal: (minutes: number) => void;
  onMarkPriorityDone: (item: DailyPlanItem) => void;
  onStartPriorityFocus: (item: DailyPlanItem) => void;
  isSaving: boolean;
  backgroundModeEnabled: boolean;
  startupEnabled: boolean;
  onOpenBackgroundSettings: () => void;
}) {
  const currentTask = commandCenter?.currentTask ?? null;
  const suggestedTask = commandCenter?.suggestedNextTask ?? null;
  const firstPriority = commandCenter?.topPriorities.find((item) => item.status !== "done" && item.status !== "dropped") ?? commandCenter?.topPriorities[0] ?? null;
  const mainFocus = currentTask?.title ?? firstPriority?.title ?? "Choose a main focus for today";
  const activeProject =
    currentTask?.projectName ??
    suggestedTask?.projectName ??
    openTasks.find((task) => task.projectName)?.projectName ??
    "General";
  const upcomingMeetings = (commandCenter?.meetings ?? [])
    .slice()
    .filter((meeting) => {
      const startsAt = new Date(meeting.startsAt).getTime();
      return Number.isNaN(startsAt) || startsAt >= Date.now();
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const nextSuggestedAction = suggestedTask
    ? `Start with ${suggestedTask.title}`
    : openTasks.length > 0
      ? "Review open tasks and pick the next focus block"
      : "Sync activity or add the first task for today";
  const focusGoal = commandCenter?.focusGoalMinutes ?? 240;
  const focusActual = commandCenter?.focusActualMinutes ?? 0;
  const focusPercent = Math.min(100, Math.round((focusActual / Math.max(focusGoal, 1)) * 100));
  const completedPriorityCount = commandCenter?.endOfDayProgress.completedPriorities ?? 0;
  const totalPriorityCount = commandCenter?.endOfDayProgress.totalPriorities ?? 0;
  const priorityCompletionPercent =
    totalPriorityCount > 0 ? Math.round((completedPriorityCount / totalPriorityCount) * 100) : 0;
  const nextOpenDraftIndex = priorityDraft.findIndex((item) => item.title.trim() && item.status !== "done" && item.status !== "dropped");
  const remindersByItem = new Map(
    reminders
      .filter((reminder) => !reminder.dismissedAt)
      .map((reminder) => [reminder.dailyPlanItemId, reminder]),
  );

  return (
    <Panel className="overflow-hidden border-white/10 bg-[linear-gradient(135deg,rgba(8,20,39,0.96),rgba(6,18,35,0.82))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200">
            <Sparkles className="h-3.5 w-3.5" />
            Today Command Center
          </div>
          <h2 className="max-w-2xl text-xl font-semibold leading-7 text-white sm:text-2xl">{mainFocus}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <BriefcaseBusiness className="h-3.5 w-3.5 text-slate-500" />
              {activeProject}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ListTodo className="h-3.5 w-3.5 text-slate-500" />
              {openTasks.length} open tasks
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 text-slate-500" />
              {upcomingMeetings.length} meetings
            </span>
          </p>
        </div>
        <span className="rounded-lg border border-blue-300/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-200 tabular-nums">{todayDate}</span>
      </div>
      {isLoading ? (
        <div className="h-24 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]" />
      ) : isError ? (
        <div className="rounded-xl border border-amber-300/20 bg-amber-500/10 p-3 text-xs text-amber-100">
          Command Center is unavailable. Existing Today tools remain usable. {errorMessage ?? ""}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
          <div className="space-y-3">
            <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.045] p-3">
              <div className="mb-2 flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-cyan-200" />
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100">Next suggested action</p>
              </div>
              <p className="text-sm font-medium leading-6 text-slate-100">{nextSuggestedAction}</p>
              {suggestedTask?.projectName ? (
                <p className="mt-1 text-xs text-slate-500">{suggestedTask.projectName} / {suggestedTask.priority}</p>
              ) : null}
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Set Today&apos;s Focus</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {completedPriorityCount > 0
                      ? `${completedPriorityCount} complete, ${Math.max(totalPriorityCount - completedPriorityCount, 0)} still open`
                      : "No completed priorities yet"}
                  </p>
                </div>
                <Badge tone={completedPriorityCount > 0 ? "green" : "blue"}>
                  {completedPriorityCount}/{totalPriorityCount} done
                </Badge>
              </div>
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-900 ring-1 ring-white/8">
                <div
                  className="h-full rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.28)] transition-[width] duration-200 ease-out"
                  style={{ width: `${priorityCompletionPercent}%` }}
                />
              </div>
              <div className="space-y-2">
                {priorityDraft.map((item, index) => {
                  const isDone = item.status === "done";
                  const isDropped = item.status === "dropped";
                  const isEmpty = !item.title.trim();
                  const isNext = index === nextOpenDraftIndex;
                  const rowState = isDone ? "done" : isDropped ? "dropped" : isNext ? "next" : isEmpty ? "empty" : "open";
                  return (
                    <div
                      key={index}
                    className={`grid grid-cols-[28px_minmax(0,1fr)_86px_72px] items-center gap-2 rounded-xl px-2 py-2 transition-[background-color,border-color,box-shadow] duration-150 ease-out ${
                        isDone
                          ? "border border-emerald-300/20 bg-emerald-500/[0.075] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                          : isNext
                            ? "border border-cyan-300/20 bg-cyan-300/[0.055]"
                            : "border border-white/8 bg-slate-950/35"
                      }`}
                    >
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold ${
                          isDone
                            ? "border-emerald-200/40 bg-emerald-300/15 text-emerald-100"
                            : isNext
                              ? "border-cyan-200/40 bg-cyan-300/12 text-cyan-100"
                              : "border-slate-500/35 bg-slate-900 text-slate-400"
                        }`}
                        aria-label={isDone ? `Priority ${index + 1} done` : `Priority ${index + 1}`}
                      >
                        {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                      </div>
                      <input
                        value={item.title}
                        onChange={(event) => {
                          const next = [...priorityDraft];
                          next[index] = { ...next[index], title: event.currentTarget.value };
                          onPriorityDraftChange(next);
                        }}
                        placeholder={`Priority ${index + 1}`}
                        className={`h-10 min-w-0 rounded-lg border px-2 text-sm outline-none transition-[background-color,border-color,color] duration-150 focus:border-blue-300/50 ${
                          isDone
                            ? "border-emerald-200/15 bg-emerald-950/20 text-emerald-100 line-through decoration-emerald-200/70"
                            : "border-white/10 bg-slate-950/70 text-slate-100"
                        }`}
                      />
                      <input
                        value={item.plannedMinutes}
                        onChange={(event) => {
                          const next = [...priorityDraft];
                          next[index] = { ...next[index], plannedMinutes: event.currentTarget.value };
                          onPriorityDraftChange(next);
                        }}
                        placeholder="Planned"
                        className={`h-10 rounded-lg border px-2 text-xs tabular-nums outline-none transition-[background-color,border-color,color] duration-150 focus:border-blue-300/50 ${
                          isDone
                            ? "border-emerald-200/15 bg-emerald-950/20 text-emerald-200/70"
                            : "border-white/10 bg-slate-950/70 text-slate-100"
                        }`}
                      />
                      <div className="flex justify-end">
                        <PriorityDraftStatusBadge state={rowState} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <Button onClick={onSavePriorities} className="mt-3 h-9 px-3 text-sm" disabled={isSaving}>
                Save priorities
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <MissionMetric
                icon={Focus}
                label="Focus progress"
                value={`${focusActual}m / ${focusGoal}m`}
                detail={`${focusPercent}% of today's goal`}
              />
              <MissionMetric
                icon={Activity}
                label="Risk"
                value={`${commandCenter?.distractionRisk.level ?? "low"} (${commandCenter?.distractionRisk.score ?? 0})`}
                detail={(commandCenter?.distractionRisk.reasons ?? [])[0] ?? "No attention risks detected"}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Background access</p>
                <Monitor className="h-4 w-4 text-slate-500" />
              </div>
              <p className="text-sm font-semibold text-slate-100">
                {backgroundModeEnabled ? "Tray ready" : "Manual window only"}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {startupEnabled
                  ? "WorkTrace can start quietly with Windows."
                  : "Enable startup from Settings when you want WorkTrace available after sign-in."}
              </p>
              <Button
                variant="ghost"
                onClick={onOpenBackgroundSettings}
                className="mt-3 h-8 px-2 text-xs"
              >
                Background settings
              </Button>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Current active project</p>
                <Layers3 className="h-4 w-4 text-slate-500" />
              </div>
              <p className="truncate text-sm font-semibold text-slate-100">{activeProject}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Current: {currentTask?.title ?? "No task is in progress"}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Upcoming meetings</p>
                <CalendarClock className="h-4 w-4 text-slate-500" />
              </div>
              <div className="space-y-2">
                {upcomingMeetings.length > 0 ? (
                  upcomingMeetings.slice(0, 3).map((meeting) => (
                    <div key={meeting.id} className="flex items-start gap-2 text-xs">
                      <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-200">{meeting.title}</p>
                        <p className="text-slate-500">{formatMeetingTime(meeting.startsAt)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs leading-5 text-slate-500">
                    {(commandCenter?.meetings.length ?? 0) > 0 ? "No more meetings today." : "No meetings on today's calendar."}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Top priorities</p>
                <CheckCheck className="h-4 w-4 text-slate-500" />
              </div>
              <div className="space-y-2">
                {(commandCenter?.topPriorities ?? []).map((item) => (
                  <div key={item.id} className="rounded-lg border border-white/8 bg-white/[0.02] p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-200">{item.rank}. {item.title}</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {item.plannedMinutes ? `${item.plannedMinutes}m planned` : "No planned time"}
                        </p>
                      </div>
                      <PriorityStatusBadge item={item} reminder={remindersByItem.get(item.id)} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.status !== "done" ? (
                        <>
                          <Button onClick={() => onStartPriorityFocus(item)} variant="ghost" className="h-7 px-2 text-xs" disabled={isSaving}>
                            Start focus
                          </Button>
                          <Button onClick={() => onMarkPriorityDone(item)} className="h-7 px-2 text-xs" disabled={isSaving}>
                            {item.id.startsWith("suggested_daily_plan_item_") ? "Save" : "Mark done"}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              <Button
                variant="ghost"
                onClick={() => onSetFocusGoal(240)}
                className="mt-3 h-8 px-2 text-xs"
                disabled={isSaving}
              >
                Reset focus goal to 4h
              </Button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

function MissionMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-cyan-200">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-100">{value}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function TodayFocusPanel({
  activeSession,
  focusGoalMinutes,
  focusActualMinutes,
  projects,
  onStart,
  onStop,
  onCancel,
  isPending,
}: {
  activeSession?: FocusSession | null;
  focusGoalMinutes: number;
  focusActualMinutes: number;
  projects: Project[];
  onStart: (input: { title: string; projectId?: string | null }) => void;
  onStop: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("none");
  const elapsed = useElapsedSeconds(activeSession?.startedAt);
  const focusPercent = Math.min(100, Math.round((focusActualMinutes / Math.max(focusGoalMinutes, 1)) * 100));

  return (
    <Panel className="border-emerald-300/15 bg-[linear-gradient(180deg,rgba(8,33,38,0.72),rgba(6,18,35,0.92))] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Focus Session</h2>
        <Badge tone={activeSession ? "green" : "slate"}>{activeSession ? "Active" : "Idle"}</Badge>
      </div>

      {activeSession ? (
        <div>
          <p className="text-xs text-slate-400">Focused on</p>
          <p className="mt-2 text-base font-semibold leading-6 text-white">{activeSession.title}</p>
          <p className="mt-1 text-xs text-slate-500">{activeSession.projectName ?? activeSession.taskTitle ?? "General focus"}</p>
          <p className="mt-5 text-4xl font-semibold tracking-tight text-slate-100 tabular-nums">{formatElapsed(elapsed)}</p>
          <p className="mt-1 text-xs text-slate-500">Started {formatMeetingTime(activeSession.startedAt)}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="primary" onClick={onStop} disabled={isPending} className="border-rose-500/35 bg-rose-600 hover:bg-rose-500">
              <Square className="h-4 w-4" />
              Stop
            </Button>
            <Button variant="ghost" onClick={onCancel} disabled={isPending}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder="What are you focusing on?"
            className="h-10 w-full rounded-lg border border-white/10 bg-slate-950/65 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-300/50 focus:ring-2 focus:ring-emerald-500/15"
          />
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.currentTarget.value)}
            className="h-10 w-full rounded-lg border border-white/10 bg-slate-950/65 px-3 text-sm text-slate-100 outline-none focus:border-emerald-300/50 focus:ring-2 focus:ring-emerald-500/15"
          >
            <option value="none">General focus</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <Button
            variant="primary"
            onClick={() => {
              onStart({
                title: title.trim() || "Focus session",
                projectId: projectId === "none" ? null : projectId,
              });
              setTitle("");
            }}
            disabled={isPending}
            className="w-full"
          >
            <Play className="h-4 w-4" />
            Start Focus
          </Button>
        </div>
      )}

      <div className="mt-5 border-t border-white/8 pt-4">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-slate-300">Today&apos;s Focus</span>
          <span className="font-medium text-blue-300">{formatMinutes(focusActualMinutes)} / {formatMinutes(focusGoalMinutes)}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-900 ring-1 ring-white/8">
          <div className="h-full rounded-full bg-emerald-300" style={{ width: `${focusPercent}%` }} />
        </div>
        <div className="mt-2 text-right text-xs text-slate-400">{focusPercent}%</div>
      </div>
    </Panel>
  );
}

function CompactCarryoverAssistant({
  tasks,
  isUpdating = false,
  onCarry,
  onDrop,
  onDone,
  onInclude,
}: {
  tasks: WeeklyTask[];
  isUpdating?: boolean;
  onCarry: (task: WeeklyTask) => void;
  onDrop: (task: WeeklyTask) => void;
  onDone: (task: WeeklyTask) => void;
  onInclude: (task: WeeklyTask) => void;
}) {
  return (
    <Panel className="border-white/10 bg-slate-950/45 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-200">Carryover Assistant</h2>
        <Badge tone={tasks.length > 0 ? "blue" : "slate"}>{tasks.length} items</Badge>
      </div>
      <div className="space-y-2">
        {tasks.length > 0 ? (
          tasks.slice(0, 3).map((task) => (
            <div key={task.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-100">{task.title}</p>
                <p className="mt-1 text-xs text-slate-500">From week of {task.weekStartDate}</p>
              </div>
              <div className="flex gap-1">
                <Button disabled={isUpdating} variant="ghost" onClick={() => onCarry(task)} className="h-8 w-8 px-0" aria-label={`Carry ${task.title}`}>
                  <RefreshCw className="h-3.5 w-3.5 text-emerald-300" />
                </Button>
                <Button disabled={isUpdating} variant="ghost" onClick={() => onDone(task)} className="h-8 w-8 px-0" aria-label={`Complete ${task.title}`}>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                </Button>
                <Button disabled={isUpdating || task.includedInReport} variant="ghost" onClick={() => onInclude(task)} className="h-8 w-8 px-0" aria-label={`Add ${task.title} to report`}>
                  <FileText className="h-3.5 w-3.5 text-slate-300" />
                </Button>
                <Button disabled={isUpdating} variant="ghost" onClick={() => onDrop(task)} className="h-8 w-8 px-0" aria-label={`Drop ${task.title}`}>
                  <X className="h-3.5 w-3.5 text-rose-300" />
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs leading-5 text-slate-400">
            No unfinished work is waiting from previous weeks.
          </div>
        )}
      </div>
    </Panel>
  );
}

function TodayNudgeStrip({
  nudges,
  onDismiss,
  isDismissing = false,
}: {
  nudges: TodayNudge[];
  onDismiss: (key: string) => void;
  isDismissing?: boolean;
}) {
  return (
    <Panel className="border-white/10 bg-slate-950/45 p-3">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-200">Nudges</h2>
        <Badge tone="slate">{nudges.length}</Badge>
      </div>
      {nudges.length > 0 ? (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {nudges.slice(0, 4).map((nudge, index) => (
            <div key={nudge.key} className="group relative rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2">
              <button
                type="button"
                disabled={isDismissing}
                onClick={() => onDismiss(nudge.key)}
                className="absolute right-2 top-2 rounded-md p-1 text-slate-600 opacity-0 transition-[opacity,color,background-color] duration-150 hover:bg-white/8 hover:text-white group-hover:opacity-100 disabled:opacity-40"
                aria-label={`Dismiss ${nudge.title}`}
              >
                <X className="h-3 w-3" />
              </button>
              <div className="flex items-start gap-2 pr-4">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                  index % 4 === 0 ? "border-blue-300/20 bg-blue-500/12 text-blue-200" :
                  index % 4 === 1 ? "border-emerald-300/20 bg-emerald-500/12 text-emerald-200" :
                  index % 4 === 2 ? "border-amber-300/20 bg-amber-500/12 text-amber-200" :
                  "border-violet-300/20 bg-violet-500/12 text-violet-200"
                }`}>
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">{nudge.title}</p>
                  <button type="button" onClick={nudge.onAction} className="mt-1 text-xs font-medium text-blue-300 hover:text-blue-200">
                    {nudge.actionLabel}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs leading-5 text-slate-400">
          Nothing needs your attention right now.
        </div>
      )}
    </Panel>
  );
}

function PriorityStatusBadge({
  item,
  reminder,
}: {
  item: DailyPlanItem;
  reminder?: PriorityReminder;
}) {
  if (item.status === "done") return <Badge tone="green">Done</Badge>;
  if (item.status === "dropped") return <Badge tone="slate">Dropped</Badge>;
  if (reminder?.status === "snoozed" && reminder.snoozedUntil) {
    return <Badge tone="blue">Snoozed</Badge>;
  }
  if (reminder?.shownAt) return <Badge tone="orange">Due</Badge>;
  return <Badge tone="slate">Focus</Badge>;
}

function PriorityDraftStatusBadge({
  state,
}: {
  state: "done" | "dropped" | "next" | "empty" | "open";
}) {
  if (state === "done") {
    return (
      <span className="inline-flex h-7 min-w-[68px] items-center justify-center gap-1.5 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-2 text-[11px] font-semibold text-emerald-100">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Done
      </span>
    );
  }
  if (state === "next") {
    return (
      <span className="inline-flex h-7 min-w-[68px] items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-2 text-[11px] font-semibold text-cyan-100">
        Next
      </span>
    );
  }
  if (state === "dropped") {
    return (
      <span className="inline-flex h-7 min-w-[68px] items-center justify-center rounded-lg border border-slate-500/20 bg-slate-800/50 px-2 text-[11px] font-semibold text-slate-400">
        Dropped
      </span>
    );
  }
  if (state === "empty") {
    return (
      <span className="inline-flex h-7 min-w-[68px] items-center justify-center rounded-lg border border-dashed border-slate-600/40 px-2 text-[11px] font-medium text-slate-600">
        Open slot
      </span>
    );
  }
  return (
    <span className="inline-flex h-7 min-w-[68px] items-center justify-center rounded-lg border border-slate-500/20 bg-slate-900/60 px-2 text-[11px] font-semibold text-slate-300">
      Open
    </span>
  );
}

function PriorityReminderPanel({
  reminders,
  isPending,
  onSnooze,
  onDismiss,
  onStartFocus,
  onMarkDone,
}: {
  reminders: PriorityReminder[];
  isPending: boolean;
  onSnooze: (reminder: PriorityReminder) => void;
  onDismiss: (reminder: PriorityReminder) => void;
  onStartFocus: (reminder: PriorityReminder) => void;
  onMarkDone: (reminder: PriorityReminder) => void;
}) {
  const active = reminders.filter((reminder) => reminder.status !== "dismissed");
  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-orange-200" />
          <h2 className="text-sm font-semibold text-white">Priority Reminders</h2>
        </div>
        <span className="text-xs text-slate-500">{active.length} active</span>
      </div>
      <div className="space-y-2">
        {active.length > 0 ? (
          active.slice(0, 3).map((reminder) => (
            <div key={reminder.id} className="rounded-xl border border-orange-300/15 bg-orange-300/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100">{reminder.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    {reminder.projectName ?? "General"} / checkpoint {reminder.checkpointTime}
                    {reminder.snoozedUntil ? ` / snoozed until ${reminder.snoozedUntil}` : ""}
                  </p>
                </div>
                <Badge tone={reminder.status === "snoozed" ? "blue" : "orange"}>
                  {reminder.status === "snoozed" ? "Snoozed" : "Due"}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => onStartFocus(reminder)}>
                  Start focus
                </Button>
                <Button className="h-8 px-2 text-xs" onClick={() => onMarkDone(reminder)}>
                  Mark done
                </Button>
                <Button variant="ghost" className="h-8 px-2 text-xs" disabled={isPending} onClick={() => onSnooze(reminder)}>
                  Snooze
                </Button>
                <Button variant="ghost" className="h-8 px-2 text-xs" disabled={isPending} onClick={() => onDismiss(reminder)}>
                  Dismiss today
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs leading-5 text-slate-400">
            No top-priority reminders are due.
          </div>
        )}
      </div>
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
    <Panel className="border-white/10 bg-slate-950/45 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-200">{title}</h2>
        <Badge tone="slate">{tasks.length} {tasks.length === 1 ? "task" : "tasks"}</Badge>
      </div>
      <div className="space-y-2">
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <div key={task.id} className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <span className="mt-0.5 h-4 w-4 rounded border border-slate-500/50 bg-slate-950" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">{task.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      <span className={task.priority === "high" ? "text-rose-300" : task.priority === "normal" ? "text-blue-300" : "text-slate-400"}>
                        {task.priority}
                      </span>
                      {task.estimatedMinutes ? ` / ${task.estimatedMinutes}m` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" onClick={() => onFocus(task)} className="h-8 w-8 px-0 text-xs" aria-label={`Start focus on ${task.title}`}>
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

function TodayActivityPanel({
  isLoading,
  activityItems,
}: {
  isLoading: boolean;
  activityItems: Array<import("../types/activity").ActivityItem>;
}) {
  return (
    <Panel className="border-white/10 bg-slate-950/45 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-200">Today Activity</h2>
        <Badge tone={activityItems.length > 0 ? "green" : "slate"}>{activityItems.length} items</Badge>
      </div>
      <div className="space-y-2">
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-white/[0.03]" />
        ) : activityItems.length > 0 ? (
          activityItems.slice(0, 7).map((item) => (
            <div key={item.id} className="flex items-start gap-3 rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-300/15 bg-emerald-400/10 text-emerald-200">
                {item.activityType === "commit" ? <GitCommit className="h-3.5 w-3.5" /> : <ClipboardEdit className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-100">{item.summary}</p>
                <p className="mt-1 text-xs text-slate-500">{item.projectName ?? "General"} / {item.activityType}</p>
              </div>
              <span className="shrink-0 text-[11px] text-slate-500 tabular-nums">{formatMeetingTime(item.occurredAt)}</span>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs leading-5 text-slate-400">
            Sync repositories or add a quick log to build today's trail.
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

async function sendPriorityNotification(reminders: PriorityReminder[]) {
  let granted = await isPermissionGranted();
  if (!granted) {
    const permission = await requestPermission();
    granted = permission === "granted";
  }
  if (!granted) return;
  sendNotification({
    title: "Today focus reminder",
    body:
      reminders.length === 1
        ? reminders[0].title
        : `${reminders.length} top priorities still need attention.`,
    autoCancel: true,
  });
}

function buildTodayNudges(input: {
  activityCount: number;
  blockerCount: number;
  reportReadyCount: number;
  hasSyncableProjects: boolean;
  hasPreviousOpenTasks: boolean;
  staleInProgressCount: number;
  focusStartedAt: string | null;
  todayDate: string;
  frictionInsights: FrictionInsight[];
  onFrictionAction: (insight: FrictionInsight) => void;
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

  const nudgeableFrictionKinds = new Set([
    "project_switching",
    "context_switching",
    "stale_task",
    "repeated_issue",
    "late_report",
    "support_mode",
    "meeting_recovery_gap",
    "focus_fragmentation",
  ]);
  const frictionNudges = input.frictionInsights
    .filter((item) =>
      (item.severity === "high" || nudgeableFrictionKinds.has(item.kind)) &&
      ["strong", "likely"].includes(item.confidenceLabel ?? "likely") &&
      isTodayFrictionInsight(item, input.todayDate),
    )
    .slice(0, 3);

  for (const insight of frictionNudges) {
    nudges.push({
      key: insight.nudgeKey,
      title: insight.title,
      detail: insight.recommendation || insight.detail,
      actionLabel: insight.actionLabel,
      onAction: () => input.onFrictionAction(insight),
    });
  }

  return nudges;
}

function isTodayFrictionInsight(insight: FrictionInsight, todayDate: string) {
  if (insight.date && insight.date !== todayDate) {
    return false;
  }

  const datedEvidence = insight.evidenceItems.filter((item) => item.date);
  if (datedEvidence.length > 0) {
    return datedEvidence.some((item) => item.date === todayDate);
  }

  if (insight.scope?.from && insight.scope?.to) {
    return insight.scope.from <= todayDate && insight.scope.to >= todayDate;
  }

  return true;
}

function minutesSince(timestamp: string) {
  const started = new Date(timestamp).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.floor((Date.now() - started) / 60_000);
}

function useElapsedSeconds(startedAt?: string) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return useMemo(() => {
    if (!startedAt) return 0;
    const started = new Date(startedAt).getTime();
    if (Number.isNaN(started)) return 0;
    return Math.max(0, Math.floor((now - started) / 1_000));
  }, [now, startedAt]);
}

function formatElapsed(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
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

function formatMeetingTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
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
