use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct AppResult<T>
where
    T: Serialize,
{
    pub ok: bool,
    pub data: Option<T>,
    pub error: Option<AppErrorDto>,
}

#[derive(Debug, Serialize)]
pub struct AppErrorDto {
    pub code: String,
    pub message: String,
    pub details: Option<serde_json::Value>,
}

impl<T> AppResult<T>
where
    T: Serialize,
{
    pub fn ok(data: T) -> Self {
        Self {
            ok: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            ok: false,
            data: None,
            error: Some(AppErrorDto {
                code: code.into(),
                message: message.into(),
                details: None,
            }),
        }
    }
}
