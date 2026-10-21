import { Activity, BarChart3, BookOpen, ClipboardEdit, FolderKanban, Gauge, Home, ListTodo, Settings, X } from "lucide-react";
import { useExperience } from "../../features/experience/useExperience";
import { NavLink, useLocation } from "react-router-dom";

export function useWorkspaceNavigation() {
  const experience = useExperience();
  if (experience.isDeveloper) return [
    { label: "Work", items: [{ label: "Today", href: "/", icon: Home }, { label: "Tasks", href: "/tasks", icon: ListTodo }, { label: "Activity", href: "/activity", icon: Activity }, { label: "Reports", href: "/reports", icon: BarChart3 }] },
    { label: "Tools", items: [{ label: "Repositories", href: "/projects", icon: FolderKanban }, { label: "Insights", href: "/insights", icon: Gauge }] },
  ];
  return [{ label: "Workspace", items: [
    { label: "Today", href: "/", icon: Home }, { label: "Tasks", href: "/tasks", icon: ListTodo },
    ...(experience.hasFeature("journal") ? [{ label: "Work journal", href: "/manual-log", icon: ClipboardEdit }] : []),
    ...(experience.hasFeature("reports") ? [{ label: "Reports", href: "/reports", icon: BarChart3 }] : []),
  ] }];
}

export function workspaceRoute(pathname: string) {
  if (pathname.startsWith("/projects/")) return { section: "Repositories", label: "Repository details" };
  const labels: Record<string, string> = { "/": "Today", "/tasks": "Tasks", "/weekly-plan": "Weekly board", "/activity": "Activity", "/manual-log": "Work journal", "/projects": "Repositories", "/reports": "Reports", "/insights": "Insights", "/dashboard": "Overview", "/friction": "Patterns & blockers", "/backup": "Data & backups", "/settings": "Settings", "/onboarding": "Get started", "/guide": "Help" };
  return { section: "Workspace", label: labels[pathname] ?? "WorkTrace" };
}

export function WorkspaceNavigation({ isOpen, onClose, onNavigate, onWidget, widgetPending, name, avatar }: {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: () => void;
  onWidget: () => void;
  widgetPending: boolean;
  name: string;
  avatar: React.ReactNode;
}) {
  const workspaceNavigation = useWorkspaceNavigation();
  const { pathname } = useLocation();
  const experience = useExperience();
  function includesRelatedView(href: string) {
    return (href === "/tasks" && pathname === "/weekly-plan") ||
      (href === "/activity" && experience.isDeveloper && pathname.startsWith("/manual-log")) ||
      (href === "/insights" && ["/dashboard", "/friction"].includes(pathname));
  }
  return (
    <>
      {isOpen ? <button type="button" className="wt-navigation-scrim" aria-label="Close navigation" onClick={onClose} /> : null}
      <aside id="workspace-navigation" className="wt-navigation wt-focus-muted" data-open={isOpen} aria-label="Workspace navigation" inert={!isOpen}>
        <div className="wt-workspace-name">
          <img src="/worktrace-icon.svg" alt="" className="h-6 w-6 rounded-md" draggable={false} />
          <div className="min-w-0 flex-1"><p className="text-[13px] font-semibold">WorkTrace</p><p className="text-[11px] text-[var(--wt-text-muted)]">Your local workspace</p></div>
          <button type="button" className="wt-mobile-close wt-shell-icon" aria-label="Close sidebar" onClick={onClose}><X size={15} /></button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Main navigation">
          {workspaceNavigation.map((group) => <div key={group.label} className="mt-5 first:mt-2">
            <p className="wt-nav-heading">{group.label}</p>
            {group.items.map((item) => <NavLink key={item.href} to={item.href} end={item.href === "/"} onClick={onNavigate} className={({ isActive }) => `wt-nav-item ${isActive || includesRelatedView(item.href) ? "is-active" : ""}`}>
              <item.icon size={16} strokeWidth={1.6} /><span>{item.label}</span>
            </NavLink>)}
          </div>)}
        </nav>
        <div className="border-t border-[var(--wt-border)] px-2 py-2">
          <button type="button" className="wt-nav-item w-full" onClick={onWidget} disabled={widgetPending}><ListTodo size={16} strokeWidth={1.6} />{widgetPending ? "Opening widget…" : "Todo widget"}</button>
          <NavLink to="/guide" onClick={onNavigate} className={({ isActive }) => `wt-nav-item ${isActive ? "is-active" : ""}`}><BookOpen size={16} strokeWidth={1.6} />Help</NavLink>
          <NavLink to="/settings" onClick={onNavigate} className={({ isActive }) => `wt-nav-item ${isActive ? "is-active" : ""}`}><Settings size={16} strokeWidth={1.6} />Settings</NavLink>
        </div>
        <NavLink to="/settings" onClick={onNavigate} className="wt-profile" aria-label="Open profile settings">
          {avatar}<span className="min-w-0"><span className="block truncate text-xs font-medium">{name}</span><span className="block text-[10px] text-[var(--wt-text-muted)]">Profile & preferences</span></span>
        </NavLink>
      </aside>
    </>
  );
}
