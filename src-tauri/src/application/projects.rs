use crate::domain::project::{CreateProjectInput, Project, UpdateProjectInput};
use crate::infrastructure::database::repositories::ProjectRepository;

pub struct ProjectService;

impl ProjectService {
    pub async fn list(repository: &ProjectRepository<'_>) -> Result<Vec<Project>, sqlx::Error> {
        repository.list().await
    }

    pub async fn create(
        repository: &ProjectRepository<'_>,
        input: CreateProjectInput,
    ) -> Result<Project, ProjectServiceError> {
        if input.name.trim().is_empty() {
            return Err(ProjectServiceError::Validation(
                "Project name is required".to_string(),
            ));
        }

        repository
            .create(input)
            .await
            .map_err(ProjectServiceError::Database)
    }

    pub async fn update(
        repository: &ProjectRepository<'_>,
        id: &str,
        input: UpdateProjectInput,
    ) -> Result<Option<Project>, sqlx::Error> {
        repository.update(id, input).await
    }

    pub async fn archive(
        repository: &ProjectRepository<'_>,
        id: &str,
    ) -> Result<Option<Project>, sqlx::Error> {
        repository.archive(id).await
    }

    pub fn validate_repo_path(path: &str) -> bool {
        crate::infrastructure::filesystem::repo_paths::looks_like_git_repository(path)
    }
}

pub enum ProjectServiceError {
    Validation(String),
    Database(sqlx::Error),
}
