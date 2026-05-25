import { GitBranch, GitFork } from "lucide-react";
import type { CommitRefSummary, CommitWorktreeSummary } from "../../types/project";

export function GitContextBadges({
  branch,
  refs = [],
  worktree,
  maxRefs = 2,
}: {
  branch?: string | null;
  refs?: CommitRefSummary[];
  worktree?: CommitWorktreeSummary | null;
  maxRefs?: number;
}) {
  const visibleRefs = refs.length > 0 ? refs.slice(0, maxRefs) : branch ? [{ name: branch, kind: "local" as const, isCurrent: false }] : [];
  const hiddenCount = Math.max(refs.length - visibleRefs.length, 0);

  if (visibleRefs.length === 0 && !worktree) {
    return null;
  }

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
      {visibleRefs.map((ref) => (
        <span
          key={`${ref.kind}-${ref.name}`}
          title={`${ref.kind === "remote" ? "Remote" : "Local"} branch${ref.isCurrent ? ", current checkout" : ""}`}
          className={[
            "inline-flex max-w-[180px] items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
            ref.isCurrent
              ? "border-cyan-300/20 bg-cyan-500/15 text-cyan-100"
              : ref.kind === "remote"
                ? "border-blue-300/15 bg-blue-500/10 text-blue-200"
                : "border-white/8 bg-white/5 text-slate-300",
          ].join(" ")}
        >
          <GitBranch className="h-3 w-3 shrink-0" />
          <span className="truncate">{ref.name}</span>
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="rounded-md border border-white/8 bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
          +{hiddenCount} refs
        </span>
      ) : null}
      {worktree ? (
        <span
          title={worktree.path}
          className={[
            "inline-flex max-w-[200px] items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
            worktree.isClean === false
              ? "border-orange-300/20 bg-orange-500/10 text-orange-200"
              : "border-emerald-300/15 bg-emerald-500/10 text-emerald-200",
          ].join(" ")}
        >
          <GitFork className="h-3 w-3 shrink-0" />
          <span className="truncate">{worktree.branch || "detached worktree"}</span>
        </span>
      ) : null}
    </span>
  );
}
