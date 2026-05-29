import { callCommand } from "./client";
import type {
  CompleteGitHubDeviceAuthInput,
  CompleteGitHubDeviceAuthOutput,
  ConnectGitHubPatInput,
  CreateGitHubPullRequestInput,
  CreateGitHubPullRequestOutput,
  GitHubIntegrationStatus,
  StartGitHubDeviceAuthOutput,
  SyncGitHubProjectActivityInput,
  SyncGitHubProjectActivityOutput,
} from "../../types/github";

export function getGitHubIntegrationStatus() {
  return callCommand<GitHubIntegrationStatus>("get_github_integration_status");
}

export function connectGitHubPat(input: ConnectGitHubPatInput) {
  return callCommand<GitHubIntegrationStatus>("connect_github_pat", { input });
}

export function startGitHubDeviceAuth() {
  return callCommand<StartGitHubDeviceAuthOutput>("start_github_device_auth");
}

export function completeGitHubDeviceAuth(input: CompleteGitHubDeviceAuthInput) {
  return callCommand<CompleteGitHubDeviceAuthOutput>("complete_github_device_auth", { input });
}

export function testGitHubConnection() {
  return callCommand<GitHubIntegrationStatus>("test_github_connection");
}

export function disconnectGitHub() {
  return callCommand<GitHubIntegrationStatus>("disconnect_github");
}

export function syncGitHubProjectActivity(input: SyncGitHubProjectActivityInput = {}) {
  return callCommand<SyncGitHubProjectActivityOutput>("sync_github_project_activity", { input });
}

export function createGitHubPullRequest(input: CreateGitHubPullRequestInput) {
  return callCommand<CreateGitHubPullRequestOutput>("create_github_pull_request", { input });
}
