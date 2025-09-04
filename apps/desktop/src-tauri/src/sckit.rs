#[cfg(target_os = "macos")]
pub mod macos {
    use tauri::Manager;
    use once_cell::sync::Lazy;
    use core_media_rs::cm_sample_buffer::CMSampleBuffer;
    use screencapturekit::{
        shareable_content::SCShareableContent,
        stream::{
            configuration::SCStreamConfiguration,
            content_filter::SCContentFilter,
            output_trait::SCStreamOutputTrait,
            output_type::SCStreamOutputType,
            SCStream,
        },
    };
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    };
    use crossbeam_channel as channel;

    static STREAM_HOLDER: Lazy<Mutex<Option<SCStream>>> = Lazy::new(|| Mutex::new(None));
    static RUNNING: AtomicBool = AtomicBool::new(false);

    struct AudioOutput {
        tx: channel::Sender<Vec<f32>>,
        sample_rate: u32,
    }
    impl SCStreamOutputTrait for AudioOutput {
        fn did_output_sample_buffer(&self, sample: CMSampleBuffer, of_type: SCStreamOutputType) {
            if let SCStreamOutputType::Audio = of_type {
                if let Ok(list) = sample.get_audio_buffer_list() {
                    let mut out: Vec<f32> = Vec::new();
                    for buf in list.buffers() {
                        let bytes = buf.data();
                        let mut i = 0;
                        while i + 3 < bytes.len() {
                            let v = f32::from_le_bytes([bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]]);
                            if v.is_finite() { out.push(v); }
                            i += 4;
                        }
                    }
                    if !out.is_empty() { let _ = self.tx.try_send(out); }
                }
            }
        }
    }

    pub async fn start_system_audio_capture(app_handle: tauri::AppHandle) -> Result<(), String> {
        // Avoid double-start
        if RUNNING.swap(true, Ordering::SeqCst) {
            return Ok(());
        }

        // Build SCKit stream for current display with audio enabled
        let display = SCShareableContent::get()
            .map_err(|e| format!("SCShareableContent error: {e:?}"))?
            .displays()
            .into_iter()
            .next()
            .ok_or_else(|| "No displays available for ScreenCaptureKit".to_string())?;
        let filter = SCContentFilter::new().with_display_excluding_windows(&display, &[]);
        let config = SCStreamConfiguration::new()
            .set_captures_audio(true)
            .map_err(|e| format!("SCK set_captures_audio failed: {e:?}"))?
            .set_sample_rate(48_000)
            .map_err(|e| format!("SCK set_sample_rate failed: {e:?}"))?
            .set_channel_count(1)
            .map_err(|e| format!("SCK set_channel_count failed: {e:?}"))?
            .set_width(1)
            .and_then(|c| c.set_height(1))
            .map_err(|e| format!("SCK set dimensions failed: {e:?}"))?;

        // Channel to decouple SCK callback from emission aggregator
        let (tx, rx) = channel::bounded::<Vec<f32>>(4);

        // Aggregator to emit ~20ms frames consistently
        let sr = config.get_sample_rate();
        let frame_len = (sr as usize / 50).max(1);
        let running_ref = Arc::new(AtomicBool::new(true));
        let running_emit = running_ref.clone();
        let app_handle_emit = app_handle.clone();
        std::thread::spawn(move || {
            let mut buf: Vec<f32> = Vec::with_capacity(frame_len * 2);
            while running_emit.load(Ordering::Relaxed) {
                match rx.recv_timeout(std::time::Duration::from_millis(50)) {
                    Ok(mut chunk) => {
                        buf.append(&mut chunk);
                    }
                    Err(_) => {}
                }
                while buf.len() >= frame_len {
                    let frame: Vec<f32> = buf.drain(0..frame_len).collect();
                    let _ = app_handle_emit.emit_all(
                        "audio:frame",
                        serde_json::json!({
                            "data": frame,
                            "timestamp": std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap()
                                .as_millis(),
                            "sample_rate": sr
                        }),
                    );
                }
            }
        });

        // Create stream and start
        let mut stream = SCStream::new(&filter, &config);
        stream.add_output_handler(AudioOutput { tx, sample_rate: sr }, SCStreamOutputType::Audio);
        stream
            .start_capture()
            .map_err(|e| format!("SCK start failed: {e:?}"))?;

        // Hold onto stream so it stays alive
        *STREAM_HOLDER.lock().unwrap() = Some(stream);
        Ok(())
    }

    pub async fn stop_system_audio_capture() -> Result<(), String> {
        RUNNING.store(false, Ordering::SeqCst);
        if let Some(stream) = STREAM_HOLDER.lock().unwrap().take() {
            let _ = stream.stop_capture();
        }
        Ok(())
    }

    pub fn check_permission() -> Result<bool, String> {
        match SCShareableContent::get() {
            Ok(_) => Ok(true),
            Err(e) => {
                eprintln!("SCKit permission check error: {:?}", e);
                Ok(false)
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub mod macos {
    pub async fn start_system_audio_capture(_app_handle: tauri::AppHandle) -> Result<(), String> {
        Err("ScreenCaptureKit is only available on macOS".to_string())
    }
    pub async fn stop_system_audio_capture() -> Result<(), String> { Ok(()) }
    pub fn check_permission() -> Result<bool, String> { Ok(false) }
}
