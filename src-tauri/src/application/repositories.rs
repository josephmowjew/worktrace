use async_trait::async_trait;

use crate::domain::commit::Commit;
use crate::domain::focus_session::{
    CreateFocusSessionInput, FocusSession, FocusSessionStatus, ListFocusSessionsInput,
    StopFocusSessionInput,
};
use crate::domain::manual_log::{CreateManualLogInput, ManualLog, UpdateManualLogInput};
use crate::domain::nudge::{DismissNudgeInput, ListNudgeDismissalsInput, NudgeDismissal};
use crate::domain::project::{CreateProjectInput, Project, UpdateProjectInput};
use crate::domain::report::{
    CreateReportItemInput, CreateReportNoteInput, Report, ReportItem, ReportNote, ReportSummary,
    SaveReportInput, UpdateReportNoteInput,
};
use crate::domain::settings::{Settings, UpdateSettingsInput};
use crate::domain::weekly_task::{
    CreateWeeklyTaskInput, ListWeeklyTasksInput, UpdateWeeklyTaskInput, WeeklyTask,
};
use crate::domain::workspace::{
    CreateWorkspaceInput, UpdateWorkspaceInput, Workspace, WorkspaceRepoDiscovery,
};
use crate::infrastructure::database::repositories::CommitUpsertResult;

#[async_trait]
pub trait ProjectStore: Send + Sync {
    async fn list(&self) -> Result<Vec<Project>, sqlx::Error>;
    async fn list_active(&self) -> Result<Vec<Project>, sqlx::Error>;
    async fn create(&self, input: CreateProjectInput) -> Result<Project, sqlx::Error>;
    async fn update(
        &self,
        id: &str,
        input: UpdateProjectInput,
    ) -> Result<Option<Project>, sqlx::Error>;
    async fn archive(&self, id: &str) -> Result<Option<Project>, sqlx::Error>;
}

#[async_trait]
pub trait CommitStore: Send + Sync {
    async fn upsert(&self, commit: &Commit) -> Result<CommitUpsertResult, sqlx::Error>;
}

#[async_trait]
pub trait ManualLogStore: Send + Sync {
    async fn create(&self, input: CreateManualLogInput) -> Result<ManualLog, sqlx::Error>;
    async fn update(
        &self,
        id: &str,
        input: UpdateManualLogInput,
    ) -> Result<Option<ManualLog>, sqlx::Error>;
    async fn delete(&self, id: &str) -> Result<bool, sqlx::Error>;
    async fn list_by_date_range(&self, from: &str, to: &str)
        -> Result<Vec<ManualLog>, sqlx::Error>;
}

#[async_trait]
pub trait ReportStore: Send + Sync {
    async fn save(&self, input: SaveReportInput) -> Result<Report, sqlx::Error>;
    async fn list(&self) -> Result<Vec<ReportSummary>, sqlx::Error>;
    async fn get(&self, id: &str) -> Result<Option<Report>, sqlx::Error>;
}

#[async_trait]
pub trait ReportItemStore: Send + Sync {
    async fn insert(&self, input: CreateReportItemInput) -> Result<ReportItem, sqlx::Error>;
    async fn list_by_report(&self, report_id: &str) -> Result<Vec<ReportItem>, sqlx::Error>;
}

#[async_trait]
pub trait ReportNoteStore: Send + Sync {
    async fn create(&self, input: CreateReportNoteInput) -> Result<ReportNote, sqlx::Error>;
    async fn update(
        &self,
        id: &str,
        input: UpdateReportNoteInput,
    ) -> Result<Option<ReportNote>, sqlx::Error>;
    async fn delete(&self, id: &str) -> Result<bool, sqlx::Error>;
    async fn list_by_date_range(
        &self,
        from: &str,
        to: &str,
    ) -> Result<Vec<ReportNote>, sqlx::Error>;
}

#[async_trait]
pub trait SettingsStore: Send + Sync {
    async fn get(&self) -> Result<Settings, sqlx::Error>;
    async fn update(&self, input: UpdateSettingsInput) -> Result<Settings, sqlx::Error>;
}

#[async_trait]
pub trait WeeklyTaskStore: Send + Sync {
    async fn list(&self, input: ListWeeklyTasksInput) -> Result<Vec<WeeklyTask>, sqlx::Error>;
    async fn create(&self, input: CreateWeeklyTaskInput) -> Result<WeeklyTask, sqlx::Error>;
    async fn update(
        &self,
        id: &str,
        input: UpdateWeeklyTaskInput,
    ) -> Result<Option<WeeklyTask>, sqlx::Error>;
    async fn delete(&self, id: &str) -> Result<bool, sqlx::Error>;
}

#[async_trait]
pub trait FocusSessionStore: Send + Sync {
    async fn active(&self) -> Result<Option<FocusSession>, sqlx::Error>;
    async fn list(&self, input: ListFocusSessionsInput) -> Result<Vec<FocusSession>, sqlx::Error>;
    async fn create(&self, input: CreateFocusSessionInput) -> Result<FocusSession, sqlx::Error>;
    async fn stop(
        &self,
        id: &str,
        input: StopFocusSessionInput,
    ) -> Result<Option<FocusSession>, sqlx::Error>;
    async fn cancel(&self, id: &str) -> Result<Option<FocusSession>, sqlx::Error>;
    async fn set_status(
        &self,
        id: &str,
        status: FocusSessionStatus,
    ) -> Result<Option<FocusSession>, sqlx::Error>;
    async fn set_manual_log(
        &self,
        id: &str,
        manual_log_id: &str,
    ) -> Result<Option<FocusSession>, sqlx::Error>;
}

#[async_trait]
pub trait NudgeDismissalStore: Send + Sync {
    async fn list(
        &self,
        input: ListNudgeDismissalsInput,
    ) -> Result<Vec<NudgeDismissal>, sqlx::Error>;
    async fn dismiss(&self, input: DismissNudgeInput) -> Result<NudgeDismissal, sqlx::Error>;
}

#[async_trait]
pub trait WorkspaceStore: Send + Sync {
    async fn list(&self) -> Result<Vec<Workspace>, sqlx::Error>;
    async fn create(&self, input: CreateWorkspaceInput) -> Result<Workspace, sqlx::Error>;
    async fn update(
        &self,
        id: &str,
        input: UpdateWorkspaceInput,
    ) -> Result<Option<Workspace>, sqlx::Error>;
    async fn archive(&self, id: &str) -> Result<Option<Workspace>, sqlx::Error>;
    async fn scan(
        &self,
        workspace_id: &str,
        discovered: Vec<WorkspaceRepoDiscovery>,
    ) -> Result<Vec<WorkspaceRepoDiscovery>, sqlx::Error>;
}
