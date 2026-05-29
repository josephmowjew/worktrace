use crate::domain::project::Project;
use crate::domain::workspace::{
    CreateWorkspaceInput, ImportWorkspaceRepositoriesInput, UpdateWorkspaceInput, Workspace,
    WorkspaceRepoDiscovery, WorkspaceRepositoryActionInput,
};
use crate::infrastructure::database::repositories::WorkspaceRepository;
use crate::infrastructure::filesystem::workspace_scanner::discover_repositories;
use crate::infrastructure::git::runner;

pub struct WorkspaceService;

impl WorkspaceService {
    pub async fn list(
        repository: &WorkspaceRepository<'_>,
    ) -> Result<Vec<Workspace>, WorkspaceServiceError> {
        repository
            .list()
            .await
            .map_err(WorkspaceServiceError::Database)
    }

    pub async fn create(
        repository: &WorkspaceRepository<'_>,
        input: CreateWorkspaceInput,
    ) -> Result<Workspace, WorkspaceServiceError> {
        if input.name.trim().is_empty() {
            return Err(WorkspaceServiceError::Validation(
                "Workspace name is required".to_string(),
            ));
        }
        if input.root_path.trim().is_empty() {
            return Err(WorkspaceServiceError::Validation(
                "Workspace root folder is required".to_string(),
            ));
        }

        repository
            .create(input)
            .await
            .map_err(WorkspaceServiceError::Database)
    }

    pub async fn update(
        repository: &WorkspaceRepository<'_>,
        id: &str,
        input: UpdateWorkspaceInput,
    ) -> Result<Option<Workspace>, WorkspaceServiceError> {
        if matches!(input.name.as_deref(), Some(name) if name.trim().is_empty()) {
            return Err(WorkspaceServiceError::Validation(
                "Workspace name is required".to_string(),
            ));
        }

        repository
            .update(id, input)
            .await
            .map_err(WorkspaceServiceError::Database)
    }

    pub async fn archive(
        repository: &WorkspaceRepository<'_>,
        id: &str,
    ) -> Result<Option<Workspace>, WorkspaceServiceError> {
        repository
            .archive(id)
            .await
            .map_err(WorkspaceServiceError::Database)
    }

    pub async fn scan(
        repository: &WorkspaceRepository<'_>,
        id: &str,
    ) -> Result<Vec<WorkspaceRepoDiscovery>, WorkspaceServiceError> {
        let Some(workspace) = repository
            .find(id)
            .await
            .map_err(WorkspaceServiceError::Database)?
        else {
            return Err(WorkspaceServiceError::Validation(
                "Workspace was not found".to_string(),
            ));
        };

        if workspace.status != "active" {
            return Err(WorkspaceServiceError::Validation(
                "Archived workspaces cannot be scanned".to_string(),
            ));
        }

        let discovered = discover_repositories(&workspace.root_path)
            .map_err(WorkspaceServiceError::Validation)?
            .into_iter()
            .map(|repo| {
                let github = detect_github_remote(&repo.repo_path);
                WorkspaceRepoDiscovery {
                    repo_path: repo.repo_path,
                    relative_path: repo.relative_path,
                    suggested_name: repo.suggested_name,
                    github_url: github.as_ref().map(|remote| remote.github_url.clone()),
                    github_owner: github.as_ref().map(|remote| remote.owner.clone()),
                    github_repo: github.as_ref().map(|remote| remote.repo.clone()),
                    github_account_id: None,
                    github_account_username: None,
                    github_binding_status: github
                        .as_ref()
                        .map(|_| "detected_repo".to_string())
                        .or_else(|| Some("unbound".to_string())),
                    status: "new".to_string(),
                    project_id: None,
                    project_name: None,
                }
            })
            .collect();

        repository
            .classify_discoveries(id, discovered)
            .await
            .map_err(WorkspaceServiceError::Database)
    }

    pub async fn import_repositories(
        repository: &WorkspaceRepository<'_>,
        input: ImportWorkspaceRepositoriesInput,
    ) -> Result<Vec<Project>, WorkspaceServiceError> {
        if input.workspace_id.trim().is_empty() {
            return Err(WorkspaceServiceError::Validation(
                "Workspace id is required".to_string(),
            ));
        }
        if input.repositories.is_empty() {
            return Err(WorkspaceServiceError::Validation(
                "Select at least one repository to import".to_string(),
            ));
        }

        repository
            .import_repositories(input)
            .await
            .map_err(WorkspaceServiceError::Database)
    }

    pub async fn ignore_repository(
        repository: &WorkspaceRepository<'_>,
        input: WorkspaceRepositoryActionInput,
    ) -> Result<(), WorkspaceServiceError> {
        repository
            .ignore_repository(input)
            .await
            .map_err(WorkspaceServiceError::Database)
    }

    pub async fn unignore_repository(
        repository: &WorkspaceRepository<'_>,
        input: WorkspaceRepositoryActionInput,
    ) -> Result<(), WorkspaceServiceError> {
        repository
            .unignore_repository(input)
            .await
            .map_err(WorkspaceServiceError::Database)
    }
}

#[derive(Debug)]
struct DetectedGitHubRemote {
    owner: String,
    repo: String,
    github_url: String,
}

fn detect_github_remote(repo_path: &str) -> Option<DetectedGitHubRemote> {
    git_stdout(repo_path, &["remote", "get-url", "--push", "origin"])
        .or_else(|| git_stdout(repo_path, &["remote", "get-url", "origin"]))
        .and_then(|url| parse_github_remote(&url))
}

fn git_stdout(repo_path: &str, args: &[&str]) -> Option<String> {
    let output = runner::run_git(repo_path, args).ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!value.is_empty()).then_some(value)
}

fn parse_github_remote(value: &str) -> Option<DetectedGitHubRemote> {
    let trimmed = value.trim().trim_end_matches(".git");
    let path = trimmed
        .strip_prefix("https://github.com/")
        .or_else(|| trimmed.strip_prefix("http://github.com/"))
        .or_else(|| trimmed.strip_prefix("git@github.com:"))?;
    let parts = path.split('/').collect::<Vec<_>>();
    if parts.len() != 2 || parts[0].is_empty() || parts[1].is_empty() {
        return None;
    }
    Some(DetectedGitHubRemote {
        owner: parts[0].to_string(),
        repo: parts[1].to_string(),
        github_url: format!("https://github.com/{}/{}", parts[0], parts[1]),
    })
}

#[derive(Debug)]
pub enum WorkspaceServiceError {
    Validation(String),
    Database(sqlx::Error),
}
