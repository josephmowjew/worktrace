use std::path::PathBuf;
use std::process::Command;

use base64::Engine;
use keyring::Entry;
use reqwest::{multipart, Client};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Manager, State};

use crate::infrastructure::database::repositories::SettingsRepository;
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

const KEYRING_SERVICE: &str = "WorkTrace";
const OPENROUTER_KEY_USER: &str = "report_ai_openrouter";
const GROQ_KEY_USER: &str = "report_ai_groq";
const OPENROUTER_TRANSCRIPTION_URL: &str = "https://openrouter.ai/api/v1/audio/transcriptions";
const GROQ_TRANSCRIPTION_URL: &str = "https://api.groq.com/openai/v1/audio/transcriptions";
const LOCAL_MODEL_CANDIDATES: &[&str] = &[
    "ggml-small.en.bin",
    "ggml-base.en.bin",
    "ggml-small.bin",
    "ggml-base.bin",
    "ggml-medium.en.bin",
    "ggml-medium.bin",
    "ggml-large-v3-turbo-q5_0.bin",
    "ggml-large-v3-turbo.bin",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeVoiceCommandInput {
    pub audio_bytes: Vec<u8>,
    pub mime_type: String,
    #[serde(default)]
    pub local_only: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeVoiceCommandResult {
    pub transcript: String,
    pub engine: String,
    pub model: String,
    pub confidence: Option<f32>,
}

#[tauri::command]
pub async fn transcribe_voice_command(
    app: AppHandle,
    state: State<'_, AppState>,
    input: TranscribeVoiceCommandInput,
) -> Result<AppResult<TranscribeVoiceCommandResult>, String> {
    if input.audio_bytes.is_empty() {
        return Ok(AppResult::err(
            "VOICE_AUDIO_EMPTY",
            "No microphone audio was captured.",
        ));
    }

    let settings_repository = SettingsRepository::new(state.database.pool());
    let settings = match settings_repository.get().await {
        Ok(settings) => settings,
        Err(error) => return Ok(AppResult::err("DATABASE_ERROR", error.to_string())),
    };

    if !input.local_only {
        match settings.voice_transcription_provider.as_str() {
            "groq" => {
                return Ok(transcribe_online(
                    GROQ_TRANSCRIPTION_URL,
                    &settings.voice_groq_model,
                    "groq",
                    GROQ_KEY_USER,
                    &input,
                    settings.voice_online_allowed,
                    settings.voice_privacy_acknowledged,
                )
                .await)
            }
            "openrouter" => {
                return Ok(transcribe_openrouter(
                    &settings.voice_openrouter_model,
                    &input,
                    settings.voice_online_allowed,
                    settings.voice_privacy_acknowledged,
                )
                .await)
            }
            _ => {}
        }
    }

    let resource_dir = match app.path().resource_dir() {
        Ok(path) => path,
        Err(error) => {
            return Ok(AppResult::err(
                "VOICE_RESOURCE_DIR_UNAVAILABLE",
                error.to_string(),
            ))
        }
    };

    let voice_dirs = voice_resource_dirs(resource_dir);
    let sidecar_path = find_first_existing(
        &voice_dirs
            .iter()
            .flat_map(|dir| {
                [
                    dir.join("whisper-cli.exe"),
                    dir.join("whisper-cli"),
                    dir.join("main.exe"),
                    dir.join("main"),
                ]
            })
            .collect::<Vec<_>>(),
    );
    let Some(sidecar_path) = sidecar_path else {
        return Ok(AppResult::err(
            "VOICE_SIDECAR_MISSING",
            "Local Whisper is not installed yet. Add whisper.cpp's whisper-cli binary to bundled resources under voice/whisper-cli.exe.",
        ));
    };
    if cfg!(target_os = "windows") {
        let whisper_dll = sidecar_path
            .parent()
            .map(|dir| dir.join("whisper.dll"))
            .filter(|path| path.exists());
        if whisper_dll.is_none() {
            return Ok(AppResult::err(
                "VOICE_RUNTIME_MISSING",
                "Local Whisper is missing whisper.dll. Copy whisper.dll from the same whisper.cpp Windows build into the voice resources folder next to whisper-cli.exe.",
            ));
        }
    }

    let model_path = find_first_existing(
        &voice_dirs
            .iter()
            .flat_map(|dir| {
                LOCAL_MODEL_CANDIDATES
                    .iter()
                    .map(|file_name| dir.join(file_name))
            })
            .collect::<Vec<_>>(),
    );
    let Some(model_path) = model_path else {
        return Ok(AppResult::err(
            "VOICE_MODEL_MISSING",
            "The Whisper model is missing. Add a supported ggml model such as ggml-large-v3-turbo-q5_0.bin, ggml-small.en.bin, or ggml-base.bin to bundled resources under voice/.",
        ));
    };

    let extension = if input.mime_type.contains("ogg") {
        "ogg"
    } else if input.mime_type.contains("wav") {
        "wav"
    } else {
        "webm"
    };
    let mut audio_file = tempfile::Builder::new()
        .prefix("worktrace-voice-")
        .suffix(&format!(".{extension}"))
        .tempfile()
        .map_err(|error| error.to_string())?;

    std::io::Write::write_all(&mut audio_file, &input.audio_bytes)
        .map_err(|error| error.to_string())?;
    let audio_path = audio_file.path().to_path_buf();
    let (_file, audio_temp_path) = audio_file.keep().map_err(|error| error.to_string())?;
    drop(_file);

    let mut command = Command::new(&sidecar_path);
    if let Some(sidecar_dir) = sidecar_path.parent() {
        command.current_dir(sidecar_dir);
    }
    let output = command
        .arg("-m")
        .arg(&model_path)
        .arg("-f")
        .arg(&audio_path)
        .arg("-nt")
        .arg("-np")
        .output()
        .map_err(|error| error.to_string())?;
    let _ = std::fs::remove_file(audio_temp_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Ok(AppResult::err(
            "VOICE_TRANSCRIPTION_FAILED",
            if stderr.is_empty() {
                format!(
                    "Whisper could not transcribe the captured audio. Process exited with status {:?}.",
                    output.status.code()
                )
            } else {
                stderr
            },
        ));
    }

    let transcript = {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let parsed_stdout = parse_whisper_transcript(&stdout);
        if parsed_stdout.is_empty() {
            parse_whisper_transcript(&String::from_utf8_lossy(&output.stderr))
        } else {
            parsed_stdout
        }
    };

    Ok(AppResult::ok(TranscribeVoiceCommandResult {
        transcript,
        engine: "whisper.cpp".to_string(),
        model: model_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("local")
            .to_string(),
        confidence: None,
    }))
}

fn find_first_existing(paths: &[PathBuf]) -> Option<PathBuf> {
    paths.iter().find(|path| path.exists()).cloned()
}

fn parse_whisper_transcript(output: &str) -> String {
    output
        .lines()
        .map(str::trim)
        .filter_map(|line| {
            if line.is_empty() {
                return None;
            }
            let without_timestamp = line
                .find(']')
                .filter(|_| line.starts_with('[') && line.contains("-->"))
                .map(|index| line[index + 1..].trim())
                .unwrap_or(line);
            if is_whisper_diagnostic_line(without_timestamp) {
                return None;
            }
            if without_timestamp.is_empty() {
                None
            } else {
                Some(without_timestamp)
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn is_whisper_diagnostic_line(line: &str) -> bool {
    let normalized = line.trim_start();
    normalized.starts_with("whisper_")
        || normalized.starts_with("ggml_")
        || normalized.starts_with("main:")
        || normalized.starts_with("system_info:")
        || normalized.starts_with("sampling:")
}

fn voice_resource_dirs(resource_dir: PathBuf) -> Vec<PathBuf> {
    let mut dirs = vec![
        resource_dir.join("voice"),
        resource_dir.join("resources").join("voice"),
    ];

    dirs.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("voice"),
    );

    dirs
}

async fn transcribe_openrouter(
    model: &str,
    input: &TranscribeVoiceCommandInput,
    online_allowed: bool,
    privacy_acknowledged: bool,
) -> AppResult<TranscribeVoiceCommandResult> {
    if !online_allowed || !privacy_acknowledged {
        return AppResult::err(
            "VOICE_ONLINE_DISABLED",
            "Online voice transcription is disabled until online voice use and privacy acknowledgement are enabled in Settings.",
        );
    }

    let api_key = match get_key(OPENROUTER_KEY_USER) {
        Ok(value) => value,
        Err(_) => {
            return AppResult::err(
                "VOICE_PROVIDER_KEY_MISSING",
                "No API key is stored for openrouter. Connect the provider key first.",
            )
        }
    };

    let audio_data = base64::engine::general_purpose::STANDARD.encode(&input.audio_bytes);
    let response = match Client::new()
        .post(OPENROUTER_TRANSCRIPTION_URL)
        .bearer_auth(api_key)
        .header("Content-Type", "application/json")
        .json(&json!({
            "input_audio": {
                "data": audio_data,
                "format": audio_extension(&input.mime_type),
            },
            "model": model,
        }))
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => return AppResult::err("VOICE_PROVIDER_ERROR", error.to_string()),
    };

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return AppResult::err(
            "VOICE_PROVIDER_ERROR",
            format!("openrouter transcription failed with {status}: {body}"),
        );
    }

    let body = match response.json::<TranscriptionResponse>().await {
        Ok(body) => body,
        Err(error) => return AppResult::err("VOICE_PROVIDER_ERROR", error.to_string()),
    };

    AppResult::ok(TranscribeVoiceCommandResult {
        transcript: body.text.trim().to_string(),
        engine: "openrouter".to_string(),
        model: model.to_string(),
        confidence: None,
    })
}

async fn transcribe_online(
    url: &str,
    model: &str,
    engine: &str,
    key_user: &str,
    input: &TranscribeVoiceCommandInput,
    online_allowed: bool,
    privacy_acknowledged: bool,
) -> AppResult<TranscribeVoiceCommandResult> {
    if !online_allowed || !privacy_acknowledged {
        return AppResult::err(
            "VOICE_ONLINE_DISABLED",
            "Online voice transcription is disabled until online voice use and privacy acknowledgement are enabled in Settings.",
        );
    }

    let api_key = match get_key(key_user) {
        Ok(value) => value,
        Err(_error) => {
            return AppResult::err(
                "VOICE_PROVIDER_KEY_MISSING",
                format!("No API key is stored for {engine}. Connect the provider key first."),
            )
        }
    };

    let extension = audio_extension(&input.mime_type);
    let part = match multipart::Part::bytes(input.audio_bytes.clone())
        .file_name(format!("worktrace-voice.{extension}"))
        .mime_str(&input.mime_type)
    {
        Ok(part) => part,
        Err(error) => return AppResult::err("VOICE_AUDIO_INVALID", error.to_string()),
    };
    let form = multipart::Form::new()
        .text("model", model.to_string())
        .part("file", part);

    let response = match Client::new()
        .post(url)
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => return AppResult::err("VOICE_PROVIDER_ERROR", error.to_string()),
    };

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return AppResult::err(
            "VOICE_PROVIDER_ERROR",
            format!("{engine} transcription failed with {status}: {body}"),
        );
    }

    let body = match response.json::<TranscriptionResponse>().await {
        Ok(body) => body,
        Err(error) => return AppResult::err("VOICE_PROVIDER_ERROR", error.to_string()),
    };

    AppResult::ok(TranscribeVoiceCommandResult {
        transcript: body.text.trim().to_string(),
        engine: engine.to_string(),
        model: model.to_string(),
        confidence: None,
    })
}

fn audio_extension(mime_type: &str) -> &'static str {
    if mime_type.contains("ogg") {
        "ogg"
    } else if mime_type.contains("wav") {
        "wav"
    } else if mime_type.contains("mp4") {
        "mp4"
    } else {
        "webm"
    }
}

fn get_key(user: &str) -> Result<String, keyring::Error> {
    Entry::new(KEYRING_SERVICE, user)?.get_password()
}

#[derive(Debug, Deserialize)]
struct TranscriptionResponse {
    text: String,
}

#[cfg(test)]
mod tests {
    use super::parse_whisper_transcript;

    #[test]
    fn parse_whisper_transcript_keeps_timestamped_text() {
        let output = "[00:00:00.000 --> 00:00:02.000] add task finish release notes\n";
        assert_eq!(
            parse_whisper_transcript(output),
            "add task finish release notes"
        );
    }

    #[test]
    fn parse_whisper_transcript_keeps_plain_text() {
        assert_eq!(
            parse_whisper_transcript("add task finish release notes\n"),
            "add task finish release notes"
        );
    }

    #[test]
    fn parse_whisper_transcript_ignores_diagnostics() {
        let output = "whisper_init_from_file: loading model\n[00:00:00.000 --> 00:00:02.000] add task finish release notes\n";
        assert_eq!(
            parse_whisper_transcript(output),
            "add task finish release notes"
        );
    }
}
