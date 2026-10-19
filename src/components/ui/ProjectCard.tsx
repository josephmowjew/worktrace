import {
  Archive,
  Code2,
  ExternalLink,
  GitBranch,
  Globe,
  Layers,
  Mail,
  Package,
  PenTool,
  Settings,
  User,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "./Badge";
import { Panel } from "./Panel";
import type { Project, ProjectStats } from "../../types/project";

const categoryIcons: Record<string, LucideIcon> = {
  Backend: Code2,
  Frontend: Globe,
  Marketing: PenTool,
  Tools: Wrench,
  Service: Settings,
  Company: Package,
  Client: User,
  Internal: Settings,
  Personal: User,
  "Manual Only": Mail,
};

function getCategoryIcon(projectType?: string | null): LucideIcon {
  if (!projectType) return Package;
  return categoryIcons[projectType] || Package;
}

function parseDateWithTimezone(dateString: string): Date {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return new Date(0);
  }

  if (!dateString.includes("T")) {
    const parts = dateString.split(/[- :]/);
    if (parts.length >= 6) {
      const [year, month, day, hour, minute, second] = parts.map(Number);
      return new Date(year, month - 1, day, hour, minute, second);
    }
  }

  return date;
}

function formatTimeAgo(dateString: string): string {
  const date = parseDateWithTimezone(dateString);
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

export function ProjectCard({
  project,
  stats,
  workspaceName,
  onEdit,
  onArchive,
}: {
  project: Project;
  stats?: ProjectStats;
  workspaceName?: string;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const navigate = useNavigate();
  const Icon = getCategoryIcon(project.projectType);
  const commitsThisWeek = stats?.commitsThisWeek ?? 0;
  const hoursTracked = stats?.hoursTracked ?? 0;
  const lastSync = stats?.lastSync;

  return (
    <Panel className="group relative overflow-hidden p-0 transition-all duration-200 hover:border-blue-300/25 hover:shadow-blue-500/10">

      <div className="relative p-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--wt-border)] bg-[var(--wt-surface-muted)] text-[var(--wt-text-muted)]"
            >
              <Icon className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-start gap-2">
                <button
                  onClick={() => navigate(`/projects/${project.id}`)}
                  className="min-w-0 max-w-full text-left text-sm font-semibold leading-5 text-white transition-colors hover:text-blue-200 [overflow-wrap:anywhere]"
                >
                  {project.name}
                </button>
                <Badge tone={project.status === "active" ? "green" : "orange"}>
                  {project.status}
                </Badge>
                <Badge tone={project.classification === "work" ? "blue" : project.classification === "personal" ? "green" : "slate"}>
                  {classificationLabel(project.classification)}
                </Badge>
              </div>

              {project.description && (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400 [overflow-wrap:anywhere]">
                  {project.description}
                </p>
              )}

              {project.githubUrl && (
                <a
                  href={project.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex max-w-full items-start gap-1 text-xs leading-5 text-cyan-300/85 hover:text-cyan-200"
                >
                  <GitBranch className="mt-0.5 h-3 w-3 shrink-0" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {project.githubUrl.replace(/^https?:\/\//, "")}
                  </span>
                  <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                </a>
              )}

              {workspaceName && (
                <div className="mt-2 inline-flex max-w-full items-start gap-1 rounded-md border border-cyan-300/15 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold leading-4 text-cyan-200">
                  <Layers className="mt-0.5 h-3 w-3 shrink-0" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{workspaceName}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 max-w-full">
            <Badge tone="blue">{project.projectType || "Company"}</Badge>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={onEdit}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              Edit
            </button>
            {project.status === "active" && (
              <button
                onClick={onArchive}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-orange-300/80 transition-colors hover:bg-orange-500/10 hover:text-orange-200"
              >
                <Archive className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-white/8 bg-slate-950/50 p-3">
          <div className="min-w-0 text-center">
            <p className="text-lg font-semibold text-white [overflow-wrap:anywhere]">{commitsThisWeek}</p>
            <p className="text-[10px] leading-4 text-slate-500">Commits This Week</p>
          </div>
          <div className="min-w-0 text-center">
            <p className="text-lg font-semibold text-white [overflow-wrap:anywhere]">
              {lastSync ? formatTimeAgo(lastSync) : "N/A"}
            </p>
            <p className="text-[10px] leading-4 text-slate-500">Latest Commit</p>
          </div>
          <div className="min-w-0 text-center">
            <p className="text-lg font-semibold text-white [overflow-wrap:anywhere]">
              {formatHours(hoursTracked)}
            </p>
            <p className="text-[10px] leading-4 text-slate-500">Hours Tracked</p>
          </div>
        </div>

        <div className="mt-3 flex min-w-0 items-center gap-2 text-[10px] leading-4 text-slate-500">
          <span className="[overflow-wrap:anywhere]">Updated {formatTimeAgo(project.updatedAt)}</span>
        </div>
      </div>
    </Panel>
  );
}

function classificationLabel(value: Project["classification"]) {
  return value === "work" ? "Work" : value === "personal" ? "Personal" : "Unclassified";
}
