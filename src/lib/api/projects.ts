import { callCommand } from "./client";
import type {
  CategoryDistribution,
  CreateProjectInput,
  GitBranch,
  GitRef,
  GitWorktree,
  Project,
  ProjectGitFocus,
  ProjectStats,
  RecentCommit,
  SaveProjectGitFocusInput,
  TopContributor,
  UpdateProjectInput,
} from "../../types/project";

export function listProjects() {
  return callCommand<Project[]>("list_projects");
}

export function createProject(input: CreateProjectInput) {
  return callCommand<Project>("create_project", { input });
}

export function updateProject(id: string, input: UpdateProjectInput) {
  return callCommand<Project>("update_project", { id, input });
}

export function archiveProject(id: string) {
  return callCommand<Project>("archive_project", { id });
}

export function validateRepoPath(path: string) {
  return callCommand<boolean>("validate_repo_path", { path });
}

export function listGitBranches(projectId: string) {
  return callCommand<GitBranch[]>("list_git_branches", { projectId });
}

export function listGitRefs(projectId: string) {
  return callCommand<GitRef[]>("list_git_refs", { projectId });
}

export function listGitWorktrees(projectId: string) {
  return callCommand<GitWorktree[]>("list_git_worktrees", { projectId });
}

export function getProjectGitFocus(projectId: string) {
  return callCommand<ProjectGitFocus>("get_project_git_focus", { projectId });
}

export function saveProjectGitFocus(input: SaveProjectGitFocusInput) {
  return callCommand<ProjectGitFocus>("save_project_git_focus", { input });
}

export function getProjectStats() {
  return callCommand<ProjectStats[]>("get_project_stats");
}

export function getCategoryDistribution() {
  return callCommand<CategoryDistribution[]>("get_category_distribution");
}

export function getRecentCommits(limit?: number) {
  return callCommand<RecentCommit[]>("get_recent_commits", { limit });
}

export function getTopContributors(limit?: number) {
  return callCommand<TopContributor[]>("get_top_contributors", { limit });
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const projects = await listProjects();
  return projects.find((p) => p.id === id);
}
