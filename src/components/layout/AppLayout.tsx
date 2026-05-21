import {
  Activity,
  BarChart3,
  CalendarDays,
  ClipboardEdit,
  FolderKanban,
  LayoutDashboard,
  Settings,
  ListChecks,
  ListTodo,
  ArrowLeft,
} from "lucide-react";
import type { PropsWithChildren } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listActivity } from "../../lib/api/activity";
import { syncCommits } from "../../lib/api/gitSync";
import { listProjects } from "../../lib/api/projects";
import { getSettings } from "../../lib/api/settings";
import { toggleTodoWidget } from "../../lib/api/todoWidget";
import { currentWeekRange } from "../../lib/dates";
import { TitleBar } from "./TitleBar";
import { useToast } from "../ui/ToastProvider";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Activity Timeline", href: "/activity", icon: Activity },
  { label: "Manual Log", href: "/manual-log", icon: ClipboardEdit },
  { label: "Weekly Plan", href: "/weekly-plan", icon: ListChecks },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function AppLayout({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const weekRange = currentWeekRange();
  const [isWidgetWindow, setIsWidgetWindow] = useState(false);
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
    staleTime: 60_000,
  });
  const activityQuery = useQuery({
    queryKey: ["activity", weekRange.from, weekRange.to],
    queryFn: () =>
      listActivity({
        from: weekRange.from,
        to: weekRange.to,
      }),
  });
  const intervalSyncMutation = useMutation({
    mutationFn: () =>
      syncCommits({
        from: null,
        to: null,
        authorEmail: null,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (result.newCommits > 0 || result.updatedCommits > 0) {
        toast.info(
          "Auto-sync complete",
          `Added ${result.newCommits} commits and updated ${result.updatedCommits}.`,
        );
      }
    },
  });
  const widgetMutation = useMutation({
    mutationFn: toggleTodoWidget,
    onSuccess: (isVisible) => {
      toast.info(isVisible ? "Todo widget shown" : "Todo widget hidden");
    },
    onError: (error) => {
      toast.error(
        "Todo widget failed",
        error instanceof Error ? error.message : "Could not toggle the todo widget.",
      );
    },
  });
  const settings = settingsQuery.data;
  const activityItems = activityQuery.data?.flatMap((day) => day.items) ?? [];
  const commitCount = activityItems.filter((item) => item.activityType === "commit").length;
  const manualCount = activityItems.length - commitCount;
  const hasSyncableProjects =
    projectsQuery.data?.some(
      (project) => project.status === "active" && Boolean(project.repoPath),
    ) ?? false;

  useEffect(() => {
    try {
      setIsWidgetWindow(getCurrentWindow().label === "widget");
    } catch {
      setIsWidgetWindow(false);
    }
  }, []);

  useEffect(() => {
    if (!hasSyncableProjects) {
      return;
    }

    const syncInterval = window.setInterval(
      () => {
        if (!intervalSyncMutation.isPending) {
          intervalSyncMutation.mutate();
        }
      },
      5 * 60 * 1000,
    );

    return () => window.clearInterval(syncInterval);
  }, [hasSyncableProjects, intervalSyncMutation]);

  return (
    <div className="h-screen overflow-hidden bg-[#06101d] text-slate-100">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(37,99,235,0.32),transparent_28%),radial-gradient(circle_at_86%_20%,rgba(20,184,166,0.18),transparent_25%),radial-gradient(circle_at_50%_100%,rgba(14,165,233,0.1),transparent_30%),linear-gradient(135deg,#050b14_0%,#09182a_46%,#06101d_100%)]" />
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:42px_42px] opacity-30" />
      <div className="relative flex h-screen flex-col overflow-hidden">
        <TitleBar />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="m-2 mt-0 hidden min-h-0 w-[236px] shrink-0 flex-col rounded-lg border border-white/10 bg-slate-950/70 p-3 shadow-2xl shadow-blue-950/30 backdrop-blur-2xl lg:flex">
            <div className="mb-5 rounded-2xl border border-white/8 bg-white/[0.035] p-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-300/20 bg-blue-500/20 text-xl font-black text-blue-200 shadow-lg shadow-blue-500/20">
                  W
                </div>
                <div>
                  <p className="text-base font-semibold tracking-tight">WorkTrace</p>
                  <p className="text-[10px] text-slate-500">Track. Focus. Deliver.</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-slate-900">
                <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-blue-500 to-cyan-300 shadow-lg shadow-cyan-400/20" />
              </div>
            </div>

            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  end={item.href === "/"}
                  className={({ isActive }) =>
                    [
                      "group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-150",
                      isActive
                        ? "bg-blue-600/25 text-white shadow-lg shadow-blue-500/20"
                        : "text-slate-400 hover:bg-white/10 hover:text-slate-200",
                    ].join(" ")
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive ? (
                        <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-cyan-300" />
                      ) : null}
                      <item.icon
                        className={[
                          "h-4 w-4",
                          isActive ? "text-cyan-200" : "text-slate-500",
                        ].join(" ")}
                      />
                      {item.label}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="mt-3 overflow-hidden rounded-lg border border-cyan-300/15 bg-cyan-400/10 p-3 shadow-xl shadow-cyan-950/20">
              <div className="mb-3 flex items-center gap-1.5 text-xs text-cyan-300/80">
                <Activity className="h-3.5 w-3.5" />
                This Week
              </div>
              <p className="text-2xl font-semibold">{activityItems.length}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {commitCount} commits / {manualCount} manual
              </p>
              {hasSyncableProjects ? (
                <p className="mt-1 text-[10px] text-cyan-200/70">
                  Auto-sync every 5 min
                </p>
              ) : null}
              <div className="mt-4 grid h-12 grid-cols-7 items-end gap-1">
                {[35, 62, 48, 76, 52, 28, 42].map((height, index) => (
                  <span
                    key={index}
                    className="rounded-t bg-gradient-to-t from-blue-500/30 to-cyan-300/60"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => widgetMutation.mutate()}
              disabled={widgetMutation.isPending}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-300/20 bg-blue-500/15 px-3 py-2.5 text-xs font-semibold text-blue-100 shadow-lg shadow-blue-950/20 transition hover:border-blue-300/35 hover:bg-blue-500/25 disabled:opacity-60"
            >
              <ListTodo className="h-4 w-4" />
              {widgetMutation.isPending ? "Opening..." : "Todo Widget"}
            </button>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-3 py-3 md:px-4 md:py-4">
            {isWidgetWindow ? (
              <div className="mb-3 flex shrink-0 items-center justify-between gap-2 rounded-2xl border border-blue-300/20 bg-blue-500/15 p-2 shadow-lg shadow-blue-950/20 backdrop-blur-xl">
                <button
                  type="button"
                  onClick={() => navigate("/widget")}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Todos
                </button>
                <p className="truncate pr-2 text-[11px] text-blue-100/75">
                  You are browsing from the floating widget.
                </p>
              </div>
            ) : null}

            <nav className="mb-3 flex shrink-0 gap-2 overflow-x-auto rounded-lg border border-white/10 bg-slate-950/55 p-2 shadow-lg shadow-black/10 backdrop-blur-xl lg:hidden">
              {navItems.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  end={item.href === "/"}
                  aria-label={item.label}
                  title={item.label}
                  className={({ isActive }) =>
                    [
                      "flex h-10 min-w-10 items-center justify-center rounded-md border px-3 text-xs font-semibold transition",
                      isActive
                        ? "border-blue-300/30 bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                        : "border-white/8 bg-white/[0.03] text-slate-400 hover:bg-white/10 hover:text-slate-100",
                    ].join(" ")
                  }
                >
                  <item.icon className="h-4 w-4" />
                  <span className="ml-2 hidden sm:inline">{item.label}</span>
                </NavLink>
              ))}
            </nav>
            <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-slate-400 shadow-lg shadow-black/10 backdrop-blur-xl">
                <CalendarDays className="h-4 w-4 text-blue-400/60" />
                {weekRange.label}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => widgetMutation.mutate()}
                  disabled={widgetMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-xl border border-blue-300/20 bg-blue-500/15 px-3 py-2 text-xs font-semibold text-blue-100 shadow-lg shadow-black/10 backdrop-blur-xl transition hover:border-blue-300/35 hover:bg-blue-500/25 disabled:opacity-60"
                >
                  <ListTodo className="h-4 w-4" />
                  Widget
                </button>
                <div className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 shadow-lg shadow-black/10 backdrop-blur-xl">
                  <p className="text-xs font-medium">{settings?.name ?? "John Developer"}</p>
                  <p className="text-[10px] text-slate-500">
                    {settings?.email ?? "johndev@worktrace.app"}
                  </p>
                </div>
              </div>
            </header>

            <section className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
              <div className="mx-auto w-full max-w-[1680px] pb-6">{children}</div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
