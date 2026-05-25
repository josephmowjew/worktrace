import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, ClipboardEdit, FileText, GitCommit, ListChecks, Plus, RefreshCw, Sparkles, Target, Focus } from "lucide-react";
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
import { dismissNudge, listNudgeDismissals } from "../lib/api/nudges";
import { listProjects } from "../lib/api/projects";
import { listReportNotes, saveDailyReviewNote } from "../lib/api/reports";
import { getSettings } from "../lib/api/settings";
import { getWeekCapacity } from "../lib/api/calendar";
import { weeklyTaskQueryRoots } from "../lib/api/queryKeys";
import { createWeeklyTask, listWeeklyTasks, updateWeeklyTask } from "../lib/api/weeklyTasks";
import { currentWeekRange, todayRange } from "../lib/dates";
import type { CreateManualLogInput } from "../types/manualLog";
import type { StopFocusSessionInput } from "../types/focusSession";
import type { WeeklyTask, WeeklyTaskPriority, WeeklyTaskStatus, WeeklyTaskType } from "../types/weeklyTask";

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

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
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
    onSuccess: async (result) => {
      await invalidateDailyViews();
      toast.success(
        "Sync complete",
        `Added ${result.newCommits} commits and updated ${result.updatedCommits}.`,
      );
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
    onSuccess: async () => {
      await invalidateDailyViews();
      setTaskModalOpen(false);
      toast.success("Task added");
      speech.announce("Task added.", { category: "task" });
    },
    onError: (error) => {
      toast.error("Task save failed", error instanceof Error ? error.message : "The task could not be saved.");
    },
  });

  const createLogMutation = useMutation({
    mutationFn: (input: CreateManualLogInput) => createManualLog(input),
    onSuccess: async () => {
      await invalidateDailyViews();
      setLogModalOpen(false);
      toast.success("Manual log saved");
    },
    onError: (error) => {
      toast.error("Manual log failed", error instanceof Error ? error.message : "The log could not be saved.");
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateWeeklyTask>[1] }) =>
      updateWeeklyTask(id, input),
    onSuccess: async () => {
      await invalidateDailyViews();
      toast.success("Task updated");
      speech.announce("Task updated.", { category: "task" });
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

  return (
    <div className="space-y-4">
      <Panel className="relative overflow-hidden p-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_20%,rgba(59,130,246,0.22),transparent_28%),radial-gradient(circle_at_84%_10%,rgba(20,184,166,0.14),transparent_26%),linear-gradient(135deg,rgba(15,23,42,0.2),rgba(15,23,42,0.82))]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              <Sparkles className="h-3.5 w-3.5" />
              Daily workflow
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">Today</h1>
            <p className="mt-2 text-sm text-slate-400">{today.label} / {weekRange.label}</p>
          </div>
          <div className="flex flex-wrap gap-2">
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
          </div>
        </div>
      </Panel>

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
    <Panel className="p-4">
      <Icon className="h-5 w-5 text-cyan-200" />
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-white">{value}</p>
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

function ReadinessRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <CheckCircle2 className={`h-4 w-4 ${done ? "text-emerald-300" : "text-slate-600"}`} />
      <span>{label}</span>
    </div>
  );
}
