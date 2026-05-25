import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ClipboardCopy, ExternalLink, GitPullRequest, Rocket, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ActivityItem } from "../../types/activity";
import type { GitBranch, Project } from "../../types/project";
import { createGitHubPullRequest, getGitHubIntegrationStatus } from "../../lib/api/github";
import { listGitBranches } from "../../lib/api/projects";
import {
  fullPrPackageText,
  generatePrPackage,
  suggestedBaseBranch,
  suggestedBranchName,
  suggestedPrTitle,
} from "../../lib/prBuilder";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Panel } from "./Panel";

export function PrBuilderPanel({
  project,
  commits,
  onClose,
  onCopy,
}: {
  project: Project;
  commits: ActivityItem[];
  onClose: () => void;
  onCopy: (label: string, value: string) => void;
}) {
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [branchLoadState, setBranchLoadState] = useState<"loading" | "loaded" | "failed">("loading");
  const [branchLoadWarning, setBranchLoadWarning] = useState<string | null>(null);
  const [baseBranch, setBaseBranch] = useState("");
  const [branchName, setBranchName] = useState(() => suggestedBranchName(project.name, commits));
  const [title, setTitle] = useState(() => suggestedPrTitle(commits, project.name));
  const [notes, setNotes] = useState("");
  const [createdPrUrl, setCreatedPrUrl] = useState<string | null>(null);

  const githubStatusQuery = useQuery({
    queryKey: ["githubIntegrationStatus"],
    queryFn: getGitHubIntegrationStatus,
  });

  useEffect(() => {
    let isActive = true;

    setBranchLoadState("loading");
    setBranchLoadWarning(null);
    setBranches([]);
    setBaseBranch("");

    listGitBranches(project.id)
      .then((loadedBranches) => {
        if (!isActive) {
          return;
        }

        setBranches(loadedBranches);
        setBaseBranch(selectDefaultBaseBranch(loadedBranches, commits));
        setBranchLoadState("loaded");

        if (loadedBranches.length === 0) {
          setBranchLoadWarning("No local or remote-tracking branches were found for this repository.");
        }
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setBranchLoadState("failed");
        setBranchLoadWarning(error instanceof Error ? error.message : "Unable to load Git branches.");
      });

    return () => {
      isActive = false;
    };
  }, [commits, project.id]);

  const canGeneratePackage = baseBranch.trim().length > 0;

  const prPackage = useMemo(
    () =>
      generatePrPackage({
        project,
        commits,
        baseBranch,
        branchName,
        title,
        notes,
      }),
    [baseBranch, branchName, commits, notes, project, title],
  );
  const createPrMutation = useMutation({
    mutationFn: () =>
      createGitHubPullRequest({
        projectId: project.id,
        baseBranch,
        newBranch: branchName,
        title,
        body: prPackage.prBody,
        commitHashes: [...prPackage.selectedCommits]
          .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
          .map((commit) => commit.commitHash),
        draft: false,
      }),
    onSuccess: (result) => {
      setCreatedPrUrl(result.url);
    },
  });

  const branchOptions = useMemo(
    () =>
      branches.map((branch) => ({
        value: branch.name,
        label: branch.kind === "remote" ? `${branch.name} - remote` : `${branch.name} - local`,
      })),
    [branches],
  );

  return (
    <Panel className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
            <GitPullRequest className="h-3.5 w-3.5" />
            PR package
          </div>
          <h2 className="text-lg font-semibold text-white">Build PR From Commits</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Generates copy-ready Git commands and can create a GitHub PR when connected.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
          aria-label="Close PR builder"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Base Branch">
          <select
            className={inputClass}
            value={baseBranch}
            onChange={(event) => setBaseBranch(event.target.value)}
            disabled={branchLoadState === "loading" || branchOptions.length === 0}
          >
            {branchLoadState === "loading" ? <option value="">Loading branches...</option> : null}
            {branchLoadState !== "loading" && branchOptions.length === 0 ? (
              <option value="">No branches available</option>
            ) : null}
            {branchOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="New Branch">
          <input className={inputClass} value={branchName} onChange={(event) => setBranchName(event.target.value)} />
        </Field>
        <Field label="PR Title">
          <input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Remote">
          <div className="flex h-10 items-center rounded-xl border border-white/10 bg-slate-950/75 px-3 text-xs text-slate-400">
            <span className="truncate">{prPackage.remoteUrl || "remote PR URL unavailable"}</span>
          </div>
        </Field>
      </div>

      <Field label="PR Notes">
        <textarea
          className={`${inputClass} min-h-20 resize-none py-2`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional context for the PR summary"
        />
      </Field>

      {branchLoadWarning ? (
        <div className="flex items-start gap-2 rounded-xl border border-orange-300/15 bg-orange-500/10 p-3 text-xs leading-5 text-orange-100/85">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-200" />
          <span>{branchLoadWarning}</span>
        </div>
      ) : null}

      {prPackage.warnings.length ? (
        <div className="space-y-2 rounded-xl border border-orange-300/15 bg-orange-500/10 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-200">
            <AlertTriangle className="h-4 w-4" />
            Validation notes
          </div>
          <ul className="space-y-1 text-xs leading-5 text-orange-100/85">
            {prPackage.warnings.map((warning) => (
              <li key={warning}>- {warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Rocket className="h-4 w-4 text-cyan-200" />
              GitHub PR creation
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              WorkTrace uses a temporary Git worktree, pushes the new branch with your local Git credentials, then creates the PR through GitHub.
            </p>
          </div>
          {githubStatusQuery.data?.connected ? (
            <Badge tone="green">Connected</Badge>
          ) : (
            <Badge tone="slate">Disconnected</Badge>
          )}
        </div>

        {!githubStatusQuery.data?.connected ? (
          <div className="mt-3 rounded-xl border border-orange-300/15 bg-orange-500/10 p-3 text-xs leading-5 text-orange-100/85">
            Connect GitHub in Settings before creating PRs from WorkTrace.
          </div>
        ) : null}
        {createPrMutation.isError ? (
          <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs leading-5 text-red-100">
            {createPrMutation.error instanceof Error
              ? createPrMutation.error.message
              : "GitHub PR creation failed."}
          </div>
        ) : null}
        {createdPrUrl ? (
          <a
            href={createdPrUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
          >
            <ExternalLink className="h-4 w-4" />
            Open created PR
          </a>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <OutputBlock
          title="Commands"
          value={prPackage.commandText}
          onCopy={() => onCopy("Commands copied", prPackage.commandText)}
        />
        <OutputBlock
          title="PR Body"
          value={prPackage.prBody}
          onCopy={() => onCopy("PR body copied", prPackage.prBody)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="cyan">{prPackage.selectedCommits.length} commit(s)</Badge>
          <Badge tone="slate">Read-only package</Badge>
        </div>
        <Button
          type="button"
          variant="primary"
          onClick={() => onCopy("Full PR package copied", fullPrPackageText(prPackage, title))}
          disabled={!canGeneratePackage}
        >
          <ClipboardCopy className="h-4 w-4" />
          Copy Full Package
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={
            !canGeneratePackage ||
            !githubStatusQuery.data?.connected ||
            createPrMutation.isPending ||
            prPackage.selectedCommits.length === 0
          }
          onClick={() => {
            const confirmed = window.confirm(
              "WorkTrace will create a temporary Git worktree, cherry-pick the selected commits, push the new branch to origin, and create a GitHub PR. Continue?",
            );
            if (confirmed) {
              setCreatedPrUrl(null);
              createPrMutation.mutate();
            }
          }}
        >
          <Rocket className="h-4 w-4" />
          {createPrMutation.isPending ? "Creating PR..." : "Push Branch & Create PR"}
        </Button>
      </div>
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-xs font-semibold text-slate-300">
      {label}
      {children}
    </label>
  );
}

function OutputBlock({
  title,
  value,
  onCopy,
}: {
  title: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/8 bg-slate-950/60">
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-3 py-2">
        <h3 className="text-xs font-semibold text-slate-200">{title}</h3>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          <ClipboardCopy className="h-3.5 w-3.5" />
          Copy
        </button>
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap p-3 text-xs leading-5 text-slate-300">
        {value}
      </pre>
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-xl border border-white/10 bg-slate-950/75 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15";

function selectDefaultBaseBranch(branches: GitBranch[], commits: ActivityItem[]) {
  const currentBranch = branches.find((branch) => branch.isCurrent);
  if (currentBranch) {
    return currentBranch.name;
  }

  const preferredBranchNames = ["origin/main", "main", suggestedBaseBranch(commits)];
  for (const name of preferredBranchNames) {
    const branch = branches.find((candidate) => candidate.name === name);
    if (branch) {
      return branch.name;
    }
  }

  return branches[0]?.name ?? "";
}
