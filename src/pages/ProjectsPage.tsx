import { open } from "@tauri-apps/plugin-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  FolderKanban,
  FolderOpen,
  GitBranch,
  Plus,
  Search,
  ShieldCheck,
  RefreshCw,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { syncCommits } from "../lib/api/gitSync";
import {
  archiveProject,
  createProject,
  listProjects,
  updateProject,
  validateRepoPath,
} from "../lib/api/projects";
import type { Project } from "../types/project";

const projectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required"),
  repoPath: z.string().trim().optional(),
  githubUrl: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^https?:\/\/.+/.test(value), {
      message: "Use a valid http or https URL",
    }),
  projectType: z.string().trim().optional(),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

const emptyValues: ProjectFormValues = {
  name: "",
  repoPath: "",
  githubUrl: "",
  projectType: "Company",
};

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">(
    "active",
  );
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [repoValidation, setRepoValidation] = useState<ValidationState | null>(null);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: emptyValues,
  });

  const autoSyncMutation = useMutation({
    mutationFn: (project: Project) =>
      syncCommits({
        from: null,
        to: null,
        authorEmail: null,
        projectIds: [project.id],
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: ProjectFormValues) => {
      const input = {
        name: values.name,
        repoPath: normalizeOptional(values.repoPath),
        githubUrl: normalizeOptional(values.githubUrl),
        projectType: normalizeOptional(values.projectType),
      };

      if (input.repoPath) {
        const isValidRepo = await validateRepoPath(input.repoPath);
        if (!isValidRepo) {
          throw new Error("That path does not look like a Git repository.");
        }
      }

      if (editingProject) {
        return updateProject(editingProject.id, input);
      }

      return createProject(input);
    },
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      closeForm();

      if (project.repoPath && project.status === "active") {
        autoSyncMutation.mutate(project);
      }
    },
  });

  const archiveMutation = useMutation({
    mutationFn: archiveProject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });

  const projects = projectsQuery.data ?? [];
  const activeProjects = projects.filter((project) => project.status === "active");
  const archivedProjects = projects.filter((project) => project.status === "archived");
  const activeGitBackedProjects = activeProjects.filter((project) => project.repoPath);
  const activeManualOnlyProjects = activeProjects.filter((project) => !project.repoPath);

  const filteredProjects = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesStatus =
        statusFilter === "all" || project.status === statusFilter;
      const matchesSearch =
        !needle ||
        project.name.toLowerCase().includes(needle) ||
        project.repoPath?.toLowerCase().includes(needle) ||
        project.githubUrl?.toLowerCase().includes(needle);

      return matchesStatus && matchesSearch;
    });
  }, [projects, search, statusFilter]);

  function openCreateForm() {
    setEditingProject(null);
    setRepoValidation(null);
    form.reset(emptyValues);
    setIsFormOpen(true);
  }

  function openEditForm(project: Project) {
    setEditingProject(project);
    setRepoValidation(null);
    form.reset({
      name: project.name,
      repoPath: project.repoPath ?? "",
      githubUrl: project.githubUrl ?? "",
      projectType: project.projectType ?? "Company",
    });
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingProject(null);
    setRepoValidation(null);
    saveMutation.reset();
    form.reset(emptyValues);
  }

  async function chooseRepoPath() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Choose a Git repository folder",
      });

      if (typeof selected === "string") {
        form.setValue("repoPath", selected, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
        setRepoValidation(null);
      }
    } catch (error) {
      setRepoValidation({ tone: "error", message: toMessage(error) });
    }
  }

  async function checkRepoPath() {
    const path = form.getValues("repoPath")?.trim();
    if (!path) {
      setRepoValidation({
        tone: "warning",
        message: "Add or choose a repository path first.",
      });
      return;
    }

    setRepoValidation({ tone: "pending", message: "Checking repository..." });

    try {
      const isValidRepo = await validateRepoPath(path);
      setRepoValidation(
        isValidRepo
          ? {
              tone: "success",
              message: "Repository path is valid and ready to sync.",
            }
          : {
              tone: "error",
              message: "This path does not contain Git metadata.",
            },
      );
    } catch (error) {
      setRepoValidation({ tone: "error", message: toMessage(error) });
    }
  }

  return (
    <div className="space-y-4">
      <Panel className="relative overflow-hidden p-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_28%,rgba(56,189,248,0.18),transparent_26%),radial-gradient(circle_at_72%_12%,rgba(37,99,235,0.18),transparent_24%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Local project registry
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Projects
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Connect local repositories, keep manual-only work visible, and prepare
              each source for weekly activity reporting.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden rounded-xl border border-white/8 bg-slate-950/45 px-4 py-3 text-right shadow-2xl shadow-blue-950/20 backdrop-blur-xl lg:block">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
                Active Sources
              </p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {activeProjects.length}
              </p>
            </div>
            <Button variant="primary" onClick={openCreateForm}>
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="space-y-4">
          <Panel className="flex flex-wrap items-center justify-between gap-3 p-3">
            <label className="flex min-w-0 flex-1 basis-[280px] items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-xs text-slate-400 shadow-inner shadow-black/20">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                className="w-full bg-transparent text-slate-100 outline-none placeholder:text-slate-500"
                placeholder="Search projects, repositories, GitHub URLs..."
              />
            </label>

            <div className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-slate-950/50 p-1">
              {(["active", "archived", "all"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={[
                    "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all duration-150",
                    statusFilter === status
                      ? "bg-blue-500 text-white shadow-lg shadow-blue-500/25"
                      : "text-slate-400 hover:bg-white/10 hover:text-slate-200",
                  ].join(" ")}
                >
                  {status}
                </button>
              ))}
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            <ProjectMetric
              icon={FolderKanban}
              label="Visible"
              value={filteredProjects.length.toString()}
              caption={`Of ${projects.length} registered`}
            />
            <ProjectMetric
              icon={CheckCircle2}
              label="Active"
              value={activeProjects.length.toString()}
              caption="Ready for reports"
              tone="green"
            />
            <ProjectMetric
              icon={GitBranch}
              label="Git Repos"
              value={activeGitBackedProjects.length.toString()}
              caption="Active local repos"
              tone="cyan"
            />
            <ProjectMetric
              icon={Archive}
              label="Archived"
              value={archivedProjects.length.toString()}
              caption="Hidden by default"
              tone="orange"
            />
          </div>

          <Panel className="min-h-[360px] p-3 lg:min-h-[420px]">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Project Sources
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {filteredProjects.length} visible of {projects.length} registered
                </p>
              </div>
              <Badge tone={statusFilter === "archived" ? "orange" : "blue"}>
                {statusFilter}
              </Badge>
            </div>

            {projectsQuery.isLoading ? (
              <ProjectListSkeleton />
            ) : projectsQuery.isError ? (
              <EmptyProjects
                tone="error"
                title="Project data is not available"
                message={toMessage(projectsQuery.error)}
                actionLabel="Try Again"
                onAction={() => projectsQuery.refetch()}
              />
            ) : filteredProjects.length === 0 ? (
              <EmptyProjects
                title={projects.length === 0 ? "No projects yet" : "No matching projects"}
                message={
                  projects.length === 0
                    ? "Create your first project to start syncing local Git activity."
                    : "Adjust your filters or search query."
                }
                actionLabel="New Project"
                onAction={openCreateForm}
              />
            ) : (
              <div className="grid gap-2.5">
                {filteredProjects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    isArchiving={archiveMutation.isPending}
                    onEdit={() => openEditForm(project)}
                    onArchive={() => archiveMutation.mutate(project.id)}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:block xl:space-y-4">
          <Panel className="h-fit p-0">
            <div className="border-b border-white/8 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    {editingProject ? "Edit Project" : "Project Setup"}
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {isFormOpen
                      ? "Use the native picker or paste a local repository path."
                      : "Open the form to register a source."}
                  </p>
                </div>
                {isFormOpen ? (
                  <Button variant="ghost" onClick={closeForm} aria-label="Close form">
                    <X className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>

            {isFormOpen ? (
              <form
                className="space-y-4 p-4"
                onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
              >
                <TextField
                  label="Project Name"
                  placeholder="Sparc Force API"
                  error={form.formState.errors.name?.message}
                  {...form.register("name")}
                />

                <div className="space-y-2">
                  <TextField
                    label="Local Repository Path"
                    placeholder="C:\\Users\\Sparc\\Documents\\projects\\repo"
                    error={form.formState.errors.repoPath?.message}
                    {...form.register("repoPath")}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="secondary" onClick={chooseRepoPath}>
                      <FolderOpen className="h-4 w-4" />
                      Choose Folder
                    </Button>
                    <Button type="button" variant="secondary" onClick={checkRepoPath}>
                      <GitBranch className="h-4 w-4" />
                      Validate
                    </Button>
                  </div>
                  {repoValidation ? <ValidationMessage state={repoValidation} /> : null}
                </div>

                <TextField
                  label="GitHub Repository URL"
                  placeholder="https://github.com/company/repo"
                  error={form.formState.errors.githubUrl?.message}
                  {...form.register("githubUrl")}
                />

                <label className="grid gap-2 text-xs font-semibold text-slate-300">
                  Project Type
                  <select
                    className="h-10 rounded-xl border border-white/10 bg-slate-950/75 px-3 text-sm text-slate-100 outline-none transition focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15"
                    {...form.register("projectType")}
                  >
                    <option>Company</option>
                    <option>Client</option>
                    <option>Internal</option>
                    <option>Personal</option>
                    <option>Manual Only</option>
                  </select>
                </label>

                {saveMutation.isError ? (
                  <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
                    {toMessage(saveMutation.error)}
                  </div>
                ) : null}

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full py-2.5"
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending
                    ? "Saving..."
                    : editingProject
                      ? "Save Project"
                      : "Create Project"}
                </Button>
              </form>
            ) : (
              <div className="p-4">
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.025] p-4">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-blue-300/20 bg-blue-500/15 text-blue-200">
                    <FolderKanban className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold text-slate-200">
                    Add a source when you are ready.
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">
                    Git-backed projects auto-sync as soon as they are saved and then
                    refresh while WorkTrace is open. Manual-only projects stay available
                    for planning, meetings, and reports.
                  </p>
                </div>
              </div>
            )}
          </Panel>

          <Panel className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Database className="h-4 w-4 text-cyan-300" />
              Runtime Gate
            </div>
            <GateLine label="SQLite persistence" value="Ready" tone="green" />
            <GateLine
              label="Folder picker"
              value="Native dialog"
              tone="blue"
            />
            <GateLine
              label="Manual-only sources"
              value={activeManualOnlyProjects.length.toString()}
              tone="slate"
            />
            {autoSyncMutation.isPending ? (
              <div className="flex items-center gap-2 rounded-xl border border-blue-300/20 bg-blue-500/10 p-3 text-xs text-blue-100">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Syncing new project activity...
              </div>
            ) : null}
            {autoSyncMutation.data ? (
              <div
                className={[
                  "rounded-xl border p-3 text-xs",
                  autoSyncMutation.data.errors.length
                    ? "border-orange-300/20 bg-orange-500/10 text-orange-100"
                    : "border-emerald-300/20 bg-emerald-500/10 text-emerald-100",
                ].join(" ")}
              >
                Auto-sync checked repository history: added{" "}
                {autoSyncMutation.data.newCommits} commits and updated{" "}
                {autoSyncMutation.data.updatedCommits}.
                {autoSyncMutation.data.errors.length ? (
                  <div className="mt-2 leading-5">
                    {autoSyncMutation.data.errors.join(" ")}
                  </div>
                ) : null}
              </div>
            ) : null}
            {autoSyncMutation.isError ? (
              <div className="rounded-xl border border-orange-300/20 bg-orange-500/10 p-3 text-xs text-orange-100">
                Project was saved, but automatic sync needs attention:{" "}
                {toMessage(autoSyncMutation.error)}
              </div>
            ) : null}
            <div className="rounded-xl border border-cyan-300/10 bg-cyan-300/5 p-3 text-xs leading-5 text-slate-400">
              New Git-backed projects sync repository history first, then refresh every 5
              minutes while WorkTrace is open.
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ProjectRow({
  project,
  isArchiving,
  onEdit,
  onArchive,
}: {
  project: Project;
  isArchiving: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <article className="group relative overflow-hidden rounded-xl border border-white/8 bg-slate-950/45 p-3.5 shadow-lg shadow-black/15 transition-all duration-150 hover:border-blue-300/25 hover:bg-slate-900/60">
      <div className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-gradient-to-b from-blue-400 via-cyan-300 to-blue-600 opacity-70" />
      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold text-white">{project.name}</h3>
            <Badge tone={project.status === "active" ? "green" : "orange"}>
              {project.status}
            </Badge>
            {project.projectType ? <Badge tone="blue">{project.projectType}</Badge> : null}
          </div>
          <p className="mt-2 truncate text-xs text-slate-400">
            {project.repoPath || "Manual-only project"}
          </p>
          {project.githubUrl ? (
            <a
              href={project.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex max-w-full items-center gap-1 text-xs text-cyan-300/85 hover:text-cyan-200"
            >
              <span className="truncate">{project.githubUrl}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="secondary" onClick={onEdit} className="h-8 px-3 text-xs">
            Edit
          </Button>
          {project.status === "active" ? (
            <Button
              variant="ghost"
              onClick={onArchive}
              disabled={isArchiving}
              className="h-8 px-3 text-xs text-orange-200 hover:bg-orange-500/10 hover:text-orange-100"
              aria-label={`Archive ${project.name}`}
              title={`Archive ${project.name}`}
            >
              <Archive className="h-4 w-4" />
              Archive
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 pl-2 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <Clock3 className="h-3 w-3" />
          Updated {formatDate(project.updatedAt)}
        </span>
      </div>
    </article>
  );
}

function ProjectMetric({
  icon: Icon,
  label,
  value,
  caption,
  tone = "blue",
}: {
  icon: typeof FolderKanban;
  label: string;
  value: string;
  caption: string;
  tone?: "blue" | "cyan" | "green" | "orange";
}) {
  const toneClass = {
    blue: "border-blue-300/20 bg-blue-500/15 text-blue-200 shadow-blue-500/10",
    cyan: "border-cyan-300/20 bg-cyan-500/15 text-cyan-200 shadow-cyan-500/10",
    green:
      "border-emerald-300/20 bg-emerald-500/15 text-emerald-200 shadow-emerald-500/10",
    orange:
      "border-orange-300/20 bg-orange-500/15 text-orange-200 shadow-orange-500/10",
  }[tone];

  return (
    <Panel className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
          <p className="mt-1 text-[11px] text-slate-500">{caption}</p>
        </div>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl border shadow-lg ${toneClass}`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Panel>
  );
}

function ProjectListSkeleton() {
  return (
    <div className="grid gap-2.5">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-24 animate-pulse rounded-xl border border-white/8 bg-white/[0.035]"
        />
      ))}
    </div>
  );
}

function EmptyProjects({
  title,
  message,
  actionLabel,
  onAction,
  tone = "default",
}: {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
  tone?: "default" | "error";
}) {
  const Icon = tone === "error" ? AlertCircle : FolderKanban;

  return (
    <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/35 px-4 py-10 text-center lg:min-h-[320px]">
      <div>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-500/15 text-blue-200 shadow-lg shadow-blue-500/10">
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-xs leading-5 text-slate-400">
          {message}
        </p>
        <Button variant="primary" className="mt-4" onClick={onAction}>
          <Plus className="h-4 w-4" />
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

function TextField({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
}) {
  return (
    <label className="grid gap-2 text-xs font-semibold text-slate-300">
      {label}
      <input
        className="h-10 rounded-xl border border-white/10 bg-slate-950/75 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15"
        {...props}
      />
      {error ? <span className="text-[11px] text-red-300">{error}</span> : null}
    </label>
  );
}

type ValidationState = {
  tone: "pending" | "success" | "warning" | "error";
  message: string;
};

function ValidationMessage({ state }: { state: ValidationState }) {
  const classes = {
    pending: "border-blue-300/20 bg-blue-500/10 text-blue-100",
    success: "border-emerald-300/20 bg-emerald-500/10 text-emerald-100",
    warning: "border-orange-300/20 bg-orange-500/10 text-orange-100",
    error: "border-red-300/20 bg-red-500/10 text-red-100",
  }[state.tone];

  return (
    <div className={`rounded-xl border px-3 py-2 text-xs ${classes}`}>
      {state.message}
    </div>
  );
}

function GateLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "green" | "slate";
}) {
  const dotClass = {
    blue: "bg-blue-300",
    green: "bg-emerald-300",
    slate: "bg-slate-400",
  }[tone];

  return (
    <div className="flex items-center justify-between rounded-xl border border-white/8 bg-slate-950/35 px-3 py-2 text-xs">
      <span className="inline-flex items-center gap-2 text-slate-400">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        {label}
      </span>
      <span className="font-semibold text-slate-200">{value}</span>
    </div>
  );
}

function normalizeOptional(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
