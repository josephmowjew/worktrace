import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { FloatingTodoWidget } from "../components/todo/FloatingTodoWidget";
import { ActivityTimelinePage } from "../pages/ActivityTimelinePage";
import { BackupPage } from "../pages/BackupPage";
import { DashboardPage } from "../pages/DashboardPage";
import { GuidePage } from "../pages/GuidePage";
import { ManualLogPage } from "../pages/ManualLogPage";
import { ProjectDetailPage } from "../pages/ProjectDetailPage";
import { ProjectsPage } from "../pages/ProjectsPage";
import { ReportsPage } from "../pages/ReportsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { TodayPage } from "../pages/TodayPage";
import { WeeklyPlanPage } from "../pages/WeeklyPlanPage";
import { AppProviders } from "./providers";

export default function App() {
  return (
    <AppProviders>
      <Routes>
        <Route path="/widget" element={<FloatingTodoWidget />} />
        <Route
          path="/*"
          element={
            <AppLayout>
              <Routes>
                <Route path="/" element={<TodayPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                <Route path="/activity" element={<ActivityTimelinePage />} />
                <Route path="/backup" element={<BackupPage />} />
                <Route path="/manual-log" element={<ManualLogPage />} />
                <Route path="/weekly-plan" element={<WeeklyPlanPage />} />
                <Route path="/reports" element={<ReportsPage />} />
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
