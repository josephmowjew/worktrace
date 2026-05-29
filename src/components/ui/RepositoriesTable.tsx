import { GitBranch } from "lucide-react";
import { GitContextBadges } from "./GitContextBadges";
import type { RecentCommit } from "../../types/project";

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getCommitMessagePreview(message: string): { short: string; hash: string } {
  const parts = message.split(" ");
  const hash = parts[0] || "";
  const short = parts.slice(1).join(" ") || message;
  return { short: short.substring(0, 40), hash: hash.substring(0, 7) };
}

function getStatusTone(status: string): "green" | "orange" | "slate" {
  if (status === "Up to date") return "green";
  if (status.includes("Behind")) return "orange";
  return "slate";
}

export function RepositoriesTable({
  commits,
  onViewAll,
}: {
  commits: RecentCommit[];
  onViewAll?: () => void;
}) {
  if (commits.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-[var(--wt-text-muted)]">
        No recent commits
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--wt-border)]">
            <th className="px-3 py-2 text-left font-semibold text-[var(--wt-text-muted)]">
              Project
            </th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--wt-text-muted)]">
              Repo Path
            </th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--wt-text-muted)]">
              Last Commit
            </th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--wt-text-muted)]">
              Branch
            </th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--wt-text-muted)]">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {commits.map((commit, index) => {
            const { short, hash } = getCommitMessagePreview(commit.message);
            return (
              <tr
                key={`${commit.projectId}-${commit.commitHash}`}
                className={`border-b border-[var(--wt-border)] transition-colors hover:bg-[var(--wt-surface-hover)] ${
                  index % 2 === 0 ? "bg-[var(--wt-surface-muted)]" : ""
                }`}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-200">
                      <GitBranch className="h-3.5 w-3.5" />
                    </div>
                    <span className="font-medium text-[var(--wt-text-strong)]">
                      {commit.projectName}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="truncate text-[var(--wt-text-muted)]">
                    {commit.repoPath || "N/A"}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="max-w-[200px]">
                    <p className="truncate text-[var(--wt-text)]">{short}</p>
                    <p className="text-[10px] text-[var(--wt-text-muted)]">
                      {hash} • {formatTimeAgo(commit.committedAt)}
                    </p>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <GitContextBadges branch={commit.branch} refs={commit.refs} worktree={commit.worktree} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${
                        getStatusTone(commit.status) === "green"
                          ? "bg-emerald-400"
                          : getStatusTone(commit.status) === "orange"
                            ? "bg-orange-400"
                            : "bg-slate-400"
                      }`}
                    />
                    <span className="text-[var(--wt-text)]">{commit.status}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {onViewAll && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={onViewAll}
            className="text-xs font-medium text-[var(--wt-accent-text)] transition-colors hover:text-blue-500"
          >
            View all repositories →
          </button>
        </div>
      )}
    </div>
  );
}
