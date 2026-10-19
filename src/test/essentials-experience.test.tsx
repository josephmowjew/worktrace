import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { TaskManagerPage } from "../pages/TaskManagerPage";
import { EssentialsJournalPage } from "../pages/EssentialsJournalPage";
import { ExperienceWelcome } from "../features/experience/ExperienceWelcome";
import { ExperiencePreferences } from "../features/experience/ExperiencePreferences";
import { FeatureGate } from "../features/experience/FeatureGate";
import { experienceMode, featureEnabled } from "../features/experience/useExperience";
import { visibleTasks } from "../features/experience/taskViews";
import { WorkspaceNavigation } from "../components/layout/WorkspaceNavigation";
import { createBaseCommandActions } from "../components/ui/CommandPalette";
import { ToastProvider } from "../components/ui/ToastProvider";
import { getSettings, updateSettings } from "../lib/api/settings";
import { createWeeklyTask, listTasks, updateWeeklyTask, deleteWeeklyTask } from "../lib/api/weeklyTasks";
import { getActiveFocusSession } from "../lib/api/focusSessions";
import { createManualLog, listManualLogs } from "../lib/api/manualLogs";
import { todayRange } from "../lib/dates";
import type { Settings } from "../types/settings";
import type { WeeklyTask } from "../types/weeklyTask";

vi.mock("../lib/api/settings", () => ({ getSettings: vi.fn(), updateSettings: vi.fn() }));
vi.mock("../lib/api/weeklyTasks", () => ({ listTasks: vi.fn(), createWeeklyTask: vi.fn(), updateWeeklyTask: vi.fn(), deleteWeeklyTask: vi.fn() }));
vi.mock("../lib/api/focusSessions", () => ({ getActiveFocusSession: vi.fn(), startFocusSession: vi.fn(), stopFocusSession: vi.fn(), cancelFocusSession: vi.fn() }));
vi.mock("../lib/api/manualLogs", () => ({ listManualLogs: vi.fn(), createManualLog: vi.fn(), updateManualLog: vi.fn() }));

let settings: Settings;
let tasks: WeeklyTask[];
const day = todayRange().date;
function task(id: string, overrides: Partial<WeeklyTask> = {}): WeeklyTask {
  return { id, title: id, weekStartDate: "2020-01-01", status: "todo", taskType: "planned_work", priority: "normal", includedInReport: false, createdAt: "2020-01-01", updatedAt: "2020-01-01", ...overrides };
}
function LocationProbe() { const location = useLocation(); return <output aria-label="Current route">{location.pathname}</output>; }
function mount(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(["settings"], settings);
  render(<QueryClientProvider client={client}><MemoryRouter><ToastProvider>{children}<LocationProbe /></ToastProvider></MemoryRouter></QueryClientProvider>);
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  settings = { experienceMode: "essentials", experienceConfigured: true, enabledFeatures: [], weekStartsOn: "monday", theme: "dark", name: "", email: "" } as unknown as Settings;
  tasks = [];
  vi.mocked(getSettings).mockImplementation(async () => settings);
  vi.mocked(updateSettings).mockImplementation(async (input) => { settings = { ...settings, ...input }; return settings; });
  vi.mocked(listTasks).mockImplementation(async () => [...tasks]);
  vi.mocked(createWeeklyTask).mockImplementation(async (input) => { const created = task(`new-${tasks.length}`, { ...input, priority: input.priority ?? "normal", status: input.status ?? "todo", includedInReport: input.includedInReport ?? false }); tasks.push(created); return created; });
  vi.mocked(updateWeeklyTask).mockImplementation(async (id, input) => { const index = tasks.findIndex((task) => task.id === id); tasks[index] = { ...tasks[index], ...input, status: input.status ?? tasks[index].status, priority: input.priority ?? tasks[index].priority, includedInReport: input.includedInReport ?? tasks[index].includedInReport, updatedAt: String(Date.now()) }; return tasks[index]; });
  vi.mocked(deleteWeeklyTask).mockResolvedValue(true);
  vi.mocked(getActiveFocusSession).mockResolvedValue(null);
  vi.mocked(listManualLogs).mockResolvedValue([]);
});
afterEach(cleanup);

describe("Essentials task experience", () => {
  it("creates a task from a title without exposing development or reporting fields", async () => {
    mount(<TaskManagerPage todayOnly />);
    await screen.findByText("Start with one thing.");
    expect(screen.queryByText("Week Start")).not.toBeInTheDocument();
    expect(screen.queryByText("Include in weekly report")).not.toBeInTheDocument();
    expect(screen.queryByText("Sync Repos")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "New task" }), { target: { value: "Call the supplier" } });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    await screen.findByText("Call the supplier");
    expect(createWeeklyTask).toHaveBeenCalledWith(expect.objectContaining({ title: "Call the supplier", taskType: "planned_work", includedInReport: false, targetDate: null }));
    expect(getActiveFocusSession).not.toHaveBeenCalled();
  });

  it("keeps overdue and undated tasks on Today, while future and completed history remain in Tasks", () => {
    const source = [task("overdue", { targetDate: "2020-01-02" }), task("undated"), task("future", { targetDate: "2099-01-01" }), task("completed", { status: "completed", completedAt: "2020-01-03" })];
    expect(visibleTasks(source, "open", day, "", true).map((task) => task.id)).toEqual(["overdue", "undated"]);
    expect(visibleTasks(source, "completed", day).map((task) => task.id)).toEqual(["completed"]);
    expect(visibleTasks(source, "upcoming", day).map((task) => task.id)).toEqual(["future"]);
  });

  it("completes and reopens a task using the same record", async () => {
    tasks = [task("Send update")];
    mount(<TaskManagerPage todayOnly />);
    fireEvent.click(await screen.findByRole("button", { name: "Complete Send update" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reopen Send update" }));
    await screen.findByRole("button", { name: "Complete Send update" });
    expect(tasks).toHaveLength(1);
    expect(updateWeeklyTask).toHaveBeenLastCalledWith("Send update", { status: "todo", completedAt: "" });
  });

  it("edits basic details without resetting Developer metadata", async () => {
    tasks = [task("Original", { includedInReport: true, projectId: "repo", taskType: "follow_up", progressPercent: 75, estimatedMinutes: 90, details: "Existing notes" })];
    mount(<TaskManagerPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Original" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Task" }), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Renamed");
    expect(tasks[0]).toMatchObject({ id: "Original", title: "Renamed", includedInReport: true, projectId: "repo", taskType: "follow_up", progressPercent: 75, estimatedMinutes: 90 });
    expect(updateWeeklyTask).toHaveBeenCalledWith("Original", expect.not.objectContaining({ weekStartDate: expect.anything() }));
  });

  it("shows load failures without claiming that the task list is empty", async () => {
    vi.mocked(listTasks).mockRejectedValue(new Error("Database unavailable"));
    mount(<TaskManagerPage />);
    await screen.findByText("Tasks couldn't be loaded");
    expect(screen.queryByText("Start with one thing.")).not.toBeInTheDocument();
  });
});

describe("experience selection and disclosure", () => {
  it("offers a first-run choice without requesting an identity or repository", async () => {
    settings.experienceConfigured = false;
    mount(<ExperienceWelcome />);
    fireEvent.click(screen.getByRole("button", { name: /Start with Essentials/ }));
    await waitFor(() => expect(vi.mocked(updateSettings).mock.calls[0]?.[0]).toMatchObject({ experienceMode: "essentials", experienceConfigured: true, onboardingCompleted: true }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Current route")).toHaveTextContent("/");
  });

  it("keeps first-run selection retryable after a failed save", async () => {
    vi.mocked(updateSettings).mockRejectedValue(new Error("Write failed"));
    mount(<ExperienceWelcome />);
    fireEvent.click(screen.getByRole("button", { name: /Use Developer/ }));
    await screen.findByRole("alert");
    expect(settings.experienceMode).toBe("essentials");
    expect(screen.getByLabelText("Current route")).toHaveTextContent("/");
  });

  it("updates navigation when tools and Developer mode are enabled", async () => {
    mount(<><ExperiencePreferences /><WorkspaceNavigation isOpen onClose={() => {}} onNavigate={() => {}} onWidget={() => {}} widgetPending={false} name="Local workspace" avatar={null} /></>);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Today", "Tasks"]);
    fireEvent.click(screen.getByRole("checkbox", { name: /Reports/ }));
    await within(nav).findByRole("link", { name: "Reports" });
    fireEvent.click(screen.getByRole("button", { name: /^Developer/ }));
    await within(nav).findByRole("link", { name: "Repositories" });
    expect(settings.enabledFeatures).toContain("reports");
  });

  it("does not mount disabled tools behind a direct link", async () => {
    mount(<FeatureGate title="Repositories"><div>Repository internals</div></FeatureGate>);
    expect(screen.queryByText("Repository internals")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Developer" }));
    await screen.findByText("Repository internals");
  });

  it("omits developer commands and adds only enabled optional tools", () => {
    const actions = createBaseCommandActions({ projects: [], navigate: vi.fn(), onSync: vi.fn(), onScanRepos: vi.fn(), onToggleWidget: vi.fn(), isDeveloper: false, enabledFeatures: ["reports"] });
    expect(actions.some((action) => action.id === "nav-tasks")).toBe(true);
    expect(actions.some((action) => action.id === "nav-reports")).toBe(true);
    expect(actions.some((action) => action.id === "sync-now" || action.id === "focus-start" || action.id === "nav-projects")).toBe(false);
    expect(experienceMode({})).toBe("developer");
    expect(featureEnabled(settings, "focus")).toBe(false);
  });

  it("adds a journal note without requiring a category or repository", async () => {
    settings.enabledFeatures = ["journal"];
    const note = { id: "note", date: day, summary: "Met the client", activityType: "AdminTask" as const, includedInReport: false, isDraft: false };
    vi.mocked(createManualLog).mockResolvedValue(note);
    mount(<EssentialsJournalPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "What happened?" }), { target: { value: "Met the client" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(createManualLog).toHaveBeenCalledWith(expect.objectContaining({ summary: "Met the client", includedInReport: false })));
  });
});
