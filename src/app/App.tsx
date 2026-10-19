import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppLayout } from "../components/layout/AppLayout";
import { FloatingTodoWidget } from "../components/todo/FloatingTodoWidget";
import { ActivityTimelinePage } from "../pages/ActivityTimelinePage";
import { BackupPage } from "../pages/BackupPage";
import { DashboardPage } from "../pages/DashboardPage";
import { FrictionPage } from "../pages/FrictionPage";
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
import { TaskManagerPage } from "../pages/TaskManagerPage";
import { EssentialsCaptureWindow } from "../pages/EssentialsCaptureWindow";
import { EssentialsJournalPage } from "../pages/EssentialsJournalPage";
import { EssentialsGuidePage } from "../pages/EssentialsGuidePage";
import { InsightsPage } from "../pages/InsightsPage";
import { useExperience } from "../features/experience/useExperience";
import { ExperienceWelcome } from "../features/experience/ExperienceWelcome";
import { FeatureGate } from "../features/experience/FeatureGate";
import type { PropsWithChildren } from "react";

function ExperienceEntry({ children }: PropsWithChildren) {
  const experience = useExperience();
  const location = useLocation();
  if (experience.settingsQuery.isLoading) return <div role="status" className="py-10 text-sm text-[var(--wt-text-muted)]">Opening your workspace...</div>;
  if (experience.settings?.experienceConfigured === false && !["/guide", "/settings", "/backup"].includes(location.pathname)) return <ExperienceWelcome />;
  return <>{children}</>;
}
function QuickCaptureRouter() {
  const experience = useExperience();
  if (experience.settingsQuery.isLoading) return <div className="p-5 text-sm">Opening capture...</div>;
  return experience.isDeveloper ? <QuickCaptureWindow /> : <EssentialsCaptureWindow />;
}
function HomePage() {
  const experience = useExperience();
  return experience.isDeveloper ? <TodayPage /> : <TaskManagerPage todayOnly />;
}
function SetupPage() {
  const experience = useExperience();
  return experience.isDeveloper ? <OnboardingPage /> : <ExperienceWelcome />;
}
function JournalPage() {
  const experience = useExperience();
  return experience.isDeveloper ? <ManualLogPage /> : <EssentialsJournalPage />;
}
function HelpPage() {
  const experience = useExperience();
  return experience.isDeveloper ? <GuidePage /> : <EssentialsGuidePage />;
}

function ActivityWorkspace({ children }: PropsWithChildren) {
  const experience = useExperience();
  return <div className="space-y-5">{experience.isDeveloper ? <nav aria-label="Activity views" className="flex gap-5 border-b border-[var(--wt-border)] pb-3"><Link className="wt-text-link" to="/activity">Code activity</Link><Link className="wt-text-link" to="/manual-log">Work journal</Link></nav> : null}{children}</div>;
}

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
        <QuickCaptureRouter />
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
        <Route path="/quick-capture" element={<QuickCaptureRouter />} />
        <Route
          path="/*"
          element={
            <AppLayout>
              <ExperienceEntry>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/tasks" element={<TaskManagerPage />} />
                <Route path="/onboarding" element={<SetupPage />} />
                <Route path="/dashboard" element={<FeatureGate title="Insights"><DashboardPage /></FeatureGate>} />
                <Route path="/friction" element={<FeatureGate title="Insights"><FrictionPage /></FeatureGate>} />
                <Route path="/projects" element={<FeatureGate title="Repositories"><ProjectsPage /></FeatureGate>} />
                <Route path="/projects/:projectId" element={<FeatureGate title="Repository details"><ProjectDetailPage /></FeatureGate>} />
                <Route path="/activity" element={<FeatureGate title="Code activity"><ActivityWorkspace><ActivityTimelinePage /></ActivityWorkspace></FeatureGate>} />
                <Route path="/insights" element={<FeatureGate title="Insights"><InsightsPage /></FeatureGate>} />
                <Route path="/backup" element={<BackupPage />} />
                <Route path="/manual-log" element={<FeatureGate feature="journal" title="Work journal"><ActivityWorkspace><JournalPage /></ActivityWorkspace></FeatureGate>} />
                <Route path="/manual-log/advanced" element={<FeatureGate feature="journal" title="Work journal"><ManualLogPage /></FeatureGate>} />
                <Route path="/weekly-plan" element={<FeatureGate title="Weekly planning"><WeeklyPlanPage /></FeatureGate>} />
                <Route
                  path="/reports"
                  element={
                    <FeatureGate feature="reports" title="Reports">
                    <ReportsWorkspaceProvider>
                      <ReportsPage />
                    </ReportsWorkspaceProvider>
                    </FeatureGate>
                  }
                />
                <Route path="/guide" element={<HelpPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </ExperienceEntry>
            </AppLayout>
          }
        />
      </Routes>
    </AppProviders>
  );
}
