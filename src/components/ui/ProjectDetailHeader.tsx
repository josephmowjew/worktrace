import { ArrowLeft, Archive, Code2, ExternalLink, FolderKanban, GitBranch, Globe, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Project, ProjectStats } from "../../types/project";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Panel } from "./Panel";

const categoryIcons: Record<string, LucideIcon> = {
  Backend: Code2,
  Frontend: Globe,
  Marketing: FolderKanban,
  Tools: FolderKanban,
  Service: FolderKanban,
  Company: FolderKanban,
  Client: FolderKanban,
  Internal: FolderKanban,
  Personal: FolderKanban,
  "Manual Only": FolderKanban,
};

function getCategoryIcon(projectType?: string | null): LucideIcon {
  if (!projectType) return FolderKanban;
  return categoryIcons[projectType] || FolderKanban;
}

export function ProjectDetailHeader({
  project,
  stats,
  isSyncing,
  isGitHubSyncing,
  onSync,
  onGitHubSync,
  onEdit,
  onArchive,
}: {
  project: Project;
  stats?: ProjectStats;
  isSyncing: boolean;
  isGitHubSyncing?: boolean;
  onSync: () => void;
  onGitHubSync?: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const navigate = useNavigate();
  const Icon = getCategoryIcon(project.projectType);
  const commitsThisWeek = stats?.commitsThisWeek ?? 0;
  const hoursTracked = stats?.hoursTracked ?? 0;
  const lastSync = stats?.lastSync;

  return (
    <Panel className="relative overflow-hidden p-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_28%,rgba(56,189,248,0.18),transparent_26%),radial-gradient(circle_at_72%_12%,rgba(37,99,235,0.18),transparent_24%)]" />
      <div className="relative">
        <div className="flex items-center gap-3 border-b border-white/8 px-5 py-3">
          <button
            type="button"
            onClick={() => navigate("/projects")}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-300/20 bg-blue-500/10 text-blue-200">
              <Icon className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-semibold text-slate-300">Project Details</h2>
          </div>
        </div>

        <div className="px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-white">{project.name}</h1>
                <Badge tone={project.status === "active" ? "green" : "orange"}>{project.status}</Badge>
                <Badge tone="blue">{project.projectType || "Company"}</Badge>
                <Badge tone={project.classification === "work" ? "blue" : project.classification === "personal" ? "green" : "slate"}>
                  {classificationLabel(project.classification)}
                </Badge>
              </div>

              {project.description && (
                <p className="mt-2 text-sm text-slate-400">{project.description}</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                {project.repoPath && (
                  <div className="flex items-center gap-1.5">
                    <GitBranch className="h-3.5 w-3.5" />
                    <span className="truncate max-w-[300px]">{project.repoPath}</span>
                  </div>
                )}
                {project.githubUrl && (
                  <a
                    href={project.githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-cyan-300/85 hover:text-cyan-200"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>{project.githubUrl.replace(/^https?:\/\//, "")}</span>
                  </a>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={onSync} disabled={isSyncing || project.status === "archived"}>
                <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing..." : "Sync Now"}
              </Button>
              {project.githubUrl && onGitHubSync ? (
                <Button
                  variant="secondary"
                  onClick={onGitHubSync}
                  disabled={isGitHubSyncing || project.status === "archived"}
                >
                  <ExternalLink className={`h-4 w-4 ${isGitHubSyncing ? "animate-pulse" : ""}`} />
                  {isGitHubSyncing ? "Syncing GitHub..." : "Sync GitHub"}
                </Button>
              ) : null}
              <Button variant="secondary" onClick={onEdit}>
                Edit
              </Button>
              {project.status === "active" && (
                <Button variant="ghost" onClick={onArchive}>
                  <Archive className="h-4 w-4" />
                  Archive
                </Button>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/8 bg-slate-950/50 p-3 text-center">
              <p className="text-2xl font-semibold text-white">{commitsThisWeek}</p>
              <p className="text-[10px] text-slate-500">Commits This Week</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-slate-950/50 p-3 text-center">
              <p className="text-2xl font-semibold text-white">{lastSync ? formatTimeAgo(lastSync) : "N/A"}</p>
              <p className="text-[10px] text-slate-500">Latest Commit</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-slate-950/50 p-3 text-center">
              <p className="text-2xl font-semibold text-white">{formatHours(hoursTracked)}</p>
              <p className="text-[10px] text-slate-500">Hours Tracked</p>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function classificationLabel(value: Project["classification"]) {
  return value === "work" ? "Work" : value === "personal" ? "Personal" : "Unclassified";
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatHours(hours: number): string {
  if (hours === 0) return "0m";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
