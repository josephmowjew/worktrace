import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FolderKanban,
  GitBranch,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
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
  const [repoValidation, setRepoValidation] = useState<string | null>(null);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: emptyValues,
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      closeForm();
    },
  });

  const archiveMutation = useMutation({
    mutationFn: archiveProject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });

  const projects = projectsQuery.data ?? [];
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

  const activeCount = projects.filter((project) => project.status === "active").length;
  const archivedCount = projects.filter(
    (project) => project.status === "archived",
  ).length;

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

  async function checkRepoPath() {
    const path = form.getValues("repoPath")?.trim();
    if (!path) {
      setRepoValidation("Add a repository path first.");
      return;
    }

    try {
      const isValidRepo = await validateRepoPath(path);
      setRepoValidation(
        isValidRepo
          ? "Repository path is valid."
          : "This path does not look like a Git repository.",
      );
    } catch (error) {
      setRepoValidation(toMessage(error));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-slate-400">
            Register local repositories and manual-only projects.
          </p>
        </div>
        <Button variant="primary" onClick={openCreateForm}>
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-4">
        <div className="space-y-4">
          <Panel className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex min-w-[340px] flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-slate-400">
              <Search className="h-4 w-4" />
              <input
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                className="w-full bg-transparent text-slate-100 outline-none placeholder:text-slate-500"
                placeholder="Search projects, repos..."
              />
            </label>

            <div className="flex items-center gap-2">
              {(["active", "archived", "all"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={[
                    "rounded-xl border px-3 py-2 text-sm font-medium capitalize transition",
                    statusFilter === status
                      ? "border-blue-400/40 bg-blue-500/20 text-blue-100"
                      : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]",
                  ].join(" ")}
                >
                  {status}
                </button>
              ))}
            </div>
          </Panel>

          <div className="grid grid-cols-3 gap-4">
            <ProjectMetric
              icon={FolderKanban}
              label="Total Projects"
              value={projects.length.toString()}
            />
            <ProjectMetric
              icon={CheckCircle2}
              label="Active"
              value={activeCount.toString()}
              tone="green"
            />
            <ProjectMetric
              icon={Archive}
              label="Archived"
              value={archivedCount.toString()}
              tone="orange"
            />
          </div>

          <Panel className="min-h-[520px]">
            {projectsQuery.isLoading ? (
              <ProjectListSkeleton />
            ) : projectsQuery.isError ? (
              <EmptyProjects
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
              <div className="grid gap-3">
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

        <Panel className="h-fit">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {editingProject ? "Edit Project" : "Project Setup"}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {isFormOpen
                  ? "Add the local repository path WorkTrace will scan."
                  : "Open the form to register a repository."}
              </p>
            </div>
            {isFormOpen ? (
              <Button variant="ghost" onClick={closeForm} aria-label="Close form">
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          {isFormOpen ? (
            <form
              className="mt-5 space-y-4"
              onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
            >
              <TextField
                label="Project Name"
                placeholder="Sparc Force API"
                error={form.formState.errors.name?.message}
                {...form.register("name")}
              />

              <TextField
                label="Local Repository Path"
                placeholder="C:\\Users\\Sparc\\Documents\\projects\\repo"
                error={form.formState.errors.repoPath?.message}
                {...form.register("repoPath")}
              />

              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={checkRepoPath}>
                  <GitBranch className="h-4 w-4" />
                  Validate Path
                </Button>
                {repoValidation ? (
                  <p className="text-xs text-slate-400">{repoValidation}</p>
                ) : null}
              </div>

              <TextField
                label="GitHub Repository URL"
                placeholder="https://github.com/company/repo"
                error={form.formState.errors.githubUrl?.message}
                {...form.register("githubUrl")}
              />

              <label className="grid gap-2 text-sm font-medium text-slate-300">
                Project Type
                <select
                  className="h-11 rounded-xl border border-white/10 bg-slate-950/80 px-3 text-slate-100 outline-none transition focus:border-blue-400/70"
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
                <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">
                  {toMessage(saveMutation.error)}
                </div>
              ) : null}

              <Button
                type="submit"
                variant="primary"
                className="w-full"
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
            <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
              Use New Project to register repositories. Manual-only projects can be
              added without a local path.
            </div>
          )}
        </Panel>
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
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-blue-300/30 hover:bg-white/[0.055]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold">{project.name}</h3>
            <Badge tone={project.status === "active" ? "green" : "orange"}>
              {project.status}
            </Badge>
            {project.projectType ? <Badge tone="blue">{project.projectType}</Badge> : null}
          </div>
          <p className="mt-2 truncate text-sm text-slate-400">
            {project.repoPath || "Manual-only project"}
          </p>
          {project.githubUrl ? (
            <a
              href={project.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm text-blue-300 hover:text-blue-200"
            >
              {project.githubUrl}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" onClick={onEdit}>
            Edit
          </Button>
          {project.status === "active" ? (
            <Button variant="ghost" onClick={onArchive} disabled={isArchiving}>
              <Archive className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <Clock3 className="h-3.5 w-3.5" />
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
  tone = "blue",
}: {
  icon: typeof FolderKanban;
  label: string;
  value: string;
  tone?: "blue" | "green" | "orange";
}) {
  const toneClass = {
    blue: "text-blue-200 bg-blue-500/15",
    green: "text-emerald-200 bg-emerald-500/15",
    orange: "text-orange-200 bg-orange-500/15",
  }[tone];

  return (
    <Panel className="flex items-center gap-3 p-4">
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${toneClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </div>
    </Panel>
  );
}

function ProjectListSkeleton() {
  return (
    <div className="grid gap-3">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]"
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
}: {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex h-[430px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.03] text-center">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">{message}</p>
        <Button variant="primary" className="mt-5" onClick={onAction}>
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
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-300">
      {label}
      <input
        className="h-11 rounded-xl border border-white/10 bg-slate-950/80 px-3 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-400/70"
        {...props}
      />
      {error ? <span className="text-xs text-red-300">{error}</span> : null}
    </label>
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
