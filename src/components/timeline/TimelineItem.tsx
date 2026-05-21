import {
  Bug,
  Check,
  Code,
  Copy,
  FileText,
  FlaskConical,
  GitCommit,
  GitPullRequest,
  Headphones,
  Rocket,
  Users,
  Eye,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import type { ActivityItem } from "../../types/activity";

const activityTypeConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  commit: { icon: GitCommit, color: "purple", label: "Commit" },
  Meeting: { icon: Users, color: "green", label: "Meeting" },
  "Pull Request": { icon: GitPullRequest, color: "blue", label: "Pull Request" },
  "Pull Request Review": { icon: Eye, color: "violet", label: "Review" },
  Testing: { icon: FlaskConical, color: "orange", label: "Testing" },
  Documentation: { icon: FileText, color: "cyan", label: "Documentation" },
  Deployment: { icon: Rocket, color: "teal", label: "Deployment" },
  "Code Review": { icon: Eye, color: "violet", label: "Review" },
  "Bug Fix": { icon: Bug, color: "red", label: "Bug Fix" },
  Development: { icon: Code, color: "blue", label: "Development" },
  Support: { icon: Headphones, color: "slate", label: "Support" },
};

const colorClasses: Record<string, { bg: string; border: string; text: string }> = {
  purple: { bg: "bg-purple-500/10", border: "border-purple-300/15", text: "text-purple-200" },
  green: { bg: "bg-emerald-500/10", border: "border-emerald-300/15", text: "text-emerald-200" },
  blue: { bg: "bg-blue-500/10", border: "border-blue-300/15", text: "text-blue-200" },
  violet: { bg: "bg-violet-500/10", border: "border-violet-300/15", text: "text-violet-200" },
  orange: { bg: "bg-orange-500/10", border: "border-orange-300/15", text: "text-orange-200" },
  cyan: { bg: "bg-cyan-500/10", border: "border-cyan-300/15", text: "text-cyan-200" },
  teal: { bg: "bg-teal-500/10", border: "border-teal-300/15", text: "text-teal-200" },
  red: { bg: "bg-red-500/10", border: "border-red-300/15", text: "text-red-200" },
  slate: { bg: "bg-slate-500/10", border: "border-white/10", text: "text-slate-300" },
};

interface TimelineItemProps {
  item: ActivityItem;
  showTime?: boolean;
}

export function TimelineItem({ item, showTime = true }: TimelineItemProps) {
  const isCommit = item.activityType === "commit";
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const config = activityTypeConfig[item.activityType] ?? {
    icon: GitCommit,
    color: "slate",
    label: item.activityType,
  };
  const Icon = config.icon;
  const colors = colorClasses[config.color] ?? colorClasses.slate;

  const subject = item.summary.split("\n")[0];
  const body = item.summary.split("\n").slice(1).join("\n").trim();
  const time = formatActivityTime(item.occurredAt);

  const hasExtraContent = isCommit && (body || item.commitHash);
  const hasManualContent = !isCommit && body;

  const handleCopyHash = () => {
    if (item.commitHash) {
      navigator.clipboard.writeText(item.commitHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <article className="rounded-xl border border-white/8 bg-slate-950/45 shadow-lg shadow-black/10">
      <div className="flex items-start gap-3 p-3">
        {showTime && (
          <span className="w-16 shrink-0 text-right text-xs text-slate-500 tabular-nums pt-1">
            {time}
          </span>
        )}

        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${colors.bg} ${colors.border} ${colors.text}`}>
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-200">{config.label}</span>
            {item.projectName && (
              <span className="rounded-md border border-white/8 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                {item.projectName}
              </span>
            )}
          </div>
          <p className="mt-1.5 truncate text-sm font-medium text-slate-100">
            {subject}
          </p>
        </div>

        {(hasExtraContent || hasManualContent) && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
            aria-label={expanded ? "Collapse details" : "Expand details"}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {expanded && (hasExtraContent || hasManualContent) && (
        <div className="ml-12 mr-3 mb-3 space-y-3 rounded-xl border border-white/8 bg-slate-950/60 p-3">
          {body && (
            <div className="max-h-48 overflow-y-auto text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
              {body}
            </div>
          )}

          {isCommit && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
              {item.authorName && (
                <div>
                  <span className="text-slate-500">Author:</span>{" "}
                  <span className="text-slate-200">{item.authorName}</span>
                </div>
              )}
              {item.branch && (
                <div>
                  <span className="text-slate-500">Branch:</span>{" "}
                  <span className="font-mono text-slate-200">{item.branch}</span>
                </div>
              )}
              {item.commitHash && (
                <div className="col-span-2 flex items-center gap-2">
                  <span className="text-slate-500">Commit:</span>
                  <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                    {item.commitHash}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyHash}
                    className="rounded p-0.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
                    aria-label="Copy commit hash"
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>
              )}
              {(item.filesChanged !== null || item.insertions !== null || item.deletions !== null) && (
                <div className="col-span-2 flex items-center gap-3 text-slate-400">
                  {item.filesChanged !== null && (
                    <span>{item.filesChanged} file(s)</span>
                  )}
                  {item.insertions !== null && (
                    <span className="text-emerald-400">+{item.insertions}</span>
                  )}
                  {item.deletions !== null && (
                    <span className="text-red-400">-{item.deletions}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function formatActivityTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
