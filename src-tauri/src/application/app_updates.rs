use std::fs;
use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppVersionInfo {
    pub version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseNoteItem {
    pub version: String,
    pub published_at: Option<String>,
    pub notes: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseNotesPayload {
    pub source: String,
    pub releases: Vec<ReleaseNoteItem>,
}

pub fn current_version(app: &AppHandle) -> AppVersionInfo {
    AppVersionInfo {
        version: app.package_info().version.to_string(),
    }
}

pub fn fallback_release_notes(app: &AppHandle) -> ReleaseNotesPayload {
    let changelog_path = changelog_path(app);
    let releases = changelog_path
        .and_then(|path| fs::read_to_string(path).ok())
        .map(|raw| parse_changelog(&raw))
        .filter(|items| !items.is_empty())
        .unwrap_or_else(|| {
            vec![ReleaseNoteItem {
                version: app.package_info().version.to_string(),
                published_at: Some(Utc::now().to_rfc3339()),
                notes: "No release notes are available yet.".to_string(),
            }]
        });

    ReleaseNotesPayload {
        source: "changelog".to_string(),
        releases,
    }
}

fn changelog_path(app: &AppHandle) -> Option<PathBuf> {
    ["CHANGELOG.md", "_up_/CHANGELOG.md"]
        .into_iter()
        .filter_map(|path| {
            app.path()
                .resolve(path, tauri::path::BaseDirectory::Resource)
                .ok()
        })
        .find(|path| path.exists())
}

fn parse_changelog(changelog: &str) -> Vec<ReleaseNoteItem> {
    let mut releases = Vec::new();
    let mut current_version: Option<String> = None;
    let mut current_date: Option<String> = None;
    let mut notes: Vec<String> = Vec::new();

    for line in changelog.lines() {
        if line.starts_with("## ") {
            if let Some(version) = current_version.take() {
                releases.push(ReleaseNoteItem {
                    version,
                    published_at: current_date.take(),
                    notes: notes.join("\n").trim().to_string(),
                });
                notes.clear();
            }

            let header = line.trim_start_matches("## ").trim();
            let (version, date) = parse_release_header(header);
            current_version = Some(version);
            current_date = date;
            continue;
        }

        if current_version.is_some() {
            notes.push(line.to_string());
        }
    }

    if let Some(version) = current_version {
        releases.push(ReleaseNoteItem {
            version,
            published_at: current_date,
            notes: notes.join("\n").trim().to_string(),
        });
    }

    releases
}

fn parse_release_header(header: &str) -> (String, Option<String>) {
    if let Some((version_part, date_part)) = header.split_once('-') {
        let version = version_part.trim().trim_matches('[').trim_matches(']');
        let date = DateTime::parse_from_rfc3339(&format!("{}T00:00:00Z", date_part.trim()))
            .map(|value| value.with_timezone(&Utc).to_rfc3339())
            .ok();
        return (version.to_string(), date);
    }

    (header.to_string(), None)
}
