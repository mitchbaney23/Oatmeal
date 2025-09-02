#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::Manager;
use tauri::{GlobalShortcutManager, State};

mod audio;
mod database;
mod transcribe;

use audio::runtime::AudioRuntime;
use database::{Database, Settings, SessionRecord};
use transcribe::Transcriber;
use std::sync::Arc;
use tokio::sync::Mutex;

struct AppState {
    audio_capture: AudioRuntime,
    database: Arc<Mutex<Option<Database>>>,
    transcriber: Arc<Mutex<Transcriber>>,
}

#[tauri::command]
async fn initialize_app(app_handle: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    // Initialize database
    let db_path = app_handle.path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| std::env::current_dir().unwrap())
        .join("oatmeal.db");
    
    let database = Database::new(db_path.to_str().unwrap())
        .await
        .map_err(|e| format!("Failed to initialize database: {}", e))?;
    
    *state.database.lock().await = Some(database);

    let mut shortcut_manager = app_handle.global_shortcut_manager();
    
    // Register global shortcuts
    let app_handle_clone = app_handle.clone();
    shortcut_manager
        .register("CmdOrCtrl+Shift+R", move || {
            let _ = app_handle_clone.emit_all("toggle-recording", ());
        })
        .map_err(|e| format!("Failed to register shortcut: {}", e))?;

    let app_handle_clone = app_handle.clone();
    shortcut_manager
        .register("CmdOrCtrl+Shift+N", move || {
            let _ = app_handle_clone.emit_all("quick-note", ());
        })
        .map_err(|e| format!("Failed to register shortcut: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn start_recording(app_handle: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.audio_capture.start(app_handle)
}

#[tauri::command]
async fn stop_recording(state: State<'_, AppState>) -> Result<(), String> {
    state.audio_capture.stop()
}

#[tauri::command]
async fn is_recording(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.audio_capture.is_capturing())
}

#[tauri::command]
async fn create_quick_note() -> Result<(), String> {
    println!("Creating quick note");
    Ok(())
}

async fn ensure_database(app_handle: &tauri::AppHandle, state: &State<'_, AppState>) -> Result<(), String> {
    let mut db_guard = state.database.lock().await;
    if db_guard.is_none() {
        let db_path = app_handle
            .path_resolver()
            .app_data_dir()
            .unwrap_or_else(|| std::env::current_dir().unwrap())
            .join("oatmeal.db");

        let database = Database::new(db_path.to_str().ok_or("Invalid DB path")?)
            .await
            .map_err(|e| format!("Failed to initialize database: {}", e))?;
        *db_guard = Some(database);
    }
    Ok(())
}

#[tauri::command]
async fn get_settings(app_handle: tauri::AppHandle, state: State<'_, AppState>) -> Result<Settings, String> {
    ensure_database(&app_handle, &state).await?;

    let db_guard = state.database.lock().await;
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_settings()
        .await
        .map_err(|e| format!("Failed to get settings: {}", e))
}

#[tauri::command]
async fn update_settings(settings: Settings, app_handle: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    ensure_database(&app_handle, &state).await?;

    let db_guard = state.database.lock().await;
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .update_settings(&settings)
        .await
        .map_err(|e| format!("Failed to update settings: {}", e))
}

#[tauri::command]
async fn initialize_transcriber(state: State<'_, AppState>) -> Result<(), String> {
    let mut transcriber = state.transcriber.lock().await;
    transcriber.initialize(Some("openai/whisper-small.en")).await
}

#[tauri::command]
async fn download_whisper_model(model_name: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut transcriber = state.transcriber.lock().await;
    transcriber.download_model_from_hf(&model_name).await
}

#[tauri::command]
async fn transcribe_audio(audio_frames: Vec<f32>, state: State<'_, AppState>) -> Result<String, String> {
    let mut transcriber = state.transcriber.lock().await;
    transcriber.transcribe_audio_data(&audio_frames).await
}

#[tauri::command]
async fn save_session(title: String, duration: i32, transcript: String, app_handle: tauri::AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    ensure_database(&app_handle, &state).await?;

    let db_guard = state.database.lock().await;
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .save_session(&title, duration, &transcript)
        .await
        .map_err(|e| format!("Failed to save session: {}", e))
}

#[tauri::command]
async fn get_session(session_id: String, app_handle: tauri::AppHandle, state: State<'_, AppState>) -> Result<Option<SessionRecord>, String> {
    ensure_database(&app_handle, &state).await?;

    let db_guard = state.database.lock().await;
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_session(&session_id)
        .await
        .map_err(|e| format!("Failed to get session: {}", e))
}

#[tauri::command]
async fn list_sessions(limit: Option<i32>, app_handle: tauri::AppHandle, state: State<'_, AppState>) -> Result<Vec<SessionRecord>, String> {
    ensure_database(&app_handle, &state).await?;

    let db_guard = state.database.lock().await;
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .list_sessions(limit)
        .await
        .map_err(|e| format!("Failed to list sessions: {}", e))
}

fn main() {
    // Load .env if present for API keys, etc.
    let _ = dotenvy::dotenv();
    // System tray disabled for now due to icon issues
    // let quit = CustomMenuItem::new("quit".to_string(), "Quit");
    // let show = CustomMenuItem::new("show".to_string(), "Show");
    // let tray_menu = SystemTrayMenu::new()
    //     .add_item(show)
    //     .add_item(quit);
    // let system_tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .manage(AppState {
            audio_capture: AudioRuntime::new(),
            database: Arc::new(Mutex::new(None)),
            transcriber: Arc::new(Mutex::new(Transcriber::new())),
        })
        .invoke_handler(tauri::generate_handler![
            initialize_app,
            start_recording,
            stop_recording,
            is_recording,
            create_quick_note,
            get_settings,
            update_settings,
            initialize_transcriber,
            download_whisper_model,
            transcribe_audio,
            save_session,
            get_session,
            list_sessions
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
