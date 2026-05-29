import { open } from "@tauri-apps/plugin-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { FolderKanban, FolderOpen, GitBranch, X } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { listGitHubAccounts } from "../../lib/api/github";
import { validateRepoPath } from "../../lib/api/projects";
import type { CreateProjectInput, Project } from "../../types/project";
import { Button } from "./Button";
import { Panel } from "./Panel";
import { SelectField } from "./SelectField";
import { useToast } from "./ToastProvider";

const projectSchema = z.object({
  name: z.string().trim().min(1, "Repository name is required"),
  description: z.string().trim().optional(),
  repoPath: z.string().trim().optional(),
  githubUrl: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^https?:\/\/.+/.test(value), {
      message: "Use a valid http or https URL",
    }),
  githubAccountId: z.string().trim().optional(),
  projectType: z.string().trim().optional(),
  classification: z.enum(["work", "personal", "unclassified"]),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

const emptyValues: ProjectFormValues = {
  name: "",
  description: "",
  repoPath: "",
  githubUrl: "",
  githubAccountId: "",
  projectType: "Backend",
  classification: "unclassified",
};

export function ProjectFormPanel({
  project,
  mode,
  isSaving,
  error,
  onSubmit,
  onCancel,
}: {
  project?: Project;
  mode: "create" | "edit";
  isSaving: boolean;
  error?: unknown;
  onSubmit: (input: CreateProjectInput) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [repoValidation, setRepoValidation] = useState<ValidationState | null>(null);
  const isEditing = mode === "edit";
  const githubAccountsQuery = useQuery({
    queryKey: ["githubAccounts"],
    queryFn: listGitHubAccounts,
  });
  const githubAccountOptions = [
    { value: "", label: "No GitHub account", icon: GitBranch },
    ...(githubAccountsQuery.data?.accounts ?? [])
      .filter((account) => account.status === "connected")
      .map((account) => ({
        value: account.id,
        label: account.username ? `${account.username} (${account.authMethod === "oauth_device" ? "OAuth" : "PAT"})` : "Connected account",
        icon: GitBranch,
      })),
  ];

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: projectToValues(project),
  });

  useEffect(() => {
    form.reset(projectToValues(project));
    setRepoValidation(null);
  }, [form, project]);

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
    } catch (chooseError) {
      setRepoValidation({ tone: "error", message: toMessage(chooseError) });
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
    } catch (validationError) {
      setRepoValidation({ tone: "error", message: toMessage(validationError) });
      toast.error("Validation failed", toMessage(validationError));
    }
  }

  async function submit(values: ProjectFormValues) {
    const input = {
      name: values.name,
      description: normalizeOptional(values.description),
      repoPath: normalizeOptional(values.repoPath),
      githubUrl: normalizeOptional(values.githubUrl),
      githubAccountId: normalizeOptional(values.githubAccountId),
      projectType: normalizeOptional(values.projectType),
      classification: values.classification,
    };

    try {
      if (input.repoPath) {
        const isValidRepo = await validateRepoPath(input.repoPath);
        if (!isValidRepo) {
          setRepoValidation({
            tone: "error",
            message: "That path does not look like a Git repository.",
          });
          return;
        }
      }
    } catch (validationError) {
      setRepoValidation({ tone: "error", message: toMessage(validationError) });
      return;
    }

    onSubmit(input);
  }

  return (
    <Panel className="relative overflow-hidden border-blue-300/20 bg-blue-500/5">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-cyan-500/10 opacity-50" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3 border-b border-white/8 px-5 py-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-300/15 bg-blue-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-200">
              <FolderKanban className="h-3.5 w-3.5" />
              {isEditing ? "Edit Repository" : "Add Repository"}
            </div>
            <h2 className="text-lg font-semibold text-white">
              {isEditing ? "Modify Repository Details" : "Register a New Source"}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {isEditing
                ? "Update repository settings and source configuration."
                : "Use the native picker or paste a local repository path. Git-backed repositories auto-sync on save."}
            </p>
          </div>
          <Button variant="ghost" onClick={onCancel} aria-label="Close form" className="shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form className="space-y-4 p-5" onSubmit={form.handleSubmit(submit)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Repository Name"
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
              GitHub Account
              <SelectField
                control={form.control}
                name="githubAccountId"
                options={githubAccountOptions}
                size="sm"
              />
            </label>

            <label className="grid gap-2 text-xs font-semibold text-slate-300">
              Repository Type
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
            <label className="grid gap-2 text-xs font-semibold text-slate-300">
              Classification
              <SelectField
                control={form.control}
                name="classification"
                options={[
                  { value: "unclassified", label: "Unclassified", icon: FolderKanban },
                  { value: "work", label: "Work", icon: FolderKanban },
                  { value: "personal", label: "Personal", icon: FolderKanban },
                ]}
                size="sm"
              />
            </label>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
              {toMessage(error)}
            </div>
          ) : null}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="flex-1 py-2.5" disabled={isSaving}>
              {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Add Repository"}
            </Button>
          </div>
        </form>
      </div>
    </Panel>
  );
}

function projectToValues(project?: Project): ProjectFormValues {
  if (!project) return emptyValues;

  return {
    name: project.name,
    description: project.description ?? "",
    repoPath: project.repoPath ?? "",
    githubUrl: project.githubUrl ?? "",
    githubAccountId: project.githubAccountId ?? "",
    projectType: project.projectType ?? "Backend",
    classification: project.classification ?? "unclassified",
  };
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

  return <div className={`rounded-xl border px-3 py-2 text-xs ${classes}`}>{state.message}</div>;
}

function normalizeOptional(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
