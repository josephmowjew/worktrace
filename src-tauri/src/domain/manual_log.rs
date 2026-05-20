use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "PascalCase")]
pub enum ActivityType {
    Meeting,
    Development,
    BugFix,
    Testing,
    Deployment,
    Research,
    Documentation,
    Planning,
    Support,
    CodeReview,
    ClientFeedback,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualLog {
    pub id: String,
    pub project_id: Option<String>,
    pub date: String,
    pub activity_type: ActivityType,
    pub summary: String,
    pub outcome: Option<String>,
    pub duration_minutes: Option<i64>,
    pub follow_up: Option<String>,
    pub included_in_report: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListManualLogsInput {
    pub from: String,
    pub to: String,
    pub project_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateManualLogInput {
    pub project_id: Option<String>,
    pub date: String,
    pub activity_type: ActivityType,
    pub summary: String,
    pub outcome: Option<String>,
    pub duration_minutes: Option<i64>,
    pub follow_up: Option<String>,
    pub included_in_report: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateManualLogInput {
    pub project_id: Option<String>,
    pub date: Option<String>,
    pub activity_type: Option<ActivityType>,
    pub summary: Option<String>,
    pub outcome: Option<String>,
    pub duration_minutes: Option<i64>,
    pub follow_up: Option<String>,
    pub included_in_report: Option<bool>,
}

impl ActivityType {
    pub fn as_storage_value(&self) -> &'static str {
        match self {
            Self::Meeting => "Meeting",
            Self::Development => "Development",
            Self::BugFix => "Bug Fix",
            Self::Testing => "Testing",
            Self::Deployment => "Deployment",
            Self::Research => "Research",
            Self::Documentation => "Documentation",
            Self::Planning => "Planning",
            Self::Support => "Support",
            Self::CodeReview => "Code Review",
            Self::ClientFeedback => "Client Feedback",
        }
    }
}

impl TryFrom<String> for ActivityType {
    type Error = String;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        match value.as_str() {
            "Meeting" => Ok(Self::Meeting),
            "Development" => Ok(Self::Development),
            "Bug Fix" => Ok(Self::BugFix),
            "Testing" => Ok(Self::Testing),
            "Deployment" => Ok(Self::Deployment),
            "Research" => Ok(Self::Research),
            "Documentation" => Ok(Self::Documentation),
            "Planning" => Ok(Self::Planning),
            "Support" => Ok(Self::Support),
            "Code Review" => Ok(Self::CodeReview),
            "Client Feedback" => Ok(Self::ClientFeedback),
            _ => Err(format!("unknown activity type: {value}")),
        }
    }
}
