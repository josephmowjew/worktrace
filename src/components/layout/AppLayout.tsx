import {
  Activity,
  BarChart3,
  CalendarDays,
  ClipboardEdit,
  FolderKanban,
  LayoutDashboard,
  Search,
  Settings,
} from "lucide-react";
import type { PropsWithChildren } from "react";
import { NavLink } from "react-router-dom";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Activity Timeline", href: "/activity", icon: Activity },
  { label: "Manual Log", href: "/manual-log", icon: ClipboardEdit },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function AppLayout({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(37,99,235,0.25),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(20,184,166,0.14),transparent_24%),linear-gradient(135deg,#06101d_0%,#0a1424_48%,#07111f_100%)]" />
      <div className="relative grid min-h-screen grid-cols-[260px_1fr]">
        <aside className="m-3 flex min-h-[calc(100vh-24px)] flex-col rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-blue-950/30 backdrop-blur-xl">
          <div className="mb-9 flex items-center gap-3 px-2 pt-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/15 text-2xl font-black text-blue-300 shadow-lg shadow-blue-500/20">
              W
            </div>
            <div>
              <p className="text-xl font-semibold tracking-tight">WorkTrace</p>
              <p className="text-xs text-slate-400">Track. Focus. Deliver.</p>
            </div>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.href === "/"}
                className={({ isActive }) =>
                  [
                    "group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition",
                    isActive
                      ? "border border-blue-400/40 bg-blue-600/30 text-white shadow-lg shadow-blue-500/20"
                      : "text-slate-300 hover:bg-white/7 hover:text-white",
                  ].join(" ")
                }
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl border border-cyan-300/15 bg-cyan-400/8 p-4">
            <div className="mb-4 flex items-center gap-2 text-sm text-cyan-200">
              <Activity className="h-4 w-4" />
              This Week
            </div>
            <p className="text-3xl font-semibold">0h 00m</p>
            <p className="mt-1 text-sm text-slate-400">Ready to track</p>
            <div className="mt-5 h-12 rounded-xl bg-gradient-to-r from-blue-500/10 via-cyan-400/30 to-blue-400/10" />
          </div>
        </aside>

        <main className="flex min-w-0 flex-col px-5 py-6">
          <header className="mb-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-slate-300 backdrop-blur-xl">
              <CalendarDays className="h-5 w-5 text-blue-300" />
              May 18 - May 22, 2026
            </div>

            <div className="flex items-center gap-4">
              <label className="flex w-[360px] items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-slate-400 backdrop-blur-xl">
                <Search className="h-5 w-5" />
                <input
                  className="w-full bg-transparent text-slate-200 outline-none placeholder:text-slate-500"
                  placeholder="Search projects, tasks, commits..."
                />
              </label>
              <div className="rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 backdrop-blur-xl">
                <p className="text-sm font-semibold">John Developer</p>
                <p className="text-xs text-slate-400">johndev@worktrace.app</p>
              </div>
            </div>
          </header>

          <section className="min-h-0 flex-1">{children}</section>
        </main>
      </div>
    </div>
  );
}
