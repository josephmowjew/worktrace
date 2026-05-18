import { callCommand } from "./client";
import type {
  CreateProjectInput,
  Project,
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
