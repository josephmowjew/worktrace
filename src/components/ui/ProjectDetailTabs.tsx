import { Activity, ClipboardEdit, GitCommit, GitFork, ListChecks } from "lucide-react";
import { SegmentedTabs } from "./SegmentedTabs";

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
    <SegmentedTabs
      items={tabs.map((tab) => ({ id: tab.key, label: tab.label, icon: tab.icon }))}
      value={activeTab}
      onChange={onChange}
      fullWidth
    />
  );
}
