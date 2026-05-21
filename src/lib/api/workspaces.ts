import { callCommand } from "./client";
import type { Project } from "../../types/project";
import type {
  CreateWorkspaceInput,
  ImportWorkspaceRepositoriesInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceRepoDiscovery,
  WorkspaceRepositoryActionInput,
} from "../../types/workspace";

export function listWorkspaces() {
  return callCommand<Workspace[]>("list_workspaces");
}

export function createWorkspace(input: CreateWorkspaceInput) {
  return callCommand<Workspace>("create_workspace", { input });
}

export function updateWorkspace(id: string, input: UpdateWorkspaceInput) {
  return callCommand<Workspace>("update_workspace", { id, input });
}

export function archiveWorkspace(id: string) {
  return callCommand<Workspace>("archive_workspace", { id });
}

export function scanWorkspace(id: string) {
  return callCommand<WorkspaceRepoDiscovery[]>("scan_workspace", { id });
}

export function importWorkspaceRepositories(input: ImportWorkspaceRepositoriesInput) {
  return callCommand<Project[]>("import_workspace_repositories", { input });
}

export function ignoreWorkspaceRepository(input: WorkspaceRepositoryActionInput) {
  return callCommand<void>("ignore_workspace_repository", { input });
}

export function unignoreWorkspaceRepository(input: WorkspaceRepositoryActionInput) {
  return callCommand<void>("unignore_workspace_repository", { input });
}
