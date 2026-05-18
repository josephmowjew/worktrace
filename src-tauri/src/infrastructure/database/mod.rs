use std::fmt::{Display, Formatter};
use std::path::PathBuf;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use tauri::Manager;

pub mod migrations;
pub mod repositories;
pub mod schema;

use migrations::run_migrations;
use schema::DATABASE_FILE_NAME;

#[derive(Clone)]
pub struct Database {
    pool: SqlitePool,
    path: PathBuf,
}

impl Database {
    pub async fn connect(app: &tauri::AppHandle) -> Result<Self, DatabaseError> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|source| DatabaseError::ResolveAppDataDir(source.to_string()))?;

        std::fs::create_dir_all(&app_data_dir).map_err(|source| {
            DatabaseError::CreateAppDataDir {
                path: app_data_dir.clone(),
                source,
            }
        })?;

        let path = app_data_dir.join(DATABASE_FILE_NAME);
        let options = SqliteConnectOptions::new()
            .filename(&path)
            .create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await
            .map_err(DatabaseError::Connect)?;

        run_migrations(&pool)
            .await
            .map_err(DatabaseError::Migrate)?;

        Ok(Self { pool, path })
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub fn path(&self) -> &PathBuf {
        &self.path
    }
}

#[derive(Debug)]
pub enum DatabaseError {
    ResolveAppDataDir(String),
    CreateAppDataDir {
        path: PathBuf,
        source: std::io::Error,
    },
    Connect(sqlx::Error),
    Migrate(sqlx::Error),
}

impl Display for DatabaseError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ResolveAppDataDir(source) => {
                write!(
                    formatter,
                    "failed to resolve WorkTrace app data directory: {source}"
                )
            }
            Self::CreateAppDataDir { path, source } => {
                write!(
                    formatter,
                    "failed to create WorkTrace app data directory at {}: {source}",
                    path.display()
                )
            }
            Self::Connect(source) => {
                write!(formatter, "failed to open WorkTrace database: {source}")
            }
            Self::Migrate(source) => {
                write!(formatter, "failed to migrate WorkTrace database: {source}")
            }
        }
    }
}

impl std::error::Error for DatabaseError {}
