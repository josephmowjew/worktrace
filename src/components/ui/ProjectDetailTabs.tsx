import { Activity, ClipboardEdit, GitCommit, GitFork, ListChecks } from "lucide-react";

export type ProjectDetailTab = "commits" | "branches" | "tasks" | "meetings" | "all";

const tabs: { key: ProjectDetailTab; label: string; icon: typeof GitCommit }[] = [
  { key: "commits", label: "Commits", icon: GitCommit },
  { key: "branches", label: "Branches", icon: GitFork },
  { key: "tasks", label: "Tasks", icon: ListChecks },
  { key: "meetings", label: "Meetings", icon: ClipboardEdit },
  { key: "all", label: "All Activity", icon: Activity },
];

export function ProjectDetailTabs({
  activeTab,
  onChange,
}: {
  activeTab: ProjectDetailTab;
  onChange: (tab: ProjectDetailTab) => void;
}) {
  return (
    <div className="flex rounded-2xl border border-white/8 bg-slate-950/55 p-1">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              isActive
                ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
