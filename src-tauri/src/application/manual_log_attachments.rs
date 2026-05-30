use std::fs;
use std::io::{BufReader, Read};
use std::path::{Component, Path, PathBuf};

use base64::Engine;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::domain::manual_log_attachment::{
    CreateManualLogAttachmentRecord, ManualLogAttachment, ManualLogAttachmentPreview,
    ManualLogAttachmentRecord,
};
use crate::infrastructure::database::repositories::{
    ManualLogAttachmentRepository, ManualLogRepository,
};

const MAX_ATTACHMENT_BYTES: u64 = 25 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_LOG: usize = 20;
const MAX_PREVIEW_BYTES: i64 = 2 * 1024 * 1024;

pub struct ManualLogAttachmentService;

impl ManualLogAttachmentService {
    pub async fn list(
        repository: &ManualLogAttachmentRepository<'_>,
        manual_log_id: &str,
    ) -> Result<Vec<ManualLogAttachment>, ManualLogAttachmentServiceError> {
        validate_id(manual_log_id, "Manual log id")?;
        let attachments = repository
            .list_by_manual_log(manual_log_id)
            .await
            .map_err(ManualLogAttachmentServiceError::Database)?;
        Ok(attachments.into_iter().map(ManualLogAttachment::from).collect())
    }

    pub async fn add(
        app: &AppHandle,
        logs: &ManualLogRepository<'_>,
        repository: &ManualLogAttachmentRepository<'_>,
        manual_log_id: &str,
        source_path: &str,
    ) -> Result<ManualLogAttachment, ManualLogAttachmentServiceError> {
        validate_id(manual_log_id, "Manual log id")?;
        if logs
            .find(manual_log_id)
            .await
            .map_err(ManualLogAttachmentServiceError::Database)?
            .is_none()
        {
            return Err(ManualLogAttachmentServiceError::Validation(
                "Manual log was not found".to_string(),
            ));
        }

        let count = repository
            .count_by_manual_log(manual_log_id)
            .await
            .map_err(ManualLogAttachmentServiceError::Database)?;
        if count >= MAX_ATTACHMENTS_PER_LOG {
            return Err(ManualLogAttachmentServiceError::Validation(format!(
                "A manual log can have up to {MAX_ATTACHMENTS_PER_LOG} attachments"
            )));
        }

        let source = canonical_source(source_path)?;
        let metadata = fs::metadata(&source).map_err(ManualLogAttachmentServiceError::Io)?;
        if !metadata.is_file() {
            return Err(ManualLogAttachmentServiceError::Validation(
                "Attachment source must be a file".to_string(),
            ));
        }
        if metadata.len() > MAX_ATTACHMENT_BYTES {
            return Err(ManualLogAttachmentServiceError::Validation(
                "Attachment must be 25 MB or smaller".to_string(),
            ));
        }

        let original_name = source
            .file_name()
            .and_then(|name| name.to_str())
            .map(sanitize_display_name)
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| "attachment".to_string());
        let extension = source
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase())
            .ok_or_else(|| {
                ManualLogAttachmentServiceError::Validation(
                    "Attachment must be a PNG, JPG, WEBP, GIF, or PDF".to_string(),
                )
            })?;
        let mime_type = detect_mime_type(&source, &extension)?;
        let sha256 = hash_file(&source)?;
        let id = new_attachment_id();
        let stored_name = format!("{id}.{extension}");
        let storage_relative_path = safe_relative_path(manual_log_id, &stored_name)?;
        let root = attachment_root(app)?;
        let destination = safe_storage_path(&root, &storage_relative_path)?;
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(ManualLogAttachmentServiceError::Io)?;
        }
        fs::copy(&source, &destination).map_err(ManualLogAttachmentServiceError::Io)?;

        let record = repository
            .create(CreateManualLogAttachmentRecord {
                id,
                manual_log_id: manual_log_id.to_string(),
                original_name,
                stored_name,
                storage_relative_path,
                mime_type,
                extension,
                size_bytes: metadata.len() as i64,
                sha256,
                image_width: None,
                image_height: None,
            })
            .await
            .map_err(ManualLogAttachmentServiceError::Database)?;

        Ok(ManualLogAttachment::from(record))
    }

    pub async fn delete(
        app: &AppHandle,
        repository: &ManualLogAttachmentRepository<'_>,
        id: &str,
    ) -> Result<bool, ManualLogAttachmentServiceError> {
        validate_id(id, "Attachment id")?;
        let Some(record) = repository
            .find(id)
            .await
            .map_err(ManualLogAttachmentServiceError::Database)?
        else {
            return Ok(false);
        };
        let root = attachment_root(app)?;
        let path = safe_storage_path(&root, &record.storage_relative_path)?;
        let deleted = repository
            .delete(id)
            .await
            .map_err(ManualLogAttachmentServiceError::Database)?;
        if deleted && path.exists() {
            fs::remove_file(path).map_err(ManualLogAttachmentServiceError::Io)?;
        }
        Ok(deleted)
    }

    pub async fn open(
        app: &AppHandle,
        repository: &ManualLogAttachmentRepository<'_>,
        id: &str,
    ) -> Result<bool, ManualLogAttachmentServiceError> {
        let Some(record) = find_record(repository, id).await? else {
            return Ok(false);
        };
        let path = attachment_path(app, &record)?;
        app.opener()
            .open_path(path.to_string_lossy().to_string(), None::<&str>)
            .map_err(|error| ManualLogAttachmentServiceError::Validation(error.to_string()))?;
        Ok(true)
    }

    pub async fn preview(
        app: &AppHandle,
        repository: &ManualLogAttachmentRepository<'_>,
        id: &str,
    ) -> Result<Option<ManualLogAttachmentPreview>, ManualLogAttachmentServiceError> {
        let Some(record) = find_record(repository, id).await? else {
            return Ok(None);
        };
        if !record.mime_type.starts_with("image/") || record.size_bytes > MAX_PREVIEW_BYTES {
            return Ok(None);
        }
        let path = attachment_path(app, &record)?;
        let bytes = fs::read(path).map_err(ManualLogAttachmentServiceError::Io)?;
        let data = base64::engine::general_purpose::STANDARD.encode(bytes);
        Ok(Some(ManualLogAttachmentPreview {
            id: record.id,
            data_url: format!("data:{};base64,{data}", record.mime_type),
            mime_type: record.mime_type,
        }))
    }
}

#[derive(Debug)]
pub enum ManualLogAttachmentServiceError {
    Validation(String),
    Database(sqlx::Error),
    Io(std::io::Error),
}

async fn find_record(
    repository: &ManualLogAttachmentRepository<'_>,
    id: &str,
) -> Result<Option<ManualLogAttachmentRecord>, ManualLogAttachmentServiceError> {
    validate_id(id, "Attachment id")?;
    repository
        .find(id)
        .await
        .map_err(ManualLogAttachmentServiceError::Database)
}

fn attachment_path(
    app: &AppHandle,
    record: &ManualLogAttachmentRecord,
) -> Result<PathBuf, ManualLogAttachmentServiceError> {
    let root = attachment_root(app)?;
    let path = safe_storage_path(&root, &record.storage_relative_path)?;
    if !path.exists() {
        return Err(ManualLogAttachmentServiceError::Validation(
            "Attachment file was not found".to_string(),
        ));
    }
    Ok(path)
}

fn attachment_root(app: &AppHandle) -> Result<PathBuf, ManualLogAttachmentServiceError> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("attachments"))
        .map_err(|error| ManualLogAttachmentServiceError::Validation(error.to_string()))
}

fn canonical_source(path: &str) -> Result<PathBuf, ManualLogAttachmentServiceError> {
    if path.trim().is_empty() {
        return Err(ManualLogAttachmentServiceError::Validation(
            "Attachment path is required".to_string(),
        ));
    }
    fs::canonicalize(path).map_err(ManualLogAttachmentServiceError::Io)
}

fn safe_relative_path(
    manual_log_id: &str,
    stored_name: &str,
) -> Result<String, ManualLogAttachmentServiceError> {
    validate_id(manual_log_id, "Manual log id")?;
    if stored_name.contains('/') || stored_name.contains('\\') || stored_name.contains("..") {
        return Err(ManualLogAttachmentServiceError::Validation(
            "Invalid attachment filename".to_string(),
        ));
    }
    Ok(format!("manual-logs/{manual_log_id}/{stored_name}"))
}

fn safe_storage_path(
    root: &Path,
    relative_path: &str,
) -> Result<PathBuf, ManualLogAttachmentServiceError> {
    let relative = Path::new(relative_path);
    if relative.is_absolute()
        || relative
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(ManualLogAttachmentServiceError::Validation(
            "Invalid attachment storage path".to_string(),
        ));
    }
    let root = root.to_path_buf();
    let path = root.join(relative);
    if !path.starts_with(&root) {
        return Err(ManualLogAttachmentServiceError::Validation(
            "Invalid attachment storage path".to_string(),
        ));
    }
    Ok(path)
}

fn detect_mime_type(path: &Path, extension: &str) -> Result<String, ManualLogAttachmentServiceError> {
    let mut buffer = [0_u8; 16];
    let mut file = fs::File::open(path).map_err(ManualLogAttachmentServiceError::Io)?;
    let read = file
        .read(&mut buffer)
        .map_err(ManualLogAttachmentServiceError::Io)?;
    let bytes = &buffer[..read];
    let mime_type = match extension {
        "png" if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => "image/png",
        "jpg" | "jpeg" if bytes.starts_with(b"\xff\xd8\xff") => "image/jpeg",
        "webp" if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" => {
            "image/webp"
        }
        "gif" if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") => "image/gif",
        "pdf" if bytes.starts_with(b"%PDF-") => "application/pdf",
        _ => {
            return Err(ManualLogAttachmentServiceError::Validation(
                "Attachment file content does not match an allowed image or PDF type".to_string(),
            ));
        }
    };
    Ok(mime_type.to_string())
}

fn hash_file(path: &Path) -> Result<String, ManualLogAttachmentServiceError> {
    let file = fs::File::open(path).map_err(ManualLogAttachmentServiceError::Io)?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 8192];
    loop {
        let count = reader
            .read(&mut buffer)
            .map_err(ManualLogAttachmentServiceError::Io)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn sanitize_display_name(value: &str) -> String {
    value
        .chars()
        .filter(|ch| !ch.is_control() && *ch != '/' && *ch != '\\')
        .collect::<String>()
        .trim()
        .chars()
        .take(160)
        .collect()
}

fn validate_id(value: &str, label: &str) -> Result<(), ManualLogAttachmentServiceError> {
    if value.trim().is_empty()
        || value.contains('/')
        || value.contains('\\')
        || value.contains("..")
    {
        return Err(ManualLogAttachmentServiceError::Validation(format!(
            "{label} is invalid"
        )));
    }
    Ok(())
}

fn new_attachment_id() -> String {
    let random: u64 = rand::random();
    format!("manual_log_attachment_{random:016x}")
}
