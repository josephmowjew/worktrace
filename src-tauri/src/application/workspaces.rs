use crate::domain::project::Project;
use crate::domain::workspace::{
    CreateWorkspaceInput, ImportWorkspaceRepositoriesInput, UpdateWorkspaceInput, Workspace,
    WorkspaceRepoDiscovery, WorkspaceRepositoryActionInput,
};
use crate::infrastructure::database::repositories::WorkspaceRepository;
use crate::infrastructure::filesystem::workspace_scanner::discover_repositories;

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
            .map(|repo| WorkspaceRepoDiscovery {
                repo_path: repo.repo_path,
                relative_path: repo.relative_path,
                suggested_name: repo.suggested_name,
                status: "new".to_string(),
                project_id: None,
                project_name: None,
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
pub enum WorkspaceServiceError {
    Validation(String),
    Database(sqlx::Error),
}
