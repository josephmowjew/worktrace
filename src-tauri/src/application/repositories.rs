use async_trait::async_trait;

use crate::domain::commit::Commit;
use crate::domain::manual_log::{CreateManualLogInput, ManualLog, UpdateManualLogInput};
use crate::domain::project::{CreateProjectInput, Project, UpdateProjectInput};
use crate::domain::report::{
    CreateReportItemInput, CreateReportNoteInput, Report, ReportItem, ReportNote, ReportSummary,
    SaveReportInput, UpdateReportNoteInput,
};
use crate::domain::settings::{Settings, UpdateSettingsInput};
use crate::domain::weekly_task::{
    CreateWeeklyTaskInput, ListWeeklyTasksInput, UpdateWeeklyTaskInput, WeeklyTask,
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
