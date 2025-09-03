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
    pub chunk_seconds: f32,
    pub summary_engine: String, // 'ollama' | 'anthropic' | 'openai' | 'none'
    pub ollama_model: String,
    pub ollama_host: String,
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
            chunk_seconds: 2.5,
            summary_engine: "ollama".to_string(),
            ollama_model: "llama3.1:8b-instruct-q4_K_M".to_string(),
            ollama_host: "http://127.0.0.1:11434".to_string(),
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
                chunk_seconds REAL DEFAULT 2.5,
                summary_engine TEXT DEFAULT 'ollama',
                ollama_model TEXT DEFAULT 'llama3.1:8b-instruct-q4_K_M',
                ollama_host TEXT DEFAULT 'http://127.0.0.1:11434',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        "#).execute(&pool).await?;

        // Best-effort schema upgrade for existing installs: add chunk_seconds if missing
        let _ = sqlx::query("ALTER TABLE settings ADD COLUMN chunk_seconds REAL DEFAULT 2.5")
            .execute(&pool)
            .await;
        let _ = sqlx::query("ALTER TABLE settings ADD COLUMN summary_engine TEXT DEFAULT 'ollama'")
            .execute(&pool)
            .await;
        let _ = sqlx::query("ALTER TABLE settings ADD COLUMN ollama_model TEXT DEFAULT 'llama3.1:8b-instruct-q4_K_M'")
            .execute(&pool)
            .await;
        let _ = sqlx::query("ALTER TABLE settings ADD COLUMN ollama_host TEXT DEFAULT 'http://127.0.0.1:11434'")
            .execute(&pool)
            .await;

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

        // Add optional folder_id column to sessions if not present
        let _ = sqlx::query("ALTER TABLE sessions ADD COLUMN folder_id TEXT")
            .execute(&pool)
            .await;

        // Folders table
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                name TEXT NOT NULL UNIQUE,
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
                chunk_seconds: row.try_get("chunk_seconds").unwrap_or(2.5f32),
                summary_engine: row.try_get("summary_engine").unwrap_or("ollama".to_string()),
                ollama_model: row.try_get("ollama_model").unwrap_or("llama3.1:8b-instruct-q4_K_M".to_string()),
                ollama_host: row.try_get("ollama_host").unwrap_or("http://127.0.0.1:11434".to_string()),
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
                id, enable_telemetry, retention_days, use_gpu, model, enable_hubspot, enable_gmail, chunk_seconds, summary_engine, ollama_model, ollama_host, updated_at
            ) VALUES (
                (SELECT id FROM settings LIMIT 1), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
            )
        "#)
        .bind(&settings.enable_telemetry)
        .bind(&settings.retention_days)
        .bind(&settings.use_gpu)
        .bind(&settings.model)
        .bind(&settings.enable_hubspot)
        .bind(&settings.enable_gmail)
        .bind(&settings.chunk_seconds)
        .bind(&settings.summary_engine)
        .bind(&settings.ollama_model)
        .bind(&settings.ollama_host)
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

    pub async fn save_session(&self, title: &str, duration: i32, transcript: &str) -> Result<String, sqlx::Error> {
        let id = uuid::Uuid::new_v4().to_string();
        
        sqlx::query(r#"
            INSERT INTO sessions (id, title, duration, transcript) VALUES (?, ?, ?, ?)
        "#)
        .bind(&id)
        .bind(title)
        .bind(duration)
        .bind(transcript)
        .execute(&self.pool)
        .await?;

        Ok(id)
    }

    pub async fn update_session_transcript(&self, session_id: &str, transcript: &str) -> Result<(), sqlx::Error> {
        sqlx::query(r#"
            UPDATE sessions SET transcript = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        "#)
        .bind(transcript)
        .bind(session_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn update_session_summary(&self, session_id: &str, summary: &str) -> Result<(), sqlx::Error> {
        sqlx::query(r#"
            UPDATE sessions SET summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        "#)
        .bind(summary)
        .bind(session_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_session(&self, session_id: &str) -> Result<Option<SessionRecord>, sqlx::Error> {
        let row = sqlx::query("SELECT * FROM sessions WHERE id = ?")
            .bind(session_id)
            .fetch_optional(&self.pool)
            .await?;

        match row {
            Some(row) => Ok(Some(SessionRecord {
                id: row.get("id"),
                title: row.get("title"),
                date: row.get("date"),
                duration: row.get("duration"),
                transcript: row.get("transcript"),
                summary: row.get("summary"),
                artifacts: row.get("artifacts"),
                folder_id: row.try_get("folder_id").ok(),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
            })),
            None => Ok(None),
        }
    }

    pub async fn list_sessions(&self, limit: Option<i32>) -> Result<Vec<SessionRecord>, sqlx::Error> {
        let limit_value = limit.unwrap_or(50);
        let rows = sqlx::query("SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?")
            .bind(limit_value)
            .fetch_all(&self.pool)
            .await?;

        let sessions = rows
            .into_iter()
            .map(|row| SessionRecord {
                id: row.get("id"),
                title: row.get("title"),
                date: row.get("date"),
                duration: row.get("duration"),
                transcript: row.get("transcript"),
                summary: row.get("summary"),
                artifacts: row.get("artifacts"),
                folder_id: row.try_get("folder_id").ok(),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
            })
            .collect();

        Ok(sessions)
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionRecord {
    pub id: String,
    pub title: String,
    pub date: String,
    pub duration: i32,
    pub transcript: Option<String>,
    pub summary: Option<String>,
    pub artifacts: Option<String>,
    pub folder_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FolderRecord {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

impl Database {
    pub async fn create_folder(&self, name: &str) -> Result<String, sqlx::Error> {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(r#"INSERT INTO folders (id, name) VALUES (?, ?)"#)
            .bind(&id)
            .bind(name)
            .execute(&self.pool)
            .await?;
        Ok(id)
    }

    pub async fn list_folders(&self) -> Result<Vec<FolderRecord>, sqlx::Error> {
        let rows = sqlx::query("SELECT * FROM folders ORDER BY name ASC")
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.into_iter().map(|row| FolderRecord {
            id: row.get("id"),
            name: row.get("name"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        }).collect())
    }

    pub async fn assign_session_folder(&self, session_id: &str, folder_id: Option<&str>) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE sessions SET folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(folder_id)
            .bind(session_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
