import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { TodayPage } from "../pages/TodayPage";
import { DashboardPage } from "../pages/DashboardPage";
import { FrictionPage } from "../pages/FrictionPage";
import { ToastProvider } from "../components/ui/ToastProvider";
import { SpeechProvider } from "../components/ui/SpeechProvider";
import { WorkTraceCommandError } from "../lib/api/client";
import { shouldRetryQueryError } from "../app/providers";
import { RepositorySyncProvider } from "../features/repositorySync/RepositorySyncProvider";

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: "main" }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn().mockResolvedValue(null),
}));

vi.mock("../lib/api/activity", () => ({ listActivity: vi.fn().mockResolvedValue([]) }));
vi.mock("../lib/api/gitSync", () => ({ syncCommits: vi.fn().mockResolvedValue({ newCommits: 0, updatedCommits: 0 }) }));
vi.mock("../lib/api/friction", () => ({ getFrictionInsights: vi.fn().mockResolvedValue([]) }));
vi.mock("../lib/api/sparcForce", () => ({
  getSparcForceIntegrationStatus: vi.fn().mockResolvedValue({ status: "disconnected" }),
  syncSparcForce: vi.fn().mockResolvedValue({}),
}));
vi.mock("../lib/api/projects", () => ({
  listProjects: vi.fn().mockResolvedValue([]),
}));
vi.mock("../lib/api/settings", () => ({
  getSettings: vi.fn().mockResolvedValue({
    name: "Test User",
    email: "test@example.com",
    onboardingDismissedWelcome: true,
    onboardingCompleted: true,
    onboardingDismissedChecklist: true,
  }),
  updateSettings: vi.fn().mockResolvedValue({}),
  exportSettingsToFile: vi.fn().mockResolvedValue(undefined),
  importSettings: vi.fn().mockResolvedValue({}),
}));
vi.mock("../lib/api/todoWidget", () => ({ toggleTodoWidget: vi.fn().mockResolvedValue(true) }));
vi.mock("../lib/api/appUpdates", () => ({
  getAppVersion: vi.fn().mockResolvedValue({ version: "0.1.1" }),
  getReleaseNotes: vi.fn().mockResolvedValue({ currentVersion: "0.1.1", entries: [] }),
  checkForAppUpdate: vi.fn().mockResolvedValue({ updateAvailable: false }),
  installAppUpdate: vi.fn().mockResolvedValue(false),
}));
vi.mock("../lib/api/dailyPlan", () => ({
  getTodayCommandCenter: vi.fn().mockRejectedValue(
    new Error("desktop only"),
  ),
  upsertDailyPlan: vi.fn().mockResolvedValue({}),
  replaceDailyPlanItems: vi.fn().mockResolvedValue([]),
  updateDailyPlanItem: vi.fn().mockResolvedValue({}),
}));
vi.mock("../lib/api/weeklyTasks", () => ({
  listWeeklyTasks: vi.fn().mockRejectedValue(
    new Error("desktop only"),
  ),
  createWeeklyTask: vi.fn().mockResolvedValue({}),
  updateWeeklyTask: vi.fn().mockResolvedValue({}),
}));
vi.mock("../lib/api/focusSessions", () => ({
  getActiveFocusSession: vi.fn().mockResolvedValue(null),
  listFocusSessions: vi.fn().mockRejectedValue(
    new Error("desktop only"),
  ),
  startFocusSession: vi.fn().mockResolvedValue({}),
  stopFocusSession: vi.fn().mockResolvedValue({}),
  cancelFocusSession: vi.fn().mockResolvedValue({}),
}));
vi.mock("../lib/api/nudges", () => ({
  listNudgeDismissals: vi.fn().mockResolvedValue([]),
  dismissNudge: vi.fn().mockResolvedValue({}),
}));
vi.mock("../lib/api/manualLogs", () => ({
  createManualLog: vi.fn().mockResolvedValue({}),
}));
vi.mock("../lib/api/dashboard", () => ({
  getDashboardStats: vi.fn().mockRejectedValue(
    new Error("desktop only"),
  ),
  getWeeklyActivityHours: vi.fn().mockRejectedValue(
    new Error("desktop only"),
  ),
  getProjectBreakdown: vi.fn().mockRejectedValue(
    new Error("desktop only"),
  ),
}));

function renderWithProviders(node: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RepositorySyncProvider>
        <MemoryRouter>
          <SpeechProvider>
            <ToastProvider>{node}</ToastProvider>
          </SpeechProvider>
        </MemoryRouter>
      </RepositorySyncProvider>
    </QueryClientProvider>,
  );
}

describe("browser-only runtime smoke", () => {
  it("renders AppLayout without crashing", async () => {
    const { container } = renderWithProviders(<AppLayout><div>child</div></AppLayout>);
    await waitFor(() => expect(container).toBeTruthy());
  });

  it("renders Today page with Tauri-unavailable query failures", async () => {
    const { container } = renderWithProviders(<TodayPage />);
    await waitFor(() => expect(container).toBeTruthy());
  });

  it("renders Dashboard page with Tauri-unavailable query failures", async () => {
    const { container } = renderWithProviders(<DashboardPage />);
    await waitFor(() => expect(container).toBeTruthy());
  });

  it("renders Friction page with empty local insights", async () => {
    const { container } = renderWithProviders(<FrictionPage />);
    await waitFor(() => expect(container).toBeTruthy());
  });

  it("does not retry TAURI_RUNTIME_UNAVAILABLE errors", () => {
    const error = new WorkTraceCommandError("x", "TAURI_RUNTIME_UNAVAILABLE", "desktop only");
    expect(shouldRetryQueryError(0, error)).toBe(false);
  });
});
