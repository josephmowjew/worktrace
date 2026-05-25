import {
  Bug,
  Check,
  Code,
  Copy,
  FileText,
  FlaskConical,
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
import { GitContextBadges } from "../ui/GitContextBadges";

const activityTypeConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  commit: { icon: Code, color: "purple", label: "Commit" },
  Commit: { icon: Code, color: "purple", label: "Commit" },
  Meeting: { icon: Users, color: "green", label: "Meeting" },
  meeting: { icon: Users, color: "green", label: "Meeting" },
  "Pull Request": { icon: GitPullRequest, color: "blue", label: "Pull Request" },
  "Pull Request Review": { icon: Eye, color: "violet", label: "Review" },
  Testing: { icon: FlaskConical, color: "orange", label: "Testing" },
  testing: { icon: FlaskConical, color: "orange", label: "Testing" },
  Documentation: { icon: FileText, color: "cyan", label: "Documentation" },
  Deployment: { icon: Rocket, color: "teal", label: "Deployment" },
  deployment: { icon: Rocket, color: "teal", label: "Deployment" },
  "Code Review": { icon: Eye, color: "violet", label: "Review" },
  CodeReview: { icon: Eye, color: "violet", label: "Review" },
  "Bug Fix": { icon: Bug, color: "red", label: "Bug Fix" },
  Development: { icon: Code, color: "blue", label: "Development" },
  development: { icon: Code, color: "blue", label: "Development" },
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

  const normalizedActivityType = item.activityType.trim();
  const config = activityTypeConfig[normalizedActivityType] ?? activityTypeConfig[normalizedActivityType.toLowerCase()] ?? {
    icon: Code,
    color: "slate",
    label: item.activityType,
  };
  const Icon = config.icon;
  const colors = colorClasses[config.color] ?? colorClasses.slate;
  const iconContent = isCommit ? (
    <span className="font-mono text-base font-semibold leading-none text-purple-100">
      &lt;/&gt;
    </span>
  ) : (
    <Icon className="h-5 w-5 shrink-0 stroke-[2.35]" />
  );

  const subject = item.summary.split("\n")[0];
  const body = item.summary.split("\n").slice(1).join("\n").trim();
  const time = formatActivityTime(item.occurredAt);

  const hasExtraContent =
    isCommit && (body || item.commitHash || (item.refs?.length ?? 0) > 0 || item.worktree);
  const hasManualContent = !isCommit && body;

  const handleCopyHash = () => {
    if (item.commitHash) {
      navigator.clipboard.writeText(item.commitHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <article className="group relative z-10 rounded-2xl border border-blue-100/8 bg-slate-950/36 shadow-[0_14px_40px_rgba(2,6,23,0.22),inset_0_1px_0_rgba(255,255,255,0.04)] transition-[background-color,border-color,box-shadow,transform] duration-150 hover:border-blue-200/16 hover:bg-slate-950/48 hover:shadow-[0_18px_48px_rgba(2,6,23,0.3),inset_0_1px_0_rgba(255,255,255,0.055)]">
      <div className="flex items-start gap-4 p-4">
        {showTime && (
          <span className="absolute left-0 mt-1 w-16 -translate-x-[56px] text-left text-sm tabular-nums text-slate-400 max-sm:static max-sm:w-auto max-sm:translate-x-0 max-sm:text-xs">
            {time}
          </span>
        )}

        <div className={`relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${colors.bg} ${colors.border} ${colors.text}`}>
          {iconContent}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-blue-200/10 bg-blue-400/10 px-2 py-0.5 text-[11px] font-semibold text-blue-100">
              {config.label}
            </span>
            {item.projectName && (
              <span className="rounded-md border border-white/8 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                {item.projectName}
              </span>
            )}
            {isCommit ? (
              <GitContextBadges branch={item.branch} refs={item.refs} worktree={item.worktree} />
            ) : null}
          </div>
          <p className="mt-2 truncate text-[15px] font-semibold leading-6 text-slate-50 [text-wrap:pretty]">
            {subject}
          </p>
        </div>

        {(hasExtraContent || hasManualContent) && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950/42 text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[background-color,color,transform] duration-150 hover:bg-white/8 hover:text-slate-200 active:scale-[0.96]"
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
        <div className="ml-20 mr-4 mb-4 space-y-3 rounded-xl border border-blue-100/8 bg-slate-950/52 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] max-sm:ml-4">
          {body && (
            <div className="max-h-48 overflow-y-auto text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
              {body}
            </div>
          )}

          {isCommit && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
              {item.authorName && (
                <div>
                  <span className="text-slate-500">Author:</span>{" "}
                  <span className="text-slate-200">{item.authorName}</span>
                </div>
              )}
              {((item.refs?.length ?? 0) > 0 || item.worktree || item.branch) && (
                <div className="col-span-2 flex flex-wrap items-center gap-2">
                  <span className="text-slate-500">Refs:</span>
                  <GitContextBadges branch={item.branch} refs={item.refs} worktree={item.worktree} maxRefs={6} />
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
                    className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-[background-color,color,transform] duration-150 hover:bg-white/10 hover:text-slate-300 active:scale-[0.96]"
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
