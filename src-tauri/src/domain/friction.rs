use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetFrictionInsightsInput {
    pub from: String,
    pub to: String,
    pub project_ids: Option<Vec<String>>,
    pub classification: Option<String>,
    pub surface: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FrictionInsightSeverity {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FrictionInsightKind {
    ProjectSwitching,
    ContextSwitching,
    SupportMode,
    MeetingRecoveryGap,
    StaleTask,
    RepeatedIssue,
    LateReport,
    FocusFragmentation,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrictionInsightMetric {
    pub key: String,
    pub label: String,
    pub value: String,
    pub unit: Option<String>,
    pub threshold: Option<String>,
    pub direction: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FrictionEvidenceSourceType {
    WeeklyTask,
    Activity,
    ManualLog,
    CalendarEvent,
    FocusSession,
    Report,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrictionEvidenceItem {
    pub evidence_id: String,
    pub source_type: FrictionEvidenceSourceType,
    pub source_id: String,
    pub title: String,
    pub date: String,
    pub occurred_at: Option<String>,
    pub project_name: Option<String>,
    pub detail: Option<String>,
    pub route: Option<String>,
    pub role: String,
    pub observed_value: Option<String>,
    pub route_state: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrictionInsightScope {
    pub from: String,
    pub to: String,
    pub surface: String,
    pub project_ids: Option<Vec<String>>,
    pub classification: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrictionInsightClaim {
    pub statement: String,
    pub impact_label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrictionInsightDataHealth {
    pub status: String,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrictionInsightReason {
    pub id: String,
    pub label: String,
    pub detail: String,
    pub strength: String,
    pub evidence_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrictionInsightAction {
    pub route: String,
    pub state_json: Option<serde_json::Value>,
    pub source_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrictionInsight {
    pub id: String,
    pub nudge_key: String,
    pub rule_version: String,
    pub scope: FrictionInsightScope,
    pub claim: FrictionInsightClaim,
    pub kind: FrictionInsightKind,
    pub severity: FrictionInsightSeverity,
    pub confidence: f64,
    pub confidence_label: String,
    pub verified: bool,
    pub data_health: FrictionInsightDataHealth,
    pub title: String,
    pub detail: String,
    pub recommendation: String,
    pub evidence: Vec<String>,
    pub metrics: Vec<FrictionInsightMetric>,
    pub evidence_items: Vec<FrictionEvidenceItem>,
    pub reasons: Vec<FrictionInsightReason>,
    pub action_label: String,
    pub action_target: String,
    pub primary_action: Option<FrictionInsightAction>,
    pub date: Option<String>,
}
