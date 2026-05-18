use tauri::State;

use crate::domain::commit::{SyncCommitsInput, SyncCommitsResult};
use crate::infrastructure::database::repositories::{
    CommitRepository, CommitUpsertResult, ProjectRepository,
};
use crate::infrastructure::git::scanner::GitScanner;
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn sync_commits(
    state: State<'_, AppState>,
    input: SyncCommitsInput,
) -> Result<AppResult<SyncCommitsResult>, String> {
    if input.from.trim().is_empty() || input.to.trim().is_empty() {
        return Ok(AppResult::err(
            "VALIDATION_ERROR",
            "Sync date range is required",
        ));
    }

    let project_repository = ProjectRepository::new(state.database.pool());
    let commit_repository = CommitRepository::new(state.database.pool());
    let projects = match project_repository.list_active().await {
        Ok(projects) => projects,
        Err(error) => return Ok(AppResult::err("DATABASE_ERROR", error.to_string())),
    };

    let mut result = SyncCommitsResult {
        scanned_projects: 0,
        skipped_projects: 0,
        new_commits: 0,
        updated_commits: 0,
        errors: Vec::new(),
    };

    for project in projects {
        if let Some(project_ids) = &input.project_ids {
            if !project_ids.contains(&project.id) {
                continue;
            }
        }

        let Some(repo_path) = project
            .repo_path
            .clone()
            .filter(|path| !path.trim().is_empty())
        else {
            result.skipped_projects += 1;
            continue;
        };

        match GitScanner::scan(
            &project.id,
            &repo_path,
            &input.from,
            &input.to,
            input.author_email.as_deref(),
        ) {
            Ok(commits) => {
                result.scanned_projects += 1;

                for commit in commits {
                    match commit_repository.upsert(&commit).await {
                        Ok(CommitUpsertResult::Inserted) => result.new_commits += 1,
                        Ok(CommitUpsertResult::Updated) => result.updated_commits += 1,
                        Err(error) => result.errors.push(format!(
                            "{}: failed to save commit {}: {}",
                            project.name, commit.commit_hash, error
                        )),
                    }
                }
            }
            Err(error) => {
                result.errors.push(format!("{}: {}", project.name, error));
            }
        }
    }

    Ok(AppResult::ok(result))
}
