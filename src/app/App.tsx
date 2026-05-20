import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { ActivityTimelinePage } from "../pages/ActivityTimelinePage";
import { DashboardPage } from "../pages/DashboardPage";
import { ManualLogPage } from "../pages/ManualLogPage";
import { ProjectsPage } from "../pages/ProjectsPage";
import { ReportsPage } from "../pages/ReportsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { WeeklyPlanPage } from "../pages/WeeklyPlanPage";
import { AppProviders } from "./providers";

export default function App() {
  return (
    <AppProviders>
      <AppLayout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/activity" element={<ActivityTimelinePage />} />
          <Route path="/manual-log" element={<ManualLogPage />} />
          <Route path="/weekly-plan" element={<WeeklyPlanPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppLayout>
    </AppProviders>
  );
}
