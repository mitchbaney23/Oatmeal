use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::Manager;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use crossbeam_channel as channel;

pub struct RealAudioCapture {
    is_capturing: Arc<AtomicBool>,
    stream: Option<cpal::Stream>,
}

impl RealAudioCapture {
    pub fn new() -> Self {
        Self {
            is_capturing: Arc::new(AtomicBool::new(false)),
            stream: None,
        }
    }

    pub fn start_capture(&mut self, app_handle: tauri::AppHandle) -> Result<(), String> {
        if self.is_capturing.load(Ordering::Relaxed) {
            return Err("Already capturing".to_string());
        }

        // Set capturing flag
        self.is_capturing.store(true, Ordering::Relaxed);
        let is_capturing = self.is_capturing.clone();

        // Resolve default input device
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or_else(|| "No default input device available".to_string())?;

        // Try to choose a 16kHz mono config if supported; otherwise fallback to default config
        let desired_rate = cpal::SampleRate(16000);
        let mut chosen_config: Option<cpal::SupportedStreamConfig> = None;
        if let Ok(mut configs) = device.supported_input_configs() {
            for cfg in configs.by_ref() {
                if cfg.channels() == 1
                    && cfg.min_sample_rate() <= desired_rate
                    && cfg.max_sample_rate() >= desired_rate
                {
                    chosen_config = Some(cfg.with_sample_rate(desired_rate));
                    break;
                }
            }
            // If we didn't find exact 16kHz mono, pick default input config
            if chosen_config.is_none() {
                if let Ok(default_cfg) = device.default_input_config() {
                    chosen_config = Some(default_cfg);
                }
            }
        } else if let Ok(default_cfg) = device.default_input_config() {
            chosen_config = Some(default_cfg);
        }

        let config = chosen_config.ok_or_else(|| "Failed to determine input config".to_string())?;
        let sample_format = config.sample_format();
        let config: cpal::StreamConfig = config.into();

        let channels = config.channels as usize;
        let sample_rate = config.sample_rate.0 as usize;

        // Channel to shuttle samples out of the realtime audio callback
        let (tx, rx) = channel::bounded::<f32>(sample_rate * 2); // ~2s buffer

        // Spawn worker to aggregate ~20ms frames and emit to frontend
        let app_handle_clone = app_handle.clone();
        let is_capturing_worker = is_capturing.clone();
        thread::spawn(move || {
            let frame_len = (sample_rate / 50).max(1); // ~20ms
            let mut buf: Vec<f32> = Vec::with_capacity(frame_len * 2);

            while is_capturing_worker.load(Ordering::Relaxed) {
                // Block until we get at least one sample or channel disconnects
                match rx.recv() {
                    Ok(s) => buf.push(s),
                    Err(_) => break, // stream dropped or stopped
                }

                // Drain any additional samples quickly
                while let Ok(s) = rx.try_recv() {
                    buf.push(s);
                    if buf.len() >= frame_len {
                        break;
                    }
                }

                // Emit fixed-size frames
                while buf.len() >= frame_len {
                    let frame: Vec<f32> = buf.drain(0..frame_len).collect();
                    let _ = app_handle_clone.emit_all(
                        "audio:frame",
                        serde_json::json!({
                            "data": frame,
                            "timestamp": std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap()
                                .as_millis(),
                            "sample_rate": sample_rate as u32
                        }),
                    );
                }
            }

            // Flush remaining samples if any
            if !buf.is_empty() {
                let _ = app_handle_clone.emit_all(
                    "audio:frame",
                    serde_json::json!({
                        "data": buf,
                        "timestamp": std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_millis(),
                        "sample_rate": sample_rate as u32
                    }),
                );
            }
            println!("Audio capture worker exited");
        });

        // Build input stream according to sample format, downmixing to mono if needed
        let stream = match sample_format {
            cpal::SampleFormat::F32 => {
                let tx = tx.clone();
                device
                    .build_input_stream(
                        &config,
                        move |data: &[f32], _| {
                            if !is_capturing.load(Ordering::Relaxed) {
                                return;
                            }
                            if channels == 1 {
                                for &s in data {
                                    let _ = tx.try_send(s);
                                }
                            } else {
                                // Downmix to mono
                                for frame in data.chunks_exact(channels) {
                                    let sum: f32 = frame.iter().copied().sum();
                                    let avg = sum / channels as f32;
                                    let _ = tx.try_send(avg);
                                }
                            }
                        },
                        move |err| {
                            eprintln!("Audio input stream error: {}", err);
                        },
                        None,
                    )
                    .map_err(|e| format!("Failed to build input stream (f32): {}", e))?
            }
            cpal::SampleFormat::I16 => {
                let tx = tx.clone();
                device
                    .build_input_stream(
                        &config,
                        move |data: &[i16], _| {
                            if !is_capturing.load(Ordering::Relaxed) {
                                return;
                            }
                            if channels == 1 {
                                for &s in data {
                                    let _ = tx.try_send(s as f32 / i16::MAX as f32);
                                }
                            } else {
                                for frame in data.chunks_exact(channels) {
                                    let mut sum = 0.0f32;
                                    for &s in frame {
                                        sum += s as f32 / i16::MAX as f32;
                                    }
                                    let avg = sum / channels as f32;
                                    let _ = tx.try_send(avg);
                                }
                            }
                        },
                        move |err| {
                            eprintln!("Audio input stream error: {}", err);
                        },
                        None,
                    )
                    .map_err(|e| format!("Failed to build input stream (i16): {}", e))?
            }
            cpal::SampleFormat::U16 => {
                let tx = tx.clone();
                device
                    .build_input_stream(
                        &config,
                        move |data: &[u16], _| {
                            if !is_capturing.load(Ordering::Relaxed) {
                                return;
                            }
                            let to_f32 = |v: u16| (v as f32 / u16::MAX as f32) * 2.0 - 1.0;
                            if channels == 1 {
                                for &s in data {
                                    let _ = tx.try_send(to_f32(s));
                                }
                            } else {
                                for frame in data.chunks_exact(channels) {
                                    let mut sum = 0.0f32;
                                    for &s in frame {
                                        sum += to_f32(s);
                                    }
                                    let avg = sum / channels as f32;
                                    let _ = tx.try_send(avg);
                                }
                            }
                        },
                        move |err| {
                            eprintln!("Audio input stream error: {}", err);
                        },
                        None,
                    )
                    .map_err(|e| format!("Failed to build input stream (u16): {}", e))?
            }
            _ => return Err("Unsupported sample format".to_string()),
        };

        stream
            .play()
            .map_err(|e| format!("Failed to start input stream: {}", e))?;

        self.stream = Some(stream);
        println!(
            "Started real audio capture ({} Hz, {} ch)",
            sample_rate, channels
        );
        Ok(())
    }

    pub fn stop_capture(&mut self) -> Result<(), String> {
        self.is_capturing.store(false, Ordering::Relaxed);
        // Dropping the stream will disconnect the channel and end worker thread
        self.stream = None;
        println!("Stopped real audio capture");
        Ok(())
    }

    pub fn is_capturing(&self) -> bool {
        self.is_capturing.load(Ordering::Relaxed)
    }
}
