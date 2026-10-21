import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { TodayPage } from "../pages/TodayPage";
import App from "../app/App";
import { ReportsPage } from "../pages/ReportsPage";
import { ActivityTimelinePage } from "../pages/ActivityTimelinePage";
import { TaskManagerPage } from "../pages/TaskManagerPage";
import { ReportsWorkspaceProvider } from "../pages/reportsWorkspace";
import { TasksWorkspace } from "../features/experience/TasksWorkspace";
import { TodayQuickAddBar } from "../components/ui/TodayQuickAddBar";
import { Disclosure } from "../components/ui/Disclosure";
import { RepositorySyncProvider } from "../features/repositorySync/RepositorySyncProvider";
import { SpeechProvider } from "../components/ui/SpeechProvider";
import { ToastProvider } from "../components/ui/ToastProvider";
import { todayRange } from "../lib/dates";
import type { WeeklyTask } from "../types/weeklyTask";
import type { ActivityGroup } from "../types/activityGroup";
import type { ActivityItem } from "../types/activity";

const api = vi.hoisted(() => ({
  settings: vi.fn(), tasks: vi.fn(), createTask: vi.fn(), updateTask: vi.fn(),
  activity: vi.fn(), groups: vi.fn(), heatmap: vi.fn(), summary: vi.fn(), highlights: vi.fn(),
  reports: vi.fn(), generate: vi.fn(), saveReport: vi.fn(), getReport: vi.fn(),
}));
vi.mock("../lib/api/settings", () => ({
  getSettings: api.settings,
  updateSettings: vi.fn(),
  importSettings: vi.fn(),
  exportSettingsToFile: vi.fn(),
}));
vi.mock("../lib/api/projects", () => ({ listProjects: vi.fn(async () => []), listGitRefs: vi.fn(async () => []), listGitWorktrees: vi.fn(async () => []), getProjectGitFocus: vi.fn() }));
vi.mock("../lib/api/weeklyTasks", () => ({ listWeeklyTasks: api.tasks, listTasks: api.tasks, createWeeklyTask: api.createTask, updateWeeklyTask: api.updateTask, deleteWeeklyTask: vi.fn() }));
vi.mock("../lib/api/activity", () => ({ listActivity: api.activity, getActivityHeatmap: api.heatmap, getWeekSummary: api.summary, getKeyHighlights: api.highlights }));
vi.mock("../lib/api/activityGroups", () => ({ listActivityGroups: api.groups, suggestActivityGroups: vi.fn(), recordActivityGroupTitleFeedback: vi.fn(), refreshActivityGroupSuggestions: vi.fn(), selectActivityGroupTitleCandidate: vi.fn(), updateActivityGroup: vi.fn() }));
vi.mock("../lib/api/reports", () => ({ listReports: api.reports, generateReport: api.generate, getReport: api.getReport, saveReport: api.saveReport, getReportAiStatus: vi.fn(async () => ({ providers: [] })), analyzeReportReadiness: vi.fn(), polishReport: vi.fn(), cancelReportAiStream: vi.fn(), listReportNotes: vi.fn(async () => []), saveDailyReviewNote: vi.fn() }));
vi.mock("../lib/api/friction", () => ({ getFrictionInsights: vi.fn(async () => []) }));
vi.mock("../lib/api/calendar", () => ({ getWeekCapacity: vi.fn(async () => ({ days: [] })) }));
vi.mock("../lib/api/focusSessions", () => ({ getActiveFocusSession: vi.fn(async () => null), listFocusSessions: vi.fn(async () => []), startFocusSession: vi.fn(), stopFocusSession: vi.fn(), cancelFocusSession: vi.fn() }));
vi.mock("../lib/api/manualLogs", () => ({ listManualLogs: vi.fn(async () => []), createManualLog: vi.fn() }));
vi.mock("../lib/api/nudges", () => ({ listNudgeDismissals: vi.fn(async () => []), dismissNudge: vi.fn() }));
vi.mock("../lib/api/priorityReminders", () => ({ listPriorityReminders: vi.fn(async () => []), runPriorityReminderCheck: vi.fn(), dismissPriorityReminder: vi.fn(), snoozePriorityReminder: vi.fn() }));
vi.mock("../lib/api/embeddings", () => ({ getEmbeddingStatus: vi.fn(async () => ({ available: false })), getBackgroundJobStatus: vi.fn(async () => ({ queued: 0, running: 0 })), semanticActivitySearch: vi.fn(async () => []), queueActivityEmbeddingRefresh: vi.fn(), runBackgroundJobsOnce: vi.fn() }));
vi.mock("../lib/api/dailyPlan", () => ({ getTodayCommandCenter: vi.fn(async () => ({ topPriorities: [], meetings: [], focusGoalMinutes: 120, focusActualMinutes: 0, plannedVsActual: [], distractionRisk: { level: "low", reasons: [] }, endOfDayProgress: { totalPriorities: 0, completedPriorities: 0, plannedMinutes: 0, actualMinutes: 0, varianceMinutes: 0 } })), replaceDailyPlanItems: vi.fn(), updateDailyPlanItem: vi.fn(), upsertDailyPlan: vi.fn() }));

const day = todayRange().date;
const task: WeeklyTask = { id: "task", title: "Prepare patch", taskType: "follow_up", status: "todo", weekStartDate: day, targetDate: day, priority: "normal", includedInReport: true, estimatedMinutes: 45, createdAt: day, updatedAt: day };
const commit: ActivityItem = { id: "commit", summary: "fix: preserve task links", activityType: "commit", occurredAt: `${day}T10:00:00`, includedInReport: true, commitHash: "a".repeat(40), refs: [] };
const group: ActivityGroup = { id: "group", title: "Improve task linking", summary: "Preserve evidence links", projectCount: 1, projects: [], source: "local_rule", confidence: 0.95, confidenceLabel: "strong", includedInReport: true, locked: true, reviewStatus: "reviewed", startDate: day, endDate: day, createdAt: day, updatedAt: day, items: [{ id: "link", groupId: "group", sourceType: "commit", sourceId: commit.id, summarySnapshot: commit.summary, occurredAt: commit.occurredAt, createdAt: day, activity: commit }] };

function mount(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, networkMode: "always" }, mutations: { retry: false, networkMode: "always" } } });
  client.setQueryData(["settings"], { experienceMode: "developer", experienceConfigured: true, enabledFeatures: [], name: "", email: "", weekStartsOn: "monday", onboardingCompleted: true, onboardingDismissedWelcome: true, onboardingDismissedChecklist: true, reportAiProvider: "local_llama_cpp" });
  return render(<QueryClientProvider client={client}><RepositorySyncProvider><MemoryRouter><SpeechProvider><ToastProvider>{children}</ToastProvider></SpeechProvider></MemoryRouter></RepositorySyncProvider></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  api.settings.mockResolvedValue({ experienceMode: "developer", experienceConfigured: true, enabledFeatures: [], weekStartsOn: "monday", onboardingCompleted: true, onboardingDismissedWelcome: true, onboardingDismissedChecklist: true, reportAiProvider: "local_llama_cpp" });
  api.tasks.mockResolvedValue([task]); api.createTask.mockResolvedValue(task); api.updateTask.mockImplementation(async (_id, input) => ({ ...task, ...input }));
  api.activity.mockResolvedValue([]); api.groups.mockResolvedValue([group]); api.heatmap.mockResolvedValue({ cells: [], maxCount: 0 }); api.summary.mockResolvedValue(null); api.highlights.mockResolvedValue(null);
  api.reports.mockResolvedValue([]); api.generate.mockResolvedValue({ title: "Weekly update", content: "Draft from local evidence", startDate: day, endDate: day }); api.saveReport.mockResolvedValue({ id: "saved" });
});
afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); });

describe("progressive Developer workflows", () => {
  it("shows one daily work list and keeps planning and diagnostics out of the initial view", async () => {
    mount(<TodayPage />);
    expect(await screen.findByRole("button", { name: "Complete Prepare patch" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Prepare patch" })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Report Readiness" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync activity" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Today actions" }));
    expect(screen.getByRole("button", { name: "Prepare report" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "Today actions" }), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Plan your day" }));
    expect(screen.getByRole("button", { name: "Plan your day", expanded: true })).toBeInTheDocument();
  });

  it("retains a failed quick task draft and saves with title-only defaults", async () => {
    const add = vi.fn().mockRejectedValueOnce(new Error("Database busy")).mockResolvedValueOnce(task);
    mount(<TodayQuickAddBar projects={[]} todayDate={day} onAdd={add} />);
    fireEvent.change(screen.getByRole("textbox", { name: "New task for today" }), { target: { value: "Keep this draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("textbox", { name: "New task for today" })).toHaveValue("Keep this draft");
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "New task for today" })).toHaveValue(""));
    expect(add).toHaveBeenLastCalledWith({ title: "Keep this draft", priority: "normal", projectId: null, targetDate: day });
  });

  it("keeps collapsed form values and closes details with Escape", () => {
    mount(<Disclosure title="Options"><label>Notes<input defaultValue="Keep me" /></label></Disclosure>);
    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    const input = screen.getByRole("textbox", { name: "Notes" }); input.focus();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "Notes" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("Keep me");
  });

  it("generates with retained source choices, keeps the draft while options change, and saves it", async () => {
    mount(<ReportsWorkspaceProvider><ReportsPage /></ReportsWorkspaceProvider>);
    expect(screen.queryByRole("checkbox", { name: "Include commits" })).not.toBeInTheDocument();
    expect(screen.queryByText("Online AI Keys")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Report options/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Include commits" }));
    fireEvent.click(screen.getByRole("button", { name: /Report options/ }));
    fireEvent.click(screen.getByRole("button", { name: "Generate Report" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Report draft" })).toHaveValue("Draft from local evidence"));
    expect(api.generate).toHaveBeenCalledWith(expect.objectContaining({ includeCommits: false, includeWeeklyTasks: true, includeManualLogs: true, includeHidden: false }));
    fireEvent.change(screen.getByRole("textbox", { name: "Report draft" }), { target: { value: "My edited report" } });
    fireEvent.click(screen.getByRole("button", { name: /Report options/ }));
    fireEvent.click(screen.getByRole("button", { name: /Report options/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.saveReport).toHaveBeenCalledWith(expect.objectContaining({ content: "My edited report" })));
  });

  it("keeps history failures distinct from an empty history", async () => {
    api.reports.mockRejectedValue(new Error("Unavailable"));
    mount(<ReportsWorkspaceProvider><ReportsPage /></ReportsWorkspaceProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Saved reports/ }));
    await screen.findByText("Saved reports could not be loaded.");
    expect(screen.queryByText("Saved reports will appear here after you save your first update.")).not.toBeInTheDocument();
  });

  it("loads a saved report into the same editable draft", async () => {
    api.reports.mockResolvedValue([{ id: "saved", title: "Earlier update", startDate: day, endDate: day, createdAt: day }]);
    api.getReport.mockResolvedValue({ id: "saved", title: "Earlier update", startDate: day, endDate: day, content: "Saved local content" });
    mount(<ReportsWorkspaceProvider><ReportsPage /></ReportsWorkspaceProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Saved reports/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Earlier update/ }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Report draft" })).toHaveValue("Saved local content"));
    expect(api.getReport).toHaveBeenCalledWith("saved", expect.anything());
  });

  it("keeps a report draft when leaving the report screen and returning", async () => {
    window.history.replaceState({}, "", "/reports");
    render(<App />);
    const draft = await screen.findByRole("textbox", { name: "Report draft" });
    fireEvent.change(draft, { target: { value: "Keep my report while I check tasks" } });
    fireEvent.click(screen.getByRole("link", { name: "Tasks" }));
    await screen.findByRole("heading", { name: "Tasks" });
    fireEvent.click(screen.getByRole("link", { name: "Reports" }));
    expect(await screen.findByRole("textbox", { name: "Report draft" })).toHaveValue("Keep my report while I check tasks");
  });

  it("opens grouped evidence in a side panel and restores access after Escape", async () => {
    api.activity.mockResolvedValue([{ date: day, items: [commit] }]);
    mount(<ActivityTimelinePage />);
    const inspect = await screen.findByRole("button", { name: "Open work item: Improve task linking" });
    inspect.focus(); fireEvent.click(inspect);
    const panel = screen.getByRole("dialog", { name: "Work item details" });
    expect(within(panel).getByText("fix: preserve task links")).toBeInTheDocument();
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(inspect).toHaveFocus();
    expect(api.heatmap).not.toHaveBeenCalled();
  });

  it("makes ungrouped raw commits available without changing the stored evidence", async () => {
    const raw = { ...commit, id: "raw", summary: "Unrelated raw evidence", commitHash: "b".repeat(40) };
    api.activity.mockResolvedValue([{ date: day, items: [commit, raw] }]);
    mount(<ActivityTimelinePage />);
    await screen.findByRole("button", { name: "Open work item: Improve task linking" });
    expect(screen.queryByText("Unrelated raw evidence")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Filters.*All work/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Show raw commits alongside work items" }));
    await screen.findByText("Unrelated raw evidence");
    expect(group.items[0].sourceId).toBe(commit.id);
  });

  it("offers List and Weekly board together and exposes the full editor only on request", async () => {
    mount(<TasksWorkspace><TaskManagerPage /></TasksWorkspace>);
    const views = screen.getByRole("navigation", { name: "Task views" });
    expect(within(views).getByRole("link", { name: "Weekly board" })).toHaveAttribute("href", "/weekly-plan");
    fireEvent.click(await screen.findByRole("button", { name: "Edit Prepare patch" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Task" }), { target: { value: "Keep this edit" } });
    fireEvent.click(screen.getByRole("button", { name: "More task options" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
    expect(screen.getByText("Estimate (minutes)")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Keep this edit");
    fireEvent.click(screen.getByRole("button", { name: "Save Task" }));
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ title: "Keep this edit", taskType: "follow_up", estimatedMinutes: 45, includedInReport: true, weekStartDate: task.weekStartDate, targetDate: task.targetDate })));
    expect(api.createTask).not.toHaveBeenCalled();
  });
});
