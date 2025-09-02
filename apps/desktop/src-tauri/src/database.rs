use serde::{Deserialize, Serialize};
use sqlx::{SqlitePool, Row};
use sqlx::sqlite::SqliteConnectOptions;
use std::str::FromStr;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct Settings {
    pub enable_telemetry: bool,
    pub retention_days: i32,
    pub use_gpu: bool,
    pub model: String,
    pub enable_hubspot: bool,
    pub enable_gmail: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            enable_telemetry: true,
            retention_days: 30,
            use_gpu: false,
            model: "claude-3-5-sonnet".to_string(),
            enable_hubspot: false,
            enable_gmail: false,
        }
    }
}

pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn new(db_path: &str) -> Result<Self, sqlx::Error> {
        // Ensure parent directory exists
        if let Some(parent) = Path::new(db_path).parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                sqlx::Error::Io(std::io::Error::new(std::io::ErrorKind::Other, e))
            })?;
        }

        // Use explicit connect options to ensure file is created and path is handled correctly
        let options = SqliteConnectOptions::from_str(&format!("sqlite://{}", db_path))
            .map_err(|e| sqlx::Error::Protocol(format!("invalid sqlite path: {}", e).into()))?
            .create_if_missing(true);
        let pool = SqlitePool::connect_with(options).await?;
        
        // Create tables
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS settings (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                enable_telemetry BOOLEAN DEFAULT 1,
                retention_days INTEGER DEFAULT 30,
                use_gpu BOOLEAN DEFAULT 0,
                model TEXT DEFAULT 'claude-3-5-sonnet',
                enable_hubspot BOOLEAN DEFAULT 0,
                enable_gmail BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        "#).execute(&pool).await?;

        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                title TEXT NOT NULL,
                date DATETIME DEFAULT CURRENT_TIMESTAMP,
                duration INTEGER NOT NULL,
                transcript TEXT,
                summary TEXT,
                artifacts TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        "#).execute(&pool).await?;

        Ok(Self { pool })
    }

    pub async fn get_settings(&self) -> Result<Settings, sqlx::Error> {
        let row = sqlx::query("SELECT * FROM settings LIMIT 1")
            .fetch_optional(&self.pool)
            .await?;

        match row {
            Some(row) => Ok(Settings {
                enable_telemetry: row.get("enable_telemetry"),
                retention_days: row.get("retention_days"),
                use_gpu: row.get("use_gpu"),
                model: row.get("model"),
                enable_hubspot: row.get("enable_hubspot"),
                enable_gmail: row.get("enable_gmail"),
            }),
            None => {
                // Insert default settings
                let default_settings = Settings::default();
                self.update_settings(&default_settings).await?;
                Ok(default_settings)
            }
        }
    }

    pub async fn update_settings(&self, settings: &Settings) -> Result<(), sqlx::Error> {
        sqlx::query(r#"
            INSERT OR REPLACE INTO settings (
                id, enable_telemetry, retention_days, use_gpu, model, enable_hubspot, enable_gmail, updated_at
            ) VALUES (
                (SELECT id FROM settings LIMIT 1), ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
            )
        "#)
        .bind(&settings.enable_telemetry)
        .bind(&settings.retention_days)
        .bind(&settings.use_gpu)
        .bind(&settings.model)
        .bind(&settings.enable_hubspot)
        .bind(&settings.enable_gmail)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn create_session(&self, title: &str, duration: i32) -> Result<String, sqlx::Error> {
        let id = uuid::Uuid::new_v4().to_string();
        
        sqlx::query(r#"
            INSERT INTO sessions (id, title, duration) VALUES (?, ?, ?)
        "#)
        .bind(&id)
        .bind(title)
        .bind(duration)
        .execute(&self.pool)
        .await?;

        Ok(id)
    }
}
