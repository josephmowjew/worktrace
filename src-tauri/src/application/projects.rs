use crate::domain::project::{CreateProjectInput, Project, UpdateProjectInput};
use crate::infrastructure::database::repositories::ProjectRepository;
use crate::infrastructure::git::branches::{list_branches, GitBranch};

pub struct ProjectService;

impl ProjectService {
    pub async fn list(repository: &ProjectRepository<'_>) -> Result<Vec<Project>, sqlx::Error> {
        repository.list().await
    }

    pub async fn list_git_branches(
        repository: &ProjectRepository<'_>,
        project_id: &str,
    ) -> Result<Vec<GitBranch>, ProjectServiceError> {
        let Some(project) = repository
            .find(project_id)
            .await
            .map_err(ProjectServiceError::Database)?
        else {
            return Err(ProjectServiceError::Validation(
                "Project was not found".to_string(),
            ));
        };

        let Some(repo_path) = project.repo_path.filter(|path| !path.trim().is_empty()) else {
            return Err(ProjectServiceError::Validation(
                "This project has no local repository path configured.".to_string(),
            ));
        };

        list_branches(&repo_path).map_err(|error| {
            ProjectServiceError::Validation(format!("Unable to list Git branches: {error}"))
        })
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
