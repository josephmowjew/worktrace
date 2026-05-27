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

const categoryColors: Record<string, string> = {
  Backend: "from-violet-500/20 to-violet-600/20 border-violet-300/20 text-violet-200",
  Frontend: "from-blue-500/20 to-blue-600/20 border-blue-300/20 text-blue-200",
  Marketing: "from-pink-500/20 to-pink-600/20 border-pink-300/20 text-pink-200",
  Tools: "from-cyan-500/20 to-cyan-600/20 border-cyan-300/20 text-cyan-200",
  Service: "from-amber-500/20 to-amber-600/20 border-amber-300/20 text-amber-200",
  Company: "from-blue-500/20 to-blue-600/20 border-blue-300/20 text-blue-200",
  Client: "from-emerald-500/20 to-emerald-600/20 border-emerald-300/20 text-emerald-200",
  Internal: "from-slate-500/20 to-slate-600/20 border-slate-300/20 text-slate-200",
  Personal: "from-purple-500/20 to-purple-600/20 border-purple-300/20 text-purple-200",
  "Manual Only": "from-orange-500/20 to-orange-600/20 border-orange-300/20 text-orange-200",
};

function getCategoryIcon(projectType?: string | null): LucideIcon {
  if (!projectType) return Package;
  return categoryIcons[projectType] || Package;
}

function getCategoryColor(projectType?: string | null): string {
  if (!projectType) return categoryColors["Company"];
  return categoryColors[projectType] || categoryColors["Company"];
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
  const colorClass = getCategoryColor(project.projectType);
  const commitsThisWeek = stats?.commitsThisWeek ?? 0;
  const hoursTracked = stats?.hoursTracked ?? 0;
  const lastSync = stats?.lastSync;

  return (
    <Panel className="group relative overflow-hidden p-0 transition-all duration-200 hover:border-blue-300/25 hover:shadow-blue-500/10">
      <div className="absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

      <div className="relative p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br ${colorClass}`}
            >
              <Icon className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate(`/projects/${project.id}`)}
                  className="truncate text-sm font-semibold text-white transition-colors hover:text-blue-200"
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
                <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                  {project.description}
                </p>
              )}

              {project.githubUrl && (
                <a
                  href={project.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-cyan-300/85 hover:text-cyan-200"
                >
                  <GitBranch className="h-3 w-3" />
                  <span className="truncate">
                    {project.githubUrl.replace(/^https?:\/\//, "")}
                  </span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              )}

              {workspaceName && (
                <div className="mt-2 inline-flex max-w-full items-center gap-1 rounded-md border border-cyan-300/15 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-200">
                  <Layers className="h-3 w-3 shrink-0" />
                  <span className="truncate">{workspaceName}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Badge tone="blue">{project.projectType || "Company"}</Badge>

          <div className="flex items-center gap-1.5">
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
          <div className="text-center">
            <p className="text-lg font-semibold text-white">{commitsThisWeek}</p>
            <p className="text-[10px] text-slate-500">Commits This Week</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-white">
              {lastSync ? formatTimeAgo(lastSync) : "N/A"}
            </p>
            <p className="text-[10px] text-slate-500">Latest Commit</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-white">
              {formatHours(hoursTracked)}
            </p>
            <p className="text-[10px] text-slate-500">Hours Tracked</p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500">
          <span>Updated {formatTimeAgo(project.updatedAt)}</span>
        </div>
      </div>
    </Panel>
  );
}

function classificationLabel(value: Project["classification"]) {
  return value === "work" ? "Work" : value === "personal" ? "Personal" : "Unclassified";
}
