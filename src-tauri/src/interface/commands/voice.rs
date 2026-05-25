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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeVoiceCommandInput {
    pub audio_bytes: Vec<u8>,
    pub mime_type: String,
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

    let resource_dir = match app.path().resource_dir() {
        Ok(path) => path,
        Err(error) => {
            return Ok(AppResult::err(
                "VOICE_RESOURCE_DIR_UNAVAILABLE",
                error.to_string(),
            ))
        }
    };

    let voice_dirs = [
        resource_dir.join("voice"),
        resource_dir.join("resources").join("voice"),
    ];
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

    let model_path = find_first_existing(
        &voice_dirs
            .iter()
            .map(|dir| dir.join("ggml-base.bin"))
            .collect::<Vec<_>>(),
    );
    let Some(model_path) = model_path else {
        return Ok(AppResult::err(
            "VOICE_MODEL_MISSING",
            "The Whisper base model is missing. Add ggml-base.bin to bundled resources under voice/ggml-base.bin.",
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

    let output = Command::new(&sidecar_path)
        .arg("-m")
        .arg(&model_path)
        .arg("-f")
        .arg(audio_file.path())
        .arg("-nt")
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Ok(AppResult::err(
            "VOICE_TRANSCRIPTION_FAILED",
            if stderr.is_empty() {
                "Whisper could not transcribe the captured audio.".to_string()
            } else {
                stderr
            },
        ));
    }

    let transcript = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('['))
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string();

    Ok(AppResult::ok(TranscribeVoiceCommandResult {
        transcript,
        engine: "whisper.cpp".to_string(),
        model: "base".to_string(),
        confidence: None,
    }))
}

fn find_first_existing(paths: &[PathBuf]) -> Option<PathBuf> {
    paths.iter().find(|path| path.exists()).cloned()
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
