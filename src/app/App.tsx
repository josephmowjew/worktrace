import { Navigate, Route, Routes } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppLayout } from "../components/layout/AppLayout";
import { FloatingTodoWidget } from "../components/todo/FloatingTodoWidget";
import { ActivityTimelinePage } from "../pages/ActivityTimelinePage";
import { BackupPage } from "../pages/BackupPage";
import { DashboardPage } from "../pages/DashboardPage";
import { GuidePage } from "../pages/GuidePage";
import { ManualLogPage } from "../pages/ManualLogPage";
import { OnboardingPage } from "../pages/OnboardingPage";
import { ProjectDetailPage } from "../pages/ProjectDetailPage";
import { ProjectsPage } from "../pages/ProjectsPage";
import { QuickCaptureWindow } from "../pages/QuickCaptureWindow";
import { ReportsPage } from "../pages/ReportsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { TodayPage } from "../pages/TodayPage";
import { WeeklyPlanPage } from "../pages/WeeklyPlanPage";
import { ReportsWorkspaceProvider } from "../pages/reportsWorkspace";
import { AppProviders } from "./providers";

function getTauriWindowLabel() {
  const tauriWindow = window as Window & {
    __TAURI_INTERNALS__?: unknown;
  };

  if (!tauriWindow.__TAURI_INTERNALS__) return null;

  try {
    return getCurrentWindow().label;
  } catch {
    return null;
  }
}

export default function App() {
  const windowLabel = getTauriWindowLabel();

  if (windowLabel === "quick-capture") {
    return (
      <AppProviders>
        <QuickCaptureWindow />
      </AppProviders>
    );
  }

  if (windowLabel === "widget") {
    return (
      <AppProviders>
        <FloatingTodoWidget />
      </AppProviders>
    );
  }

  return (
    <AppProviders>
      <Routes>
        <Route path="/widget" element={<FloatingTodoWidget />} />
        <Route path="/quick-capture" element={<QuickCaptureWindow />} />
        <Route
          path="/*"
          element={
            <AppLayout>
              <Routes>
                <Route path="/" element={<TodayPage />} />
                <Route path="/onboarding" element={<OnboardingPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                <Route path="/activity" element={<ActivityTimelinePage />} />
                <Route path="/backup" element={<BackupPage />} />
                <Route path="/manual-log" element={<ManualLogPage />} />
                <Route path="/weekly-plan" element={<WeeklyPlanPage />} />
                <Route
                  path="/reports"
                  element={
                    <ReportsWorkspaceProvider>
                      <ReportsPage />
                    </ReportsWorkspaceProvider>
                  }
                />
                <Route path="/guide" element={<GuidePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppLayout>
          }
        />
      </Routes>
    </AppProviders>
  );
}
