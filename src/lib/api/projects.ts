import { callCommand } from "./client";
import type {
  CategoryDistribution,
  CreateProjectInput,
  Project,
  ProjectStats,
  RecentCommit,
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

