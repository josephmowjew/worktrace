import { callCommand } from "./client";
import type {
  ConnectGitHubPatInput,
  CreateGitHubPullRequestInput,
  CreateGitHubPullRequestOutput,
  GitHubIntegrationStatus,
} from "../../types/github";

export function getGitHubIntegrationStatus() {
  return callCommand<GitHubIntegrationStatus>("get_github_integration_status");
}

export function connectGitHubPat(input: ConnectGitHubPatInput) {
  return callCommand<GitHubIntegrationStatus>("connect_github_pat", { input });
}

export function testGitHubConnection() {
  return callCommand<GitHubIntegrationStatus>("test_github_connection");
}

export function disconnectGitHub() {
  return callCommand<GitHubIntegrationStatus>("disconnect_github");
}

export function createGitHubPullRequest(input: CreateGitHubPullRequestInput) {
  return callCommand<CreateGitHubPullRequestOutput>("create_github_pull_request", { input });
}
