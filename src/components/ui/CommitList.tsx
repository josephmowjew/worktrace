import { Check, ChevronDown, ChevronRight, Copy, GitCommit, User } from "lucide-react";
import { useState } from "react";
import type { ActivityItem } from "../../types/activity";
import { Panel } from "./Panel";

export function CommitList({
  commits,
  isLoading,
  selectedCommitIds,
  onToggleCommit,
}: {
  commits: ActivityItem[];
  isLoading: boolean;
  selectedCommitIds?: Set<string>;
  onToggleCommit?: (commitId: string) => void;
}) {
  if (isLoading) {
    return (
      <Panel>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.03]" />
          ))}
        </div>
      </Panel>
    );
  }

  if (commits.length === 0) {
    return (
      <Panel>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-500/10 text-blue-200">
            <GitCommit className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold text-slate-200">No commits this week</p>
          <p className="mt-1 text-xs text-slate-500">Sync your repository to see commits here.</p>
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-3">
      {commits.map((commit) => (
        <CommitItem
          key={commit.id}
          commit={commit}
          isSelected={selectedCommitIds?.has(commit.id) ?? false}
          onToggle={onToggleCommit}
        />
      ))}
    </div>
  );
}

function CommitItem({
  commit,
  isSelected,
  onToggle,
}: {
  commit: ActivityItem;
  isSelected: boolean;
  onToggle?: (commitId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const subject = commit.summary.split("\n")[0];
  const body = commit.summary.split("\n").slice(1).join("\n").trim();
  const hasExtraContent = body || commit.commitHash || commit.filesChanged || commit.insertions || commit.deletions;

  const handleCopyHash = () => {
    if (commit.commitHash) {
      navigator.clipboard.writeText(commit.commitHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <article
      className={[
        "rounded-xl border bg-slate-950/45 shadow-lg shadow-black/10 transition",
        isSelected ? "border-cyan-300/35 ring-1 ring-cyan-300/20" : "border-white/8",
      ].join(" ")}
    >
      <div className="flex items-start gap-3 p-3">
        {onToggle ? (
          <label className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-cyan-400"
              checked={isSelected}
              onChange={() => onToggle(commit.id)}
              aria-label={`Select commit ${subject}`}
            />
          </label>
        ) : null}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-purple-300/15 bg-purple-500/10 text-purple-200">
          <GitCommit className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-200">Commit</span>
            {commit.branch && (
              <span className="rounded-md border border-white/8 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                {commit.branch}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-sm font-medium text-slate-100">
            {subject}
          </p>
        </div>

        {hasExtraContent && (
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

      {expanded && hasExtraContent && (
        <div className="ml-12 mr-3 mb-3 space-y-3 rounded-xl border border-white/8 bg-slate-950/60 p-3">
          {body && (
            <div className="max-h-48 overflow-y-auto text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
              {body}
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
            {commit.authorName && (
              <div className="flex items-center gap-1.5">
                <User className="h-3 w-3 text-slate-500" />
                <span className="text-slate-500">Author:</span>{" "}
                <span className="text-slate-200">{commit.authorName}</span>
              </div>
            )}
            {commit.commitHash && (
              <div className="col-span-2 flex items-center gap-2">
                <span className="text-slate-500">Commit:</span>
                <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                  {commit.commitHash}
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
            {(commit.filesChanged !== null || commit.insertions !== null || commit.deletions !== null) && (
              <div className="col-span-2 flex items-center gap-3 text-slate-400">
                {commit.filesChanged !== null && commit.filesChanged !== undefined && (
                  <span>{commit.filesChanged} file(s)</span>
                )}
                {commit.insertions !== null && commit.insertions !== undefined && commit.insertions > 0 && (
                  <span className="text-emerald-400">+{commit.insertions}</span>
                )}
                {commit.deletions !== null && commit.deletions !== undefined && commit.deletions > 0 && (
                  <span className="text-red-400">-{commit.deletions}</span>
                )}
              </div>
            )}
            <div className="col-span-2 text-slate-500">
              {formatDate(commit.occurredAt)}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
