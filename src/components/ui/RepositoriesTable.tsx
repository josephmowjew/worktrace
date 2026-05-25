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
      <div className="flex h-32 items-center justify-center text-xs text-slate-500">
        No recent commits
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/8">
            <th className="px-3 py-2 text-left font-semibold text-slate-400">
              Project
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-400">
              Repo Path
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-400">
              Last Commit
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-400">
              Branch
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-400">
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
                className={`border-b border-white/5 transition-colors hover:bg-white/5 ${
                  index % 2 === 0 ? "bg-slate-950/20" : ""
                }`}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-500/15 text-blue-200">
                      <GitBranch className="h-3.5 w-3.5" />
                    </div>
                    <span className="font-medium text-white">
                      {commit.projectName}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="truncate text-slate-400">
                    {commit.repoPath || "N/A"}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="max-w-[200px]">
                    <p className="truncate text-slate-300">{short}</p>
                    <p className="text-[10px] text-slate-500">
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
                    <span className="text-slate-300">{commit.status}</span>
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
            className="text-xs font-medium text-blue-300 transition-colors hover:text-blue-200"
          >
            View all repositories →
          </button>
        </div>
      )}
    </div>
  );
}
