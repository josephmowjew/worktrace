import { open } from "@tauri-apps/plugin-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  ChevronDown,
  EyeOff,
  FolderKanban,
  FolderOpen,
  GitBranch,
  Layers,
  Plus,
  Search,
  ShieldCheck,
  RefreshCw,
  X,
  LayoutGrid,
} from "lucide-react";
import { useMemo, useState, useEffect, useRef } from "react";
import type { InputHTMLAttributes } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { Select } from "../components/ui/Select";
import { SelectField } from "../components/ui/SelectField";
import { ProjectCard } from "../components/ui/ProjectCard";
import { DonutChart, CategoryLegend } from "../components/ui/DonutChart";
import { RepositoriesTable } from "../components/ui/RepositoriesTable";
import { ContributorsList } from "../components/ui/ContributorsList";
import { Pagination } from "../components/ui/Pagination";
import { useSpeech } from "../components/ui/SpeechProvider";
import { useToast } from "../components/ui/ToastProvider";
import { syncCommits } from "../lib/api/gitSync";
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
import {
  archiveWorkspace,
  createWorkspace,
  ignoreWorkspaceRepository,
  importWorkspaceRepositories,
  listWorkspaces,
  scanWorkspace,
  unignoreWorkspaceRepository,
} from "../lib/api/workspaces";
import { syncAnnouncement, syncStartedAnnouncement } from "../lib/announcements";
import type {
  Project,
  ProjectStats,
} from "../types/project";
import type { WorkspaceRepoDiscovery } from "../types/workspace";

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
type ProjectsLocationState = { openWorkspaceScan?: boolean } | null;

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
  const toast = useToast();
  const speech = useSpeech();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"workspaces" | "projects">("workspaces");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");
  const [sourceFilter, setSourceFilter] = useState<"all" | "workspace" | "personal">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"recentlyUpdated" | "name" | "commits">("recentlyUpdated");
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [repoValidation, setRepoValidation] = useState<ValidationState | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [recentCommitLimit, setRecentCommitLimit] = useState(5);
  const [isWorkspaceFormOpen, setIsWorkspaceFormOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceRootPath, setWorkspaceRootPath] = useState("");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [workspaceStatusFilter, setWorkspaceStatusFilter] = useState<"active" | "archived" | "all">("active");
  const [workspaceDiscoveries, setWorkspaceDiscoveries] = useState<WorkspaceRepoDiscovery[]>([]);
  const [selectedRepoPaths, setSelectedRepoPaths] = useState<Set<string>>(new Set());

  const projectFormRef = useRef<HTMLDivElement>(null);
  const workspacePanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFormOpen && projectFormRef.current) {
      setTimeout(() => {
        projectFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [isFormOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isFormOpen) {
          closeForm();
        } else if (isWorkspaceFormOpen) {
          setIsWorkspaceFormOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFormOpen, isWorkspaceFormOpen]);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
    refetchInterval: 60_000,
  });

  const statsQuery = useQuery({
    queryKey: ["projectStats"],
    queryFn: getProjectStats,
    refetchInterval: 60_000,
  });

  const categoryQuery = useQuery({
    queryKey: ["categoryDistribution"],
    queryFn: getCategoryDistribution,
  });

  const recentCommitsQuery = useQuery({
    queryKey: ["recentCommits", recentCommitLimit],
    queryFn: () => getRecentCommits(recentCommitLimit),
    refetchInterval: 60_000,
  });

  const contributorsQuery = useQuery({
    queryKey: ["topContributors"],
    queryFn: () => getTopContributors(4),
  });

  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: listWorkspaces,
  });

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: emptyValues,
  });

  const autoSyncMutation = useMutation({
    mutationFn: (projectId: string) =>
      syncCommits({
        from: null,
        to: null,
        authorEmail: null,
        projectIds: [projectId],
      }),
    onMutate: (projectId) => {
      const project = projects.find((item) => item.id === projectId);
      speech.announce(syncStartedAnnouncement(project ? `${project.name} activity` : "project activity"), {
        category: "sync",
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
      await queryClient.invalidateQueries({ queryKey: ["projectStats"] });
      await queryClient.invalidateQueries({ queryKey: ["recentCommits"] });
      await queryClient.invalidateQueries({ queryKey: ["topContributors"] });
      toast.success(
        "Project sync complete",
        `Added ${result.newCommits} commits and updated ${result.updatedCommits}.`,
      );
      speech.announce(syncAnnouncement(result), { category: "sync" });
    },
    onError: (error) => {
      toast.error("Project sync failed", toMessage(error));
    },
  });

  const workspaceSyncMutation = useMutation({
    mutationFn: (workspaceId: string) => {
      const projectIds = projects
        .filter((project) => project.status === "active" && project.workspaceId === workspaceId && project.repoPath)
        .map((project) => project.id);

      return syncCommits({
        from: null,
        to: null,
        authorEmail: null,
        projectIds,
      });
    },
    onMutate: (workspaceId) => {
      const workspace = workspacesQuery.data?.find((item) => item.id === workspaceId);
      speech.announce(syncStartedAnnouncement(workspace ? `${workspace.name} workspace activity` : "workspace activity"), {
        category: "sync",
      });
    },
    onSuccess: async (result) => {
      await invalidateProjectViews(queryClient);
      toast.success(
        "Workspace sync complete",
        `Scanned ${result.scannedProjects} imported repos. Added ${result.newCommits} commits and updated ${result.updatedCommits}.`,
      );
      speech.announce(syncAnnouncement(result), { category: "sync" });
    },
    onError: (error) => {
      toast.error("Workspace sync failed", toMessage(error));
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
      toast.success(
        editingProject ? "Project updated" : "Project created",
        `${project.name} is saved.`,
      );
      closeForm();

      if (project.repoPath && project.status === "active") {
        autoSyncMutation.mutate(project.id);
      }
    },
  });

  const archiveMutation = useMutation({
    mutationFn: archiveProject,
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projectStats"] });
      queryClient.invalidateQueries({ queryKey: ["categoryDistribution"] });
      toast.success("Project archived", `${project.name} is hidden from active workflows.`);
    },
    onError: (error) => {
      toast.error("Archive failed", toMessage(error));
    },
  });

  const restoreProjectMutation = useMutation({
    mutationFn: (project: Project) => updateProject(project.id, { status: "active" }),
    onSuccess: async (project) => {
      await invalidateProjectViews(queryClient);
      toast.success("Project restored", `${project.name} is visible in active workflows again.`);
    },
    onError: (error) => {
      toast.error("Restore failed", toMessage(error));
    },
  });

  const createWorkspaceMutation = useMutation({
    mutationFn: () =>
      createWorkspace({
        name: workspaceName,
        rootPath: workspaceRootPath,
      }),
    onSuccess: async (workspace) => {
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setSelectedWorkspaceId(workspace.id);
      setIsWorkspaceFormOpen(false);
      toast.success("Workspace created", `${workspace.name} is ready to scan.`);
      scanWorkspaceMutation.mutate(workspace.id);
    },
    onError: (error) => {
      toast.error("Workspace failed", toMessage(error));
    },
  });

  const scanWorkspaceMutation = useMutation({
    mutationFn: scanWorkspace,
    onSuccess: async (discoveries) => {
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setWorkspaceDiscoveries(discoveries);
      setSelectedRepoPaths(
        new Set(
          discoveries
            .filter((repo) => repo.status === "new" || repo.status === "archived")
            .map((repo) => repo.repoPath),
        ),
      );
      toast.success(
        "Workspace scanned",
        `${discoveries.filter((repo) => repo.status === "new").length} new repos and ${
          discoveries.filter((repo) => repo.status === "archived").length
        } archived matches need review.`,
      );
    },
    onError: (error) => {
      toast.error("Scan failed", toMessage(error));
    },
  });

  const importWorkspaceMutation = useMutation({
    mutationFn: () => {
      if (!selectedWorkspaceId) {
        throw new Error("Choose a workspace first.");
      }
      const repositories = workspaceDiscoveries
        .filter(
          (repo) =>
            selectedRepoPaths.has(repo.repoPath) &&
            (repo.status === "new" || repo.status === "archived"),
        )
        .map((repo) => ({
          repoPath: repo.repoPath,
          name: repo.suggestedName,
          projectType: "Workspace",
        }));

      return importWorkspaceRepositories({
        workspaceId: selectedWorkspaceId,
        repositories,
      });
    },
    onSuccess: async (importedProjects) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      await invalidateProjectViews(queryClient);
      toast.success("Repositories imported", `${importedProjects.length} projects are now tracked or restored.`);
      if (selectedWorkspaceId) {
        scanWorkspaceMutation.mutate(selectedWorkspaceId);
      }
    },
    onError: (error) => {
      toast.error("Import failed", toMessage(error));
    },
  });

  const ignoreWorkspaceMutation = useMutation({
    mutationFn: (repoPath: string) => {
      if (!selectedWorkspaceId) {
        throw new Error("Choose a workspace first.");
      }
      return ignoreWorkspaceRepository({ workspaceId: selectedWorkspaceId, repoPath });
    },
    onSuccess: () => {
      toast.success("Repository ignored", "It will stay hidden from future workspace scans.");
      if (selectedWorkspaceId) scanWorkspaceMutation.mutate(selectedWorkspaceId);
    },
    onError: (error) => toast.error("Ignore failed", toMessage(error)),
  });

  const unignoreWorkspaceMutation = useMutation({
    mutationFn: (repoPath: string) => {
      if (!selectedWorkspaceId) {
        throw new Error("Choose a workspace first.");
      }
      return unignoreWorkspaceRepository({ workspaceId: selectedWorkspaceId, repoPath });
    },
    onSuccess: () => {
      toast.success("Repository restored", "It will appear in workspace review again.");
      if (selectedWorkspaceId) scanWorkspaceMutation.mutate(selectedWorkspaceId);
    },
    onError: (error) => toast.error("Restore failed", toMessage(error)),
  });

  const archiveWorkspaceMutation = useMutation({
    mutationFn: archiveWorkspace,
    onSuccess: async (workspace) => {
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast.success("Workspace archived", `${workspace.name} will no longer scan.`);
      if (selectedWorkspaceId === workspace.id) {
        setSelectedWorkspaceId(null);
        setWorkspaceDiscoveries([]);
      }
    },
    onError: (error) => toast.error("Archive workspace failed", toMessage(error)),
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
      const matchesSource =
        sourceFilter === "all" ||
        (sourceFilter === "workspace" && Boolean(project.workspaceId)) ||
        (sourceFilter === "personal" && !project.workspaceId);
      const matchesSearch =
        !needle ||
        project.name.toLowerCase().includes(needle) ||
        project.description?.toLowerCase().includes(needle) ||
        project.repoPath?.toLowerCase().includes(needle) ||
        project.githubUrl?.toLowerCase().includes(needle);

      return matchesStatus && matchesCategory && matchesSource && matchesSearch;
    });
  }, [projects, search, statusFilter, categoryFilter, sourceFilter]);

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
  const workspaces = workspacesQuery.data ?? [];
  const visibleWorkspaces = workspaces.filter(
    (workspace) => workspaceStatusFilter === "all" || workspace.status === workspaceStatusFilter,
  );
  const selectedWorkspace =
    visibleWorkspaces.find((workspace) => workspace.id === selectedWorkspaceId) ??
    visibleWorkspaces[0] ??
    null;
  const workspaceProjects = selectedWorkspace
    ? projects.filter((project) => project.workspaceId === selectedWorkspace.id)
    : [];
  const workspaceActiveProjects = workspaceProjects.filter((project) => project.status === "active");
  const workspaceArchivedProjects = workspaceProjects.filter((project) => project.status === "archived");
  const shouldOpenWorkspaceScan = Boolean((location.state as ProjectsLocationState)?.openWorkspaceScan);

  useEffect(() => {
    if (!shouldOpenWorkspaceScan || workspacesQuery.isLoading) {
      return;
    }

    setViewMode("workspaces");
    setWorkspaceStatusFilter("active");
    window.setTimeout(() => {
      workspacePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);

    if (selectedWorkspace?.status === "active") {
      scanWorkspaceMutation.mutate(selectedWorkspace.id);
    } else if (workspaces.length === 0) {
      toast.info("Add a workspace", "Create a workspace root to discover untracked repositories.");
      setIsWorkspaceFormOpen(true);
    } else {
      toast.info("Choose an active workspace", "Archived workspaces cannot be scanned.");
    }

    navigate(location.pathname, { replace: true, state: null });
  }, [
    location.pathname,
    navigate,
    selectedWorkspace?.id,
    selectedWorkspace?.status,
    shouldOpenWorkspaceScan,
    toast,
    workspaces.length,
    workspacesQuery.isLoading,
  ]);

  function openCreateForm() {
    setEditingProject(null);
    setRepoValidation(null);
    form.reset(emptyValues);
    setIsFormOpen(true);
  }

  function openWorkspaceForm() {
    setWorkspaceName("");
    setWorkspaceRootPath("");
    setIsWorkspaceFormOpen(true);
  }

  async function chooseWorkspaceRoot() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Choose a workspace root folder",
      });

      if (typeof selected === "string") {
        setWorkspaceRootPath(selected);
        if (!workspaceName) {
          setWorkspaceName(selected.split(/[\\/]/).filter(Boolean).pop() ?? "Workspace");
        }
      }
    } catch (error) {
      toast.error("Folder picker failed", toMessage(error));
    }
  }

  function toggleDiscovery(repoPath: string) {
    setSelectedRepoPaths((current) => {
      const next = new Set(current);
      if (next.has(repoPath)) {
        next.delete(repoPath);
      } else {
        next.add(repoPath);
      }
      return next;
    });
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
      toast[isValidRepo ? "success" : "error"](
        isValidRepo ? "Repository validated" : "Repository invalid",
        isValidRepo ? "This folder is ready to sync." : "That path does not contain Git metadata.",
      );
    } catch (error) {
      setRepoValidation({ tone: "error", message: toMessage(error) });
      toast.error("Validation failed", toMessage(error));
    }
  }

  function handlePageChange(page: number) {
    setCurrentPage(page);
  }

  function showArchivedProjects() {
    setSearch("");
    setStatusFilter("archived");
    setCategoryFilter("all");
    setCurrentPage(1);
  }

  function showAllRepositories() {
    setRecentCommitLimit((current) => (current === 5 ? 50 : 5));
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
            <Button variant="secondary" onClick={openWorkspaceForm}>
              <Layers className="h-4 w-4" />
              Add Workspace
            </Button>
          </div>
        </div>
      </Panel>

      <div
        ref={projectFormRef}
        className={`transition-all duration-300 ease-out overflow-hidden ${
          isFormOpen
            ? "max-h-[1200px] opacity-100 translate-y-0"
            : "max-h-0 opacity-0 -translate-y-4 pointer-events-none"
        }`}
      >
        <Panel className="relative overflow-hidden border-blue-300/20 bg-blue-500/5">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-cyan-500/10 opacity-50" />
          <div className="relative">
            <div className="flex items-start justify-between gap-3 border-b border-white/8 px-5 py-4">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-300/15 bg-blue-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-200">
                  <FolderKanban className="h-3.5 w-3.5" />
                  {editingProject ? "Edit Project" : "New Project"}
                </div>
                <h2 className="text-lg font-semibold text-white">
                  {editingProject ? "Modify Project Details" : "Register a New Source"}
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  {editingProject
                    ? "Update project settings and repository configuration."
                    : "Use the native picker or paste a local repository path. Git-backed projects auto-sync on save."}
                </p>
              </div>
              <Button variant="ghost" onClick={closeForm} aria-label="Close form" className="shrink-0">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form
              className="space-y-4 p-5"
              onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
            >
              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>

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

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="GitHub Repository URL"
                  placeholder="https://github.com/company/repo"
                  error={form.formState.errors.githubUrl?.message}
                  {...form.register("githubUrl")}
                />

                <label className="grid gap-2 text-xs font-semibold text-slate-300">
                  Project Type
                  <SelectField
                    control={form.control}
                    name="projectType"
                    options={[
                      { value: "Backend", label: "Backend", icon: FolderKanban },
                      { value: "Frontend", label: "Frontend", icon: FolderKanban },
                      { value: "Marketing", label: "Marketing", icon: FolderKanban },
                      { value: "Tools", label: "Tools", icon: FolderKanban },
                      { value: "Service", label: "Service", icon: FolderKanban },
                      { value: "Company", label: "Company", icon: FolderKanban },
                      { value: "Client", label: "Client", icon: FolderKanban },
                      { value: "Internal", label: "Internal", icon: FolderKanban },
                      { value: "Personal", label: "Personal", icon: FolderKanban },
                      { value: "Manual Only", label: "Manual Only", icon: FolderKanban },
                    ]}
                    size="sm"
                  />
                </label>
              </div>

              {saveMutation.isError ? (
                <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
                  {toMessage(saveMutation.error)}
                </div>
              ) : null}

              <div className="flex gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={closeForm} className="flex-1">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="flex-1 py-2.5"
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending
                    ? "Saving..."
                    : editingProject
                      ? "Save Changes"
                      : "Create Project"}
                </Button>
              </div>
            </form>
          </div>
        </Panel>
      </div>

      <Panel className="flex flex-wrap items-center justify-between gap-3 p-2">
        <div className="flex rounded-2xl border border-white/8 bg-slate-950/55 p-1">
          <button
            type="button"
            onClick={() => setViewMode("workspaces")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              viewMode === "workspaces"
                ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            Workspaces
          </button>
          <button
            type="button"
            onClick={() => setViewMode("projects")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              viewMode === "projects"
                ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            Projects
          </button>
        </div>
        <p className="text-xs text-slate-500">
          {viewMode === "workspaces"
            ? "Pick a workspace to scan, review, import, restore, and sync its repositories."
            : "Browse individual projects across personal and workspace sources."}
        </p>
      </Panel>

      {viewMode === "workspaces" ? (
        <div ref={workspacePanelRef} className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Panel className="p-0">
            <div className="border-b border-white/8 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-white">Workspaces</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Select a root folder, then review discovered Git repositories before import.
                  </p>
                </div>
                <Button variant="ghost" onClick={openWorkspaceForm}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-3 p-4">
              {isWorkspaceFormOpen ? (
                <div className="space-y-3 rounded-xl border border-blue-300/15 bg-blue-500/5 p-3">
                  <TextField
                    label="Workspace Name"
                    placeholder="Documents Projects"
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.currentTarget.value)}
                  />
                  <TextField
                    label="Root Folder"
                    placeholder="C:\\Users\\Sparc\\Documents\\projects"
                    value={workspaceRootPath}
                    onChange={(event) => setWorkspaceRootPath(event.currentTarget.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="secondary" onClick={chooseWorkspaceRoot}>
                      <FolderOpen className="h-4 w-4" />
                      Choose
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => createWorkspaceMutation.mutate()}
                      disabled={createWorkspaceMutation.isPending}
                    >
                      {createWorkspaceMutation.isPending ? "Saving..." : "Create"}
                    </Button>
                  </div>
                </div>
              ) : null}

              <FilterSelect
                value={workspaceStatusFilter}
                onChange={(v) => {
                  setWorkspaceStatusFilter(v as typeof workspaceStatusFilter);
                  setSelectedWorkspaceId(null);
                  setWorkspaceDiscoveries([]);
                  setSelectedRepoPaths(new Set());
                }}
                options={[
                  { value: "active", label: "Active Workspaces" },
                  { value: "archived", label: "Archived Workspaces" },
                  { value: "all", label: "All Workspaces" },
                ]}
              />

              {workspacesQuery.isLoading ? (
                <div className="flex h-24 items-center justify-center">
                  <RefreshCw className="h-5 w-5 animate-spin text-slate-500" />
                </div>
              ) : visibleWorkspaces.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.025] p-4 text-xs leading-5 text-slate-500">
                  {workspaces.length === 0
                    ? "Add a workspace to review and import repositories from a multi-repo root folder."
                    : "No workspaces match this status filter."}
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleWorkspaces.map((workspace) => {
                    const linkedProjects = projects.filter((project) => project.workspaceId === workspace.id);
                    const linkedActive = linkedProjects.filter((project) => project.status === "active").length;
                    const linkedArchived = linkedProjects.filter((project) => project.status === "archived").length;

                    return (
                      <button
                        key={workspace.id}
                        type="button"
                        onClick={() => {
                          setSelectedWorkspaceId(workspace.id);
                          setWorkspaceDiscoveries([]);
                          setSelectedRepoPaths(new Set());
                        }}
                        className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                          selectedWorkspace?.id === workspace.id
                            ? "border-blue-300/30 bg-blue-500/10"
                            : "border-white/8 bg-slate-950/35 hover:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-100">
                            {workspace.name}
                          </span>
                          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-400">
                            {workspace.status}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[11px] text-slate-500">
                          {workspace.rootPath}
                        </p>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                          <div className="rounded-lg border border-white/8 bg-slate-950/45 px-2 py-2">
                            <p className="font-semibold text-white">{linkedProjects.length}</p>
                            <p className="text-slate-500">Repos</p>
                          </div>
                          <div className="rounded-lg border border-emerald-300/15 bg-emerald-500/5 px-2 py-2">
                            <p className="font-semibold text-emerald-200">{linkedActive}</p>
                            <p className="text-slate-500">Active</p>
                          </div>
                          <div className="rounded-lg border border-orange-300/15 bg-orange-500/5 px-2 py-2">
                            <p className="font-semibold text-orange-200">{linkedArchived}</p>
                            <p className="text-slate-500">Archived</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Panel>

          <Panel className="p-0">
            {selectedWorkspace ? (
              <>
                <div className="border-b border-white/8 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="mb-2 inline-flex rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">
                        Workspace Registry
                      </div>
                      <h2 className="text-xl font-semibold text-white">{selectedWorkspace.name}</h2>
                      <p className="mt-1 max-w-3xl break-all text-xs leading-5 text-slate-400">
                        {selectedWorkspace.rootPath}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => scanWorkspaceMutation.mutate(selectedWorkspace.id)}
                        disabled={scanWorkspaceMutation.isPending || selectedWorkspace.status === "archived"}
                      >
                        <RefreshCw className={`h-4 w-4 ${scanWorkspaceMutation.isPending ? "animate-spin" : ""}`} />
                        Scan Workspace
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => workspaceSyncMutation.mutate(selectedWorkspace.id)}
                        disabled={
                          workspaceSyncMutation.isPending ||
                          workspaceActiveProjects.length === 0 ||
                          selectedWorkspace.status === "archived"
                        }
                      >
                        <GitBranch className="h-4 w-4" />
                        Sync Active Repos
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  {selectedWorkspace.status === "archived" ? (
                    <div className="rounded-xl border border-orange-300/20 bg-orange-500/10 p-3 text-xs leading-5 text-orange-100">
                      This workspace is archived. Its imported projects keep their own status, but workspace scan and sync are paused.
                    </div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-3">
                    <WorkspaceMetric label="All Repositories" value={workspaceProjects.length} />
                    <WorkspaceMetric label="Active" value={workspaceActiveProjects.length} tone="success" />
                    <WorkspaceMetric label="Archived" value={workspaceArchivedProjects.length} tone="warning" />
                  </div>

                  <section className="rounded-2xl border border-white/8 bg-slate-950/35">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
                      <div>
                        <h3 className="text-sm font-semibold text-white">Repositories In This Workspace</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Active and archived projects are shown here so imported repos never disappear silently.
                        </p>
                      </div>
                    </div>
                    <div className="divide-y divide-white/8">
                      {workspaceProjects.length === 0 ? (
                        <div className="p-4 text-xs leading-5 text-slate-500">
                          No imported repositories yet. Scan the workspace, select repos, then import them.
                        </div>
                      ) : (
                        workspaceProjects
                          .slice()
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((project) => (
                            <div
                              key={project.id}
                              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-slate-100">{project.name}</p>
                                  <span
                                    className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                                      project.status === "active"
                                        ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-200"
                                        : "border-orange-300/20 bg-orange-500/10 text-orange-200"
                                    }`}
                                  >
                                    {project.status}
                                  </span>
                                  {project.workspaceRelativePath ? (
                                    <span className="rounded-md border border-blue-300/15 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-200">
                                      {project.workspaceRelativePath}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 truncate text-xs text-slate-500">{project.repoPath}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="ghost" onClick={() => openEditForm(project)}>
                                  Edit
                                </Button>
                                {project.status === "archived" ? (
                                  <Button
                                    variant="secondary"
                                    onClick={() => restoreProjectMutation.mutate(project)}
                                    disabled={restoreProjectMutation.isPending}
                                  >
                                    Restore
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    onClick={() => archiveMutation.mutate(project.id)}
                                    disabled={archiveMutation.isPending}
                                  >
                                    <Archive className="h-4 w-4" />
                                    Archive
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/8 bg-slate-950/35 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-white">Scan Review</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          New repos can be imported. Archived matches can be selected and restored.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="primary"
                          onClick={() => importWorkspaceMutation.mutate()}
                          disabled={
                            importWorkspaceMutation.isPending ||
                            selectedWorkspace.status === "archived" ||
                            workspaceDiscoveries.filter(
                              (repo) =>
                                selectedRepoPaths.has(repo.repoPath) &&
                                (repo.status === "new" || repo.status === "archived"),
                            ).length === 0
                          }
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Import / Restore Selected
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => archiveWorkspaceMutation.mutate(selectedWorkspace.id)}
                          disabled={archiveWorkspaceMutation.isPending}
                        >
                          <Archive className="h-4 w-4" />
                          Archive Workspace
                        </Button>
                      </div>
                    </div>

                    {workspaceDiscoveries.length > 0 ? (
                      <WorkspaceDiscoveryList
                        discoveries={workspaceDiscoveries}
                        selectedRepoPaths={selectedRepoPaths}
                        onToggle={toggleDiscovery}
                        onIgnore={(repoPath) => ignoreWorkspaceMutation.mutate(repoPath)}
                        onUnignore={(repoPath) => unignoreWorkspaceMutation.mutate(repoPath)}
                      />
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.025] p-4 text-xs leading-5 text-slate-500">
                        Scan this workspace to review root, child, and grandchild Git repositories.
                      </div>
                    )}
                  </section>
                </div>
              </>
            ) : (
              <div className="flex min-h-[460px] items-center justify-center p-6 text-center">
                <div>
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-500/15 text-blue-200">
                    <Layers className="h-5 w-5" />
                  </div>
                  <h2 className="text-base font-semibold text-white">No workspace selected</h2>
                  <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-400">
                    Add or select a workspace to manage repositories from a multi-repo root folder.
                  </p>
                  <Button variant="primary" className="mt-4" onClick={openWorkspaceForm}>
                    <Plus className="h-4 w-4" />
                    Add Workspace
                  </Button>
                </div>
              </div>
            )}
          </Panel>
        </div>
      ) : (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Panel className="flex flex-wrap items-center justify-between gap-3 p-3">
            <label className="flex min-w-0 flex-1 basis-[240px] items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-xs text-slate-400 shadow-inner shadow-black/20">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.currentTarget.value);
                  setCurrentPage(1);
                }}
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
                value={sourceFilter}
                onChange={(v) => {
                  setSourceFilter(v as typeof sourceFilter);
                  setCurrentPage(1);
                }}
                options={[
                  { value: "all", label: "All Sources" },
                  { value: "workspace", label: "Workspace" },
                  { value: "personal", label: "Personal" },
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

              {(search || statusFilter !== "active" || sourceFilter !== "all" || categoryFilter !== "all") && (
                <button
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("active");
                    setSourceFilter("all");
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
                    workspaceName={workspaces.find((workspace) => workspace.id === project.workspaceId)?.name}
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
                <button
                  type="button"
                  onClick={showAllRepositories}
                  className="text-xs font-medium text-blue-300 transition-colors hover:text-blue-200"
                >
                  {recentCommitLimit === 5
                    ? "View all repositories"
                    : "Show fewer repositories"}
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
          <Panel className="p-0">
            <div className="border-b border-white/8 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-white">Workspaces</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Scan a root folder two levels deep and import child repositories.
                  </p>
                </div>
                <Button variant="ghost" onClick={openWorkspaceForm}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-3 p-4">
              {isWorkspaceFormOpen ? (
                <div className="space-y-3 rounded-xl border border-blue-300/15 bg-blue-500/5 p-3">
                  <TextField
                    label="Workspace Name"
                    placeholder="Documents Projects"
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.currentTarget.value)}
                  />
                  <TextField
                    label="Root Folder"
                    placeholder="C:\\Users\\Sparc\\Documents\\projects"
                    value={workspaceRootPath}
                    onChange={(event) => setWorkspaceRootPath(event.currentTarget.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="secondary" onClick={chooseWorkspaceRoot}>
                      <FolderOpen className="h-4 w-4" />
                      Choose
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => createWorkspaceMutation.mutate()}
                      disabled={createWorkspaceMutation.isPending}
                    >
                      {createWorkspaceMutation.isPending ? "Saving..." : "Create"}
                    </Button>
                  </div>
                </div>
              ) : null}

              <FilterSelect
                value={workspaceStatusFilter}
                onChange={(v) => {
                  setWorkspaceStatusFilter(v as typeof workspaceStatusFilter);
                  setSelectedWorkspaceId(null);
                  setWorkspaceDiscoveries([]);
                  setSelectedRepoPaths(new Set());
                }}
                options={[
                  { value: "active", label: "Active Workspaces" },
                  { value: "archived", label: "Archived Workspaces" },
                  { value: "all", label: "All Workspaces" },
                ]}
              />

              {workspacesQuery.isLoading ? (
                <div className="flex h-24 items-center justify-center">
                  <RefreshCw className="h-5 w-5 animate-spin text-slate-500" />
                </div>
              ) : visibleWorkspaces.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.025] p-4 text-xs leading-5 text-slate-500">
                  {workspaces.length === 0
                    ? "Add a workspace to review and import repositories from a multi-repo root folder."
                    : "No workspaces match this status filter."}
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleWorkspaces.map((workspace) => (
                    <button
                      key={workspace.id}
                      type="button"
                      onClick={() => {
                        setSelectedWorkspaceId(workspace.id);
                        scanWorkspaceMutation.mutate(workspace.id);
                      }}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                        selectedWorkspace?.id === workspace.id
                          ? "border-blue-300/30 bg-blue-500/10"
                          : "border-white/8 bg-slate-950/35 hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-100">
                          {workspace.name}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {workspace.status} · {projects.filter((project) => project.workspaceId === workspace.id).length} repos
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-slate-500">
                        {workspace.rootPath}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {selectedWorkspace ? (
                <div className="space-y-2 rounded-xl border border-white/8 bg-slate-950/35 p-3">
                  {selectedWorkspace.status === "archived" ? (
                    <div className="rounded-xl border border-orange-300/20 bg-orange-500/10 p-3 text-xs leading-5 text-orange-100">
                      This workspace is archived. Its imported projects remain available according to their own project status, but scanning and workspace sync are paused.
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {selectedWorkspace.name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {workspaceActiveProjects.length} active of {workspaceProjects.length} imported repos
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => scanWorkspaceMutation.mutate(selectedWorkspace.id)}
                        disabled={scanWorkspaceMutation.isPending || selectedWorkspace.status === "archived"}
                      >
                        <RefreshCw className={`h-4 w-4 ${scanWorkspaceMutation.isPending ? "animate-spin" : ""}`} />
                        Scan
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => workspaceSyncMutation.mutate(selectedWorkspace.id)}
                        disabled={
                          workspaceSyncMutation.isPending ||
                          workspaceActiveProjects.length === 0 ||
                          selectedWorkspace.status === "archived"
                        }
                      >
                        <GitBranch className="h-4 w-4" />
                        Sync
                      </Button>
                    </div>
                  </div>

                  {workspaceDiscoveries.length > 0 ? (
                    <WorkspaceDiscoveryList
                      discoveries={workspaceDiscoveries}
                      selectedRepoPaths={selectedRepoPaths}
                      onToggle={toggleDiscovery}
                      onIgnore={(repoPath) => ignoreWorkspaceMutation.mutate(repoPath)}
                      onUnignore={(repoPath) => unignoreWorkspaceMutation.mutate(repoPath)}
                    />
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.025] p-3 text-xs leading-5 text-slate-500">
                      Scan this workspace to review repositories.
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="primary"
                      onClick={() => importWorkspaceMutation.mutate()}
                      disabled={
                        importWorkspaceMutation.isPending ||
                        selectedWorkspace.status === "archived" ||
                        workspaceDiscoveries.filter(
                          (repo) =>
                            selectedRepoPaths.has(repo.repoPath) &&
                            (repo.status === "new" || repo.status === "archived"),
                        ).length === 0
                      }
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Import / Restore
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => archiveWorkspaceMutation.mutate(selectedWorkspace.id)}
                      disabled={archiveWorkspaceMutation.isPending}
                    >
                      <Archive className="h-4 w-4" />
                      Archive
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </Panel>

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
            <button
              type="button"
              onClick={showArchivedProjects}
              className="mt-3 flex w-full items-center justify-between rounded-xl border border-white/8 bg-slate-950/35 px-3 py-2 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-300"
            >
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

          <Panel className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100">Quick Actions</h2>
            </div>
            <button
              type="button"
              onClick={openCreateForm}
              className="flex w-full items-center gap-3 rounded-xl border border-blue-300/15 bg-blue-500/5 px-4 py-3 text-left transition-all duration-200 hover:border-blue-300/30 hover:bg-blue-500/10"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-300/20 bg-blue-500/10 text-blue-200">
                <Plus className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">Add Project</p>
                <p className="text-xs text-slate-500">Register a new repository</p>
              </div>
            </button>
          </Panel>
        </div>
      </div>
      )}
    </div>
  );
}

function WorkspaceMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass = {
    default: "border-blue-300/15 bg-blue-500/10 text-blue-100",
    success: "border-emerald-300/15 bg-emerald-500/10 text-emerald-100",
    warning: "border-orange-300/15 bg-orange-500/10 text-orange-100",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
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
    <Select
      value={value}
      onChange={onChange}
      options={options.map((opt) => ({
        value: opt.value,
        label: opt.label,
        icon: LayoutGrid,
      }))}
      size="sm"
    />
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

function WorkspaceDiscoveryList({
  discoveries,
  selectedRepoPaths,
  onToggle,
  onIgnore,
  onUnignore,
}: {
  discoveries: WorkspaceRepoDiscovery[];
  selectedRepoPaths: Set<string>;
  onToggle: (repoPath: string) => void;
  onIgnore: (repoPath: string) => void;
  onUnignore: (repoPath: string) => void;
}) {
  return (
    <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
      {discoveries.map((repo) => {
        const isImportable = repo.status === "new" || repo.status === "archived";
        const isSelected = selectedRepoPaths.has(repo.repoPath);

        return (
          <div
            key={repo.repoPath}
            className="rounded-xl border border-white/8 bg-slate-950/45 p-3"
          >
            <div className="flex items-start gap-3">
              <button
                type="button"
                disabled={!isImportable}
                onClick={() => onToggle(repo.repoPath)}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                  isSelected
                    ? "border-blue-300/60 bg-blue-500 text-white"
                    : "border-white/15 bg-slate-950"
                } disabled:opacity-40`}
                aria-label={`Select ${repo.suggestedName}`}
              >
                {isSelected ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-slate-100">
                    {repo.suggestedName}
                  </p>
                  <span
                    className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                      repo.status === "new"
                        ? "border-blue-300/20 bg-blue-500/10 text-blue-200"
                        : repo.status === "archived"
                          ? "border-orange-300/20 bg-orange-500/10 text-orange-200"
                        : repo.status === "imported"
                          ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-200"
                          : "border-slate-300/15 bg-slate-500/10 text-slate-300"
                    }`}
                  >
                    {repo.status}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] text-slate-500">
                  {repo.relativePath}
                </p>
                {repo.projectName ? (
                  <p className={`mt-1 text-[11px] ${repo.status === "archived" ? "text-orange-200" : "text-emerald-300/80"}`}>
                    {repo.status === "archived"
                      ? `Already exists as archived project "${repo.projectName}". Select it and import to reactivate it.`
                      : `Imported as ${repo.projectName}`}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-2 flex justify-end">
              {repo.status === "ignored" ? (
                <button
                  type="button"
                  onClick={() => onUnignore(repo.repoPath)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-blue-200 hover:bg-blue-500/10"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Restore
                </button>
              ) : repo.status === "new" ? (
                <button
                  type="button"
                  onClick={() => onIgnore(repo.repoPath)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-400 hover:bg-white/8 hover:text-slate-200"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  Ignore
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
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

async function invalidateProjectViews(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: ["projects"] });
  await queryClient.invalidateQueries({ queryKey: ["projectStats"] });
  await queryClient.invalidateQueries({ queryKey: ["categoryDistribution"] });
  await queryClient.invalidateQueries({ queryKey: ["recentCommits"] });
  await queryClient.invalidateQueries({ queryKey: ["topContributors"] });
  await queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  await queryClient.invalidateQueries({ queryKey: ["dashboard-activity-hours"] });
  await queryClient.invalidateQueries({ queryKey: ["dashboard-breakdown"] });
  await queryClient.invalidateQueries({ queryKey: ["activity"] });
  await queryClient.invalidateQueries({ queryKey: ["reports"] });
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
