use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioFrame {
    pub data: Vec<i16>,
    pub timestamp: u64,
    pub sample_rate: u32,
}

pub struct SimpleAudioCapture {
    is_capturing: Arc<Mutex<bool>>,
}

impl SimpleAudioCapture {
    pub fn new() -> Self {
        Self {
            is_capturing: Arc::new(Mutex::new(false)),
        }
    }

    pub fn start_capture(&self, app_handle: tauri::AppHandle) -> Result<(), String> {
        let is_capturing = Arc::clone(&self.is_capturing);
        *is_capturing.lock().unwrap() = true;

        // Spawn a simple audio simulation for now
        let app_handle_clone = app_handle.clone();
        std::thread::spawn(move || {
            let mut frame_count = 0;
            while *is_capturing.lock().unwrap() {
                // Simulate 20ms audio frames (320 samples at 16kHz)
                let mock_data: Vec<i16> = (0..320)
                    .map(|i| ((i as f32 * 0.1).sin() * 1000.0) as i16)
                    .collect();

                let frame = AudioFrame {
                    data: mock_data,
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64,
                    sample_rate: 16000,
                };

                // Emit frame to frontend
                let _ = app_handle_clone.emit_all("audio:frame", &frame);

                frame_count += 1;
                if frame_count % 50 == 0 {
                    println!("Captured {} frames", frame_count);
                }

                // 20ms delay
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            println!("Audio capture thread stopped");
        });

        println!("Simple audio capture started");
        Ok(())
    }

    pub fn stop_capture(&self) -> Result<(), String> {
        *self.is_capturing.lock().unwrap() = false;
        println!("Simple audio capture stopped");
        Ok(())
    }

    pub fn is_capturing(&self) -> bool {
        *self.is_capturing.lock().unwrap()
    }
}