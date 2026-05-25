use crate::domain::git_metadata::{GitRef, GitWorktree, ProjectGitFocus, SaveProjectGitFocusInput};
use crate::domain::project::{CreateProjectInput, Project, UpdateProjectInput};
use crate::infrastructure::database::repositories::{GitMetadataRepository, ProjectRepository};
use crate::infrastructure::git::branches::{list_branches, GitBranch};

pub struct ProjectService;

impl ProjectService {
    pub async fn list(repository: &ProjectRepository<'_>) -> Result<Vec<Project>, sqlx::Error> {
        repository.list().await
    }

    pub async fn list_git_branches(
        repository: &ProjectRepository<'_>,
        git_metadata_repository: &GitMetadataRepository<'_>,
        project_id: &str,
    ) -> Result<Vec<GitBranch>, ProjectServiceError> {
        let project = load_project(repository, project_id).await?;

        let stored_refs = git_metadata_repository
            .list_refs(project_id)
            .await
            .map_err(ProjectServiceError::Database)?;
        if !stored_refs.is_empty() {
            return Ok(stored_refs
                .into_iter()
                .map(|git_ref| GitBranch {
                    name: git_ref.name,
                    kind: match git_ref.kind {
                        crate::domain::git_metadata::GitRefKind::Local => {
                            crate::infrastructure::git::branches::GitBranchKind::Local
                        }
                        crate::domain::git_metadata::GitRefKind::Remote => {
                            crate::infrastructure::git::branches::GitBranchKind::Remote
                        }
                    },
                    is_current: git_ref.is_current,
                })
                .collect());
        }

        let Some(repo_path) = project.repo_path.filter(|path| !path.trim().is_empty()) else {
            return Err(ProjectServiceError::Validation(
                "This project has no local repository path configured.".to_string(),
            ));
        };

        list_branches(&repo_path).map_err(|error| {
            ProjectServiceError::Validation(format!("Unable to list Git branches: {error}"))
        })
    }

    pub async fn list_git_refs(
        repository: &ProjectRepository<'_>,
        git_metadata_repository: &GitMetadataRepository<'_>,
        project_id: &str,
    ) -> Result<Vec<GitRef>, ProjectServiceError> {
        load_project(repository, project_id).await?;
        git_metadata_repository
            .list_refs(project_id)
            .await
            .map_err(ProjectServiceError::Database)
    }

    pub async fn list_git_worktrees(
        repository: &ProjectRepository<'_>,
        git_metadata_repository: &GitMetadataRepository<'_>,
        project_id: &str,
    ) -> Result<Vec<GitWorktree>, ProjectServiceError> {
        load_project(repository, project_id).await?;
        git_metadata_repository
            .list_worktrees(project_id)
            .await
            .map_err(ProjectServiceError::Database)
    }

    pub async fn get_project_git_focus(
        repository: &ProjectRepository<'_>,
        git_metadata_repository: &GitMetadataRepository<'_>,
        project_id: &str,
    ) -> Result<ProjectGitFocus, ProjectServiceError> {
        load_project(repository, project_id).await?;
        git_metadata_repository
            .get_project_focus(project_id)
            .await
            .map_err(ProjectServiceError::Database)
    }

    pub async fn save_project_git_focus(
        repository: &ProjectRepository<'_>,
        git_metadata_repository: &GitMetadataRepository<'_>,
        input: SaveProjectGitFocusInput,
    ) -> Result<ProjectGitFocus, ProjectServiceError> {
        load_project(repository, &input.project_id).await?;
        git_metadata_repository
            .save_project_focus(input)
            .await
            .map_err(ProjectServiceError::Database)
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

async fn load_project(
    repository: &ProjectRepository<'_>,
    project_id: &str,
) -> Result<Project, ProjectServiceError> {
    repository
        .find(project_id)
        .await
        .map_err(ProjectServiceError::Database)?
        .ok_or_else(|| ProjectServiceError::Validation("Project was not found".to_string()))
}
