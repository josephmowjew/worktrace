use serde::{Deserialize, Deserializer, Serialize, Serializer};

#[derive(Debug, Clone, PartialEq, Eq)]
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
    Debugging,
    ClientCall,
    AdminTask,
    Custom(String),
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
pub struct QuickCaptureLogInput {
    pub project_id: Option<String>,
    pub activity_type: ActivityType,
    pub summary: String,
    pub duration_minutes: Option<i64>,
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
    pub fn as_storage_value(&self) -> &str {
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
            Self::Debugging => "Debugging",
            Self::ClientCall => "Client Call",
            Self::AdminTask => "Admin Task",
            Self::Custom(value) => value.as_str(),
        }
    }

    fn as_wire_value(&self) -> &str {
        match self {
            Self::Meeting => "Meeting",
            Self::Development => "Development",
            Self::BugFix => "BugFix",
            Self::Testing => "Testing",
            Self::Deployment => "Deployment",
            Self::Research => "Research",
            Self::Documentation => "Documentation",
            Self::Planning => "Planning",
            Self::Support => "Support",
            Self::CodeReview => "CodeReview",
            Self::ClientFeedback => "ClientFeedback",
            Self::Debugging => "Debugging",
            Self::ClientCall => "ClientCall",
            Self::AdminTask => "AdminTask",
            Self::Custom(value) => value.as_str(),
        }
    }
}

impl Serialize for ActivityType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.as_wire_value())
    }
}

impl<'de> Deserialize<'de> for ActivityType {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Ok(Self::from(value))
    }
}

impl From<String> for ActivityType {
    fn from(value: String) -> Self {
        let trimmed = value.trim();
        match trimmed {
            "Meeting" => Self::Meeting,
            "Development" => Self::Development,
            "BugFix" | "Bug Fix" => Self::BugFix,
            "Testing" => Self::Testing,
            "Deployment" => Self::Deployment,
            "Research" => Self::Research,
            "Documentation" => Self::Documentation,
            "Planning" => Self::Planning,
            "Support" => Self::Support,
            "CodeReview" | "Code Review" => Self::CodeReview,
            "ClientFeedback" | "Client Feedback" => Self::ClientFeedback,
            "Debugging" => Self::Debugging,
            "ClientCall" | "Client Call" => Self::ClientCall,
            "AdminTask" | "Admin Task" => Self::AdminTask,
            _ => Self::Custom(trimmed.to_string()),
        }
    }
}
