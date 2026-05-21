import { open } from "@tauri-apps/plugin-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Archive,
  ChevronDown,
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
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { ProjectCard } from "../components/ui/ProjectCard";
import { DonutChart, CategoryLegend } from "../components/ui/DonutChart";
import { RepositoriesTable } from "../components/ui/RepositoriesTable";
import { ContributorsList } from "../components/ui/ContributorsList";
import { Pagination } from "../components/ui/Pagination";
import {
  archiveProject,
  createProject,
  listProjects,
  updateProject,
  validateRepoPath,
  getProjectStats,
  getCategoryDistribution,
  getRecentCommits,
  getTopContributors,
} from "../lib/api/projects";
import type {
  Project,
  ProjectStats,
} from "../types/project";

const projectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required"),
  description: z.string().trim().optional(),
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
  description: "",
  repoPath: "",
  githubUrl: "",
  projectType: "Backend",
};

const ITEMS_PER_PAGE = 6;

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"recentlyUpdated" | "name" | "commits">("recentlyUpdated");
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [repoValidation, setRepoValidation] = useState<ValidationState | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  const statsQuery = useQuery({
    queryKey: ["projectStats"],
    queryFn: getProjectStats,
  });

  const categoryQuery = useQuery({
    queryKey: ["categoryDistribution"],
    queryFn: getCategoryDistribution,
  });

  const recentCommitsQuery = useQuery({
    queryKey: ["recentCommits"],
    queryFn: () => getRecentCommits(5),
  });

  const contributorsQuery = useQuery({
    queryKey: ["topContributors"],
    queryFn: () => getTopContributors(4),
  });

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: emptyValues,
  });

  const autoSyncMutation = useMutation({
    mutationFn: () => Promise.resolve(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
      await queryClient.invalidateQueries({ queryKey: ["projectStats"] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: ProjectFormValues) => {
      const input = {
        name: values.name,
        description: normalizeOptional(values.description),
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
      await queryClient.invalidateQueries({ queryKey: ["projectStats"] });
      await queryClient.invalidateQueries({ queryKey: ["categoryDistribution"] });
      closeForm();

      if (project.repoPath && project.status === "active") {
        autoSyncMutation.mutate();
      }
    },
  });

  const archiveMutation = useMutation({
    mutationFn: archiveProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projectStats"] });
      queryClient.invalidateQueries({ queryKey: ["categoryDistribution"] });
    },
  });

  const projects = projectsQuery.data ?? [];
  const statsMap = useMemo(() => {
    const map = new Map<string, ProjectStats>();
    statsQuery.data?.forEach((s) => map.set(s.projectId, s));
    return map;
  }, [statsQuery.data]);

  const categories = categoryQuery.data ?? [];
  const totalProjects = projects.filter((p) => p.status === "active").length;

  const filteredProjects = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesStatus = statusFilter === "all" || project.status === statusFilter;
      const matchesCategory =
        categoryFilter === "all" || project.projectType === categoryFilter;
      const matchesSearch =
        !needle ||
        project.name.toLowerCase().includes(needle) ||
        project.description?.toLowerCase().includes(needle) ||
        project.repoPath?.toLowerCase().includes(needle) ||
        project.githubUrl?.toLowerCase().includes(needle);

      return matchesStatus && matchesCategory && matchesSearch;
    });
  }, [projects, search, statusFilter, categoryFilter]);

  const sortedProjects = useMemo(() => {
    const sorted = [...filteredProjects];
    switch (sortBy) {
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "commits":
        sorted.sort((a, b) => {
          const aCommits = statsMap.get(a.id)?.commitsThisWeek ?? 0;
          const bCommits = statsMap.get(b.id)?.commitsThisWeek ?? 0;
          return bCommits - aCommits;
        });
        break;
      case "recentlyUpdated":
      default:
        sorted.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        break;
    }
    return sorted;
  }, [filteredProjects, sortBy, statsMap]);

  const totalPages = Math.ceil(sortedProjects.length / ITEMS_PER_PAGE);
  const paginatedProjects = sortedProjects.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const activeProjects = projects.filter((project) => project.status === "active");
  const archivedProjects = projects.filter((project) => project.status === "archived");

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
      description: project.description ?? "",
      repoPath: project.repoPath ?? "",
      githubUrl: project.githubUrl ?? "",
      projectType: project.projectType ?? "Backend",
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

  function handlePageChange(page: number) {
    setCurrentPage(page);
  }

  return (
    <div className="space-y-4">
      <Panel className="relative overflow-hidden p-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_28%,rgba(56,189,248,0.18),transparent_26%),radial-gradient(circle_at_72%_12%,rgba(37,99,235,0.18),transparent_24%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Project Management
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Projects
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              View and manage all your software projects and repositories.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden items-center gap-4 rounded-xl border border-white/8 bg-slate-950/45 px-4 py-3 shadow-2xl shadow-blue-950/20 backdrop-blur-xl lg:flex">
              <div className="text-right">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
                  Total Projects
                </p>
                <p className="mt-1 text-2xl font-semibold text-white">
                  {projects.length}
                </p>
              </div>
            </div>
            <Button variant="primary" onClick={openCreateForm}>
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Panel className="flex flex-wrap items-center justify-between gap-3 p-3">
            <label className="flex min-w-0 flex-1 basis-[240px] items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-xs text-slate-400 shadow-inner shadow-black/20">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                className="w-full bg-transparent text-slate-100 outline-none placeholder:text-slate-500"
                placeholder="Search projects, repos..."
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                value={statusFilter}
                onChange={(v) => {
                  setStatusFilter(v as typeof statusFilter);
                  setCurrentPage(1);
                }}
                options={[
                  { value: "all", label: "All Status" },
                  { value: "active", label: "Active" },
                  { value: "archived", label: "Archived" },
                ]}
              />

              <FilterSelect
                value={categoryFilter}
                onChange={(v) => {
                  setCategoryFilter(v);
                  setCurrentPage(1);
                }}
                options={[
                  { value: "all", label: "All Categories" },
                  ...Array.from(
                    new Set(projects.map((p) => p.projectType).filter(Boolean)),
                  ).map((cat) => ({ value: cat!, label: cat! })),
                ]}
              />

              <FilterSelect
                value={sortBy}
                onChange={(v) => {
                  setSortBy(v as typeof sortBy);
                  setCurrentPage(1);
                }}
                options={[
                  { value: "recentlyUpdated", label: "Recently Updated" },
                  { value: "name", label: "Name" },
                  { value: "commits", label: "Most Commits" },
                ]}
              />

              {(search || statusFilter !== "active" || categoryFilter !== "all") && (
                <button
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("active");
                    setCategoryFilter("all");
                    setCurrentPage(1);
                  }}
                  className="rounded-lg px-3 py-2 text-xs font-medium text-blue-300 transition-colors hover:bg-white/10"
                >
                  Clear
                </button>
              )}
            </div>
          </Panel>

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
          ) : paginatedProjects.length === 0 ? (
            <EmptyProjects
              title={projects.length === 0 ? "No projects yet" : "No matching projects"}
              message={
                projects.length === 0
                  ? "Create your first project to start tracking activity."
                  : "Adjust your filters or search query."
              }
              actionLabel="New Project"
              onAction={openCreateForm}
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {paginatedProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    stats={statsMap.get(project.id)}
                    onEdit={() => openEditForm(project)}
                    onArchive={() => archiveMutation.mutate(project.id)}
                  />
                ))}
              </div>

              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={sortedProjects.length}
                itemsPerPage={ITEMS_PER_PAGE}
                onPageChange={handlePageChange}
              />
            </>
          )}

          <Panel className="p-0">
            <div className="border-b border-white/8 px-4 py-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100">
                  Recent Repositories
                </h2>
                <button className="text-xs font-medium text-blue-300 transition-colors hover:text-blue-200">
                  View all repositories
                </button>
              </div>
            </div>
            <div className="p-3">
              {recentCommitsQuery.isLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <RefreshCw className="h-5 w-5 animate-spin text-slate-500" />
                </div>
              ) : (
                <RepositoriesTable commits={recentCommitsQuery.data ?? []} />
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel className="p-4">
            <h2 className="mb-4 text-sm font-semibold text-slate-100">
              Project Categories
            </h2>
            {categoryQuery.isLoading ? (
              <div className="flex h-40 items-center justify-center">
                <RefreshCw className="h-5 w-5 animate-spin text-slate-500" />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <DonutChart data={categories} size={120} strokeWidth={16} />
                <CategoryLegend data={categories} total={totalProjects} />
              </div>
            )}
          </Panel>

          <Panel className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">
                Status Summary
              </h2>
            </div>
            <div className="space-y-2">
              <StatusRow
                label="Active"
                count={activeProjects.length}
                dotColor="bg-emerald-400"
              />
              <StatusRow
                label="Archived"
                count={archivedProjects.length}
                dotColor="bg-slate-400"
              />
              <StatusRow
                label="Maintenance"
                count={0}
                dotColor="bg-orange-400"
              />
            </div>
            <button className="mt-3 flex w-full items-center justify-between rounded-xl border border-white/8 bg-slate-950/35 px-3 py-2 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-300">
              <span className="flex items-center gap-2">
                <Archive className="h-3.5 w-3.5" />
                View Archived Projects
              </span>
              <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
            </button>
          </Panel>

          <Panel className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100">
                Top Contributors
              </h2>
              <span className="text-[10px] text-slate-500">(This Week)</span>
            </div>
            {contributorsQuery.isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <RefreshCw className="h-5 w-5 animate-spin text-slate-500" />
              </div>
            ) : (
              <ContributorsList contributors={contributorsQuery.data ?? []} />
            )}
          </Panel>

          <Panel className="p-0">
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

                <TextField
                  label="Description"
                  placeholder="Backend REST API for platform..."
                  error={form.formState.errors.description?.message}
                  {...form.register("description")}
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
                    <option>Backend</option>
                    <option>Frontend</option>
                    <option>Marketing</option>
                    <option>Tools</option>
                    <option>Service</option>
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
                    Git-backed projects auto-sync as soon as they are saved.
                  </p>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 pr-8 text-xs text-slate-300 outline-none transition focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
    </div>
  );
}

function StatusRow({
  label,
  count,
  dotColor,
}: {
  label: string;
  count: number;
  dotColor: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/8 bg-slate-950/35 px-3 py-2 text-xs">
      <span className="flex items-center gap-2 text-slate-400">
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
        {label}
      </span>
      <span className="font-semibold text-white">{count}</span>
    </div>
  );
}

function ProjectListSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <div
          key={item}
          className="h-48 animate-pulse rounded-2xl border border-white/8 bg-white/[0.035]"
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

function normalizeOptional(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
