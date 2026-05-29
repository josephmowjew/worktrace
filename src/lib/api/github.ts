import { callCommand } from "./client";
import type {
  CompleteGitHubDeviceAuthInput,
  CompleteGitHubDeviceAuthOutput,
  ConnectGitHubPatInput,
  CreateGitHubPullRequestInput,
  CreateGitHubPullRequestOutput,
  DetectProjectGitHubBindingInput,
  DetectProjectGitHubBindingOutput,
  GitHubAccount,
  GitHubAccountActionInput,
  GitHubAccountsStatus,
  GitHubIntegrationStatus,
  StartGitHubDeviceAuthOutput,
  SyncGitHubProjectActivityInput,
  SyncGitHubProjectActivityOutput,
} from "../../types/github";

export function getGitHubIntegrationStatus() {
  return callCommand<GitHubIntegrationStatus>("get_github_integration_status");
}

export function listGitHubAccounts() {
  return callCommand<GitHubAccountsStatus>("list_github_accounts");
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

export function testGitHubAccount(input: GitHubAccountActionInput) {
  return callCommand<GitHubAccount>("test_github_account", { input });
}

export function disconnectGitHub() {
  return callCommand<GitHubIntegrationStatus>("disconnect_github");
}

export function disconnectGitHubAccount(input: GitHubAccountActionInput) {
  return callCommand<GitHubAccountsStatus>("disconnect_github_account", { input });
}

export function detectProjectGitHubBinding(input: DetectProjectGitHubBindingInput) {
  return callCommand<DetectProjectGitHubBindingOutput>("detect_project_github_binding", { input });
}

export function syncGitHubProjectActivity(input: SyncGitHubProjectActivityInput = {}) {
  return callCommand<SyncGitHubProjectActivityOutput>("sync_github_project_activity", { input });
}

export function createGitHubPullRequest(input: CreateGitHubPullRequestInput) {
  return callCommand<CreateGitHubPullRequestOutput>("create_github_pull_request", { input });
}
