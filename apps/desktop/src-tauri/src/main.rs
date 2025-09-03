#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::Manager;
use tauri::{GlobalShortcutManager, State};

mod audio;
mod database;
mod transcribe;

use audio::{AudioRuntime, AudioSource};
use database::{Database, Settings, SessionRecord};
use transcribe::Transcriber;
use std::sync::Arc;
use tokio::sync::Mutex;

#[cfg(target_os = "macos")]
mod permissions;

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
    #[cfg(target_os = "macos")]
    {
        // Check microphone permission before starting
        let permission_status = permissions::check_microphone_permission()?;
        match permission_status.as_str() {
            "granted" => {
                // Permission granted, proceed with recording
            },
            "denied" => {
                return Err("Microphone permission denied. Please enable it in System Preferences > Security & Privacy > Microphone.".to_string());
            },
            "undetermined" => {
                // Request permission
                let granted = permissions::request_microphone_permission().await?;
                if !granted {
                    return Err("Microphone permission is required to record audio.".to_string());
                }
            },
            _ => {
                return Err("Unable to determine microphone permission status.".to_string());
            }
        }
    }
    
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
    transcriber.initialize(Some("ggml-base.en.bin")).await
}

#[tauri::command]
async fn download_whisper_model(model_name: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut transcriber = state.transcriber.lock().await;
    transcriber.download_model_from_hf(&model_name).await
}

#[tauri::command]
async fn transcribe_audio(audio_frames: Vec<f32>, sample_rate: Option<u32>, state: State<'_, AppState>) -> Result<String, String> {
    let mut transcriber = state.transcriber.lock().await;
    if !transcriber.is_initialized() {
        println!("Transcriber not initialized; attempting lazy initialization...");
        // Try default selection; initialize() will search for an available model
        match transcriber.initialize(None).await {
            Ok(()) => println!("✅ Lazy initialization successful"),
            Err(e) => {
                eprintln!("❌ Lazy initialization failed: {}", e);
                return Err(e);
            }
        }
    }
    let sr = sample_rate.unwrap_or(16_000);
    transcriber.transcribe_audio_data(&audio_frames, sr).await
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

#[tauri::command]
async fn update_session_summary(session_id: String, summary: String, app_handle: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    ensure_database(&app_handle, &state).await?;
    let db_guard = state.database.lock().await;
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .update_session_summary(&session_id, &summary)
        .await
        .map_err(|e| format!("Failed to update session summary: {}", e))
}

#[tauri::command]
async fn create_folder(name: String, app_handle: tauri::AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    ensure_database(&app_handle, &state).await?;
    let db_guard = state.database.lock().await;
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database.create_folder(&name).await.map_err(|e| format!("Failed to create folder: {}", e))
}

#[tauri::command]
async fn list_folders(app_handle: tauri::AppHandle, state: State<'_, AppState>) -> Result<Vec<database::FolderRecord>, String> {
    ensure_database(&app_handle, &state).await?;
    let db_guard = state.database.lock().await;
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database.list_folders().await.map_err(|e| format!("Failed to list folders: {}", e))
}

#[tauri::command]
async fn assign_session_folder(session_id: String, folder_id: Option<String>, app_handle: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    ensure_database(&app_handle, &state).await?;
    let db_guard = state.database.lock().await;
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let folder_id_ref = folder_id.as_deref();
    database.assign_session_folder(&session_id, folder_id_ref).await.map_err(|e| format!("Failed to assign folder: {}", e))
}

#[tauri::command]
async fn get_env_var(name: String) -> Result<Option<String>, String> {
    Ok(std::env::var(&name).ok())
}

#[tauri::command]
async fn store_summary_preference(
    state: State<'_, AppState>,
    session_id: String,
    variant_id: String,
    rating: i32,
    chosen: bool,
    feedback: Option<String>
) -> Result<String, String> {
    let db_guard = state.database.lock().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    
    // For now we'll just log this since we'd need to implement the full database methods
    // In a full implementation, you'd add these methods to the Database struct
    println!("Storing preference: session_id={}, variant_id={}, rating={}, chosen={}, feedback={:?}", 
             session_id, variant_id, rating, chosen, feedback);
    
    // Return a success ID
    Ok("preference_stored".to_string())
}

#[cfg(target_os = "macos")]
#[tauri::command]
async fn check_microphone_permission() -> Result<String, String> {
    permissions::check_microphone_permission()
}

#[cfg(target_os = "macos")]
#[tauri::command]
async fn request_microphone_permission() -> Result<bool, String> {
    permissions::request_microphone_permission().await
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn check_microphone_permission() -> Result<String, String> {
    Ok("granted".to_string())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn request_microphone_permission() -> Result<bool, String> {
    Ok(true)
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
            update_session_summary,
            initialize_transcriber,
            download_whisper_model,
            transcribe_audio,
            save_session,
            get_session,
            list_sessions,
            create_folder,
            list_folders,
            assign_session_folder,
            get_env_var,
            store_summary_preference,
            check_microphone_permission,
            request_microphone_permission
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
