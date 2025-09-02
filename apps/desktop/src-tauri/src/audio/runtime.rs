use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender, Receiver};
use std::sync::Arc;
use std::thread;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use crossbeam_channel as channel;
use tauri::Manager;

enum Command {
  Start(tauri::AppHandle),
  Stop,
}

pub struct AudioRuntime {
  tx: Sender<Command>,
  is_capturing: Arc<AtomicBool>,
}

impl AudioRuntime {
  pub fn new() -> Self {
    let (tx, rx): (Sender<Command>, Receiver<Command>) = mpsc::channel();
    let is_capturing = Arc::new(AtomicBool::new(false));
    let is_capturing_worker = is_capturing.clone();

    thread::spawn(move || {
      // State owned by the worker thread only
      let mut stream: Option<cpal::Stream> = None;

      // Inner function to start capture with given app handle
      let start_capture = |app_handle: tauri::AppHandle,
                           is_capturing_flag: Arc<AtomicBool>,
                           stream_slot: &mut Option<cpal::Stream>| {
        if is_capturing_flag.load(Ordering::Relaxed) {
          return; // already capturing
        }
        is_capturing_flag.store(true, Ordering::Relaxed);

        // Device selection
        let host = cpal::default_host();
        let device = match host.default_input_device() {
          Some(d) => d,
          None => {
            eprintln!("No default input device available");
            is_capturing_flag.store(false, Ordering::Relaxed);
            return;
          }
        };

        // Config selection (prefer 16k mono if supported)
        let desired_rate = cpal::SampleRate(16000);
        let mut chosen_config: Option<cpal::SupportedStreamConfig> = None;
        if let Ok(configs) = device.supported_input_configs() {
          for cfg in configs {
            if cfg.channels() == 1
              && cfg.min_sample_rate() <= desired_rate
              && cfg.max_sample_rate() >= desired_rate
            {
              chosen_config = Some(cfg.with_sample_rate(desired_rate));
              break;
            }
          }
        }
        if chosen_config.is_none() {
          if let Ok(default_cfg) = device.default_input_config() {
            chosen_config = Some(default_cfg);
          }
        }
        let supported = match chosen_config {
          Some(c) => c,
          None => {
            eprintln!("Failed to determine input config");
            is_capturing_flag.store(false, Ordering::Relaxed);
            return;
          }
        };

        let sample_format = supported.sample_format();
        let config: cpal::StreamConfig = supported.into();
        let channels = config.channels as usize;
        let sample_rate = config.sample_rate.0 as usize;

        // Channel to move samples out of realtime callback
        let (tx_samp, rx_samp) = channel::bounded::<f32>(sample_rate * 2);

        // Aggregator thread to form ~20ms frames and emit
        let is_capturing_emit = is_capturing_flag.clone();
        let app_handle_emit = app_handle.clone();
        thread::spawn(move || {
          let frame_len = (sample_rate / 50).max(1);
          let mut buf: Vec<f32> = Vec::with_capacity(frame_len * 2);

          while is_capturing_emit.load(Ordering::Relaxed) {
            match rx_samp.recv() {
              Ok(s) => buf.push(s),
              Err(_) => break,
            }
            while let Ok(s) = rx_samp.try_recv() {
              buf.push(s);
              if buf.len() >= frame_len { break; }
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
                  "sample_rate": sample_rate as u32
                }),
              );
            }
          }
          // flush
          if !buf.is_empty() {
            let _ = app_handle_emit.emit_all(
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
        });

        // Build CPAL stream
        let build_stream = |sample_format: cpal::SampleFormat| -> Result<cpal::Stream, String> {
          match sample_format {
            cpal::SampleFormat::F32 => {
              let is_capturing_cb = is_capturing_flag.clone();
              device
              .build_input_stream(
                &config,
                move |data: &[f32], _| {
                  if !is_capturing_cb.load(Ordering::Relaxed) { return; }
                  if channels == 1 {
                    for &s in data { let _ = tx_samp.try_send(s); }
                  } else {
                    for frame in data.chunks_exact(channels) {
                      let sum: f32 = frame.iter().copied().sum();
                      let avg = sum / channels as f32;
                      let _ = tx_samp.try_send(avg);
                    }
                  }
                },
                move |err| { eprintln!("Audio input stream error: {}", err); },
                None,
              )
              .map_err(|e| format!("build_input_stream (f32) failed: {}", e))
            },
            cpal::SampleFormat::I16 => {
              let is_capturing_cb = is_capturing_flag.clone();
              device
              .build_input_stream(
                &config,
                move |data: &[i16], _| {
                  if !is_capturing_cb.load(Ordering::Relaxed) { return; }
                  if channels == 1 {
                    for &s in data { let _ = tx_samp.try_send(s as f32 / i16::MAX as f32); }
                  } else {
                    for frame in data.chunks_exact(channels) {
                      let mut sum = 0.0f32;
                      for &s in frame { sum += s as f32 / i16::MAX as f32; }
                      let avg = sum / channels as f32;
                      let _ = tx_samp.try_send(avg);
                    }
                  }
                },
                move |err| { eprintln!("Audio input stream error: {}", err); },
                None,
              )
              .map_err(|e| format!("build_input_stream (i16) failed: {}", e))
            },
            cpal::SampleFormat::U16 => {
              let is_capturing_cb = is_capturing_flag.clone();
              device
              .build_input_stream(
                &config,
                move |data: &[u16], _| {
                  if !is_capturing_cb.load(Ordering::Relaxed) { return; }
                  let to_f32 = |v: u16| (v as f32 / u16::MAX as f32) * 2.0 - 1.0;
                  if channels == 1 {
                    for &s in data { let _ = tx_samp.try_send(to_f32(s)); }
                  } else {
                    for frame in data.chunks_exact(channels) {
                      let mut sum = 0.0f32;
                      for &s in frame { sum += to_f32(s); }
                      let avg = sum / channels as f32;
                      let _ = tx_samp.try_send(avg);
                    }
                  }
                },
                move |err| { eprintln!("Audio input stream error: {}", err); },
                None,
              )
              .map_err(|e| format!("build_input_stream (u16) failed: {}", e))
            },
            _ => Err("Unsupported sample format".to_string()),
          }
        };

        match build_stream(sample_format) {
          Ok(s) => {
            if let Err(e) = s.play() {
              eprintln!("Failed to start input stream: {}", e);
              is_capturing_flag.store(false, Ordering::Relaxed);
              return;
            }
            *stream_slot = Some(s);
            println!("Started real audio capture ({} Hz, {} ch)", sample_rate, channels);
          }
          Err(e) => {
            eprintln!("{}", e);
            is_capturing_flag.store(false, Ordering::Relaxed);
            return;
          }
        }
      };

      let stop_capture = |is_capturing_flag: Arc<AtomicBool>, stream_slot: &mut Option<cpal::Stream>| {
        is_capturing_flag.store(false, Ordering::Relaxed);
        *stream_slot = None; // drop stream; aggregator will also stop
        println!("Stopped real audio capture");
      };

      // Command loop
      while let Ok(cmd) = rx.recv() {
        match cmd {
          Command::Start(app_handle) => start_capture(app_handle, is_capturing_worker.clone(), &mut stream),
          Command::Stop => stop_capture(is_capturing_worker.clone(), &mut stream),
        }
      }
    });

    Self { tx, is_capturing }
  }

  pub fn start(&self, app_handle: tauri::AppHandle) -> Result<(), String> {
    let _ = self.tx.send(Command::Start(app_handle)).map_err(|e| e.to_string())?;
    Ok(())
  }

  pub fn stop(&self) -> Result<(), String> {
    let _ = self.tx.send(Command::Stop).map_err(|e| e.to_string())?;
    Ok(())
  }

  pub fn is_capturing(&self) -> bool {
    self.is_capturing.load(std::sync::atomic::Ordering::Relaxed)
  }
}
