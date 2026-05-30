use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualLogAttachment {
    pub id: String,
    pub manual_log_id: String,
    pub original_name: String,
    pub stored_name: String,
    pub mime_type: String,
    pub extension: String,
    pub size_bytes: i64,
    pub sha256: String,
    pub image_width: Option<i32>,
    pub image_height: Option<i32>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct CreateManualLogAttachmentRecord {
    pub id: String,
    pub manual_log_id: String,
    pub original_name: String,
    pub stored_name: String,
    pub storage_relative_path: String,
    pub mime_type: String,
    pub extension: String,
    pub size_bytes: i64,
    pub sha256: String,
    pub image_width: Option<i32>,
    pub image_height: Option<i32>,
}

#[derive(Debug, Clone)]
pub struct ManualLogAttachmentRecord {
    pub id: String,
    pub manual_log_id: String,
    pub original_name: String,
    pub stored_name: String,
    pub storage_relative_path: String,
    pub mime_type: String,
    pub extension: String,
    pub size_bytes: i64,
    pub sha256: String,
    pub image_width: Option<i32>,
    pub image_height: Option<i32>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<ManualLogAttachmentRecord> for ManualLogAttachment {
    fn from(record: ManualLogAttachmentRecord) -> Self {
        Self {
            id: record.id,
            manual_log_id: record.manual_log_id,
            original_name: record.original_name,
            stored_name: record.stored_name,
            mime_type: record.mime_type,
            extension: record.extension,
            size_bytes: record.size_bytes,
            sha256: record.sha256,
            image_width: record.image_width,
            image_height: record.image_height,
            created_at: record.created_at,
            updated_at: record.updated_at,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualLogAttachmentPreview {
    pub id: String,
    pub data_url: String,
    pub mime_type: String,
}
