use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Sender, Receiver};
use std::sync::Arc;
use std::thread;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use crossbeam_channel as channel;
use tauri::Manager;

fn detect_headphones_or_external_audio(host: &cpal::Host) -> bool {
  if let Some(default_output) = host.default_output_device() {
    if let Ok(device_name) = default_output.name() {
      let name_lower = device_name.to_lowercase();
      println!("Default output device: {}", device_name);
      
      // Simple check - if not built-in speakers, assume headphones/external audio
      return !name_lower.contains("built-in") && 
             !name_lower.contains("internal") && 
             !name_lower.contains("macbook");
    }
  }
  false
}

#[derive(Debug, Clone)]
pub enum AudioSource {
  Microphone,
  SystemAudio,
}

enum Command {
  Start(tauri::AppHandle, bool /* force_microphone */),
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
      enum ActiveStream { Single(cpal::Stream), Mixed(cpal::Stream, cpal::Stream) }
      let mut stream: Option<ActiveStream> = None;

      // Inner function to start capture with given app handle
      const ENABLE_MIXED_CAPTURE: bool = false; // Disabled for now - using SCKit + AirPods Pro separately
      let start_capture = |app_handle: tauri::AppHandle,
                           force_microphone: bool,
                           is_capturing_flag: Arc<AtomicBool>,
                           stream_slot: &mut Option<ActiveStream>| {
        if is_capturing_flag.load(Ordering::Relaxed) {
          return; // already capturing
        }
        is_capturing_flag.store(true, Ordering::Relaxed);

        // Automatic device selection based on Mac's current audio setup
        let host = cpal::default_host();
        
        // First, check if there are headphones or external audio devices connected
        // Allow override via settings (force microphone)
        // Discover devices - prioritize aggregate/system audio devices
        let mic_device = host.default_input_device();
        let mut loopback_device = None;
        let mut airpods_mic_device = None;
        
        if let Ok(devices) = host.input_devices() {
          // Single pass through devices to find what we need
          for device in devices {
            if let Ok(name) = device.name() {
              let nl = name.to_lowercase();
              println!("Available input device: {}", name);
              
              // Check for AirPods Pro microphone
              if nl.contains("airpods") && airpods_mic_device.is_none() {
                println!("🎧 Found AirPods microphone: {}", name);
                airpods_mic_device = Some(device.clone());
              }
              
              // Look for system audio devices (prioritize aggregate, AVOID BlackHole)
              if loopback_device.is_none() && !nl.contains("blackhole") {
                if nl.contains("aggregate") {
                  println!("Found aggregate device (preferred): {}", name);
                  loopback_device = Some(device);
                } else if nl.contains("multi-output") || nl.contains("soundflower") || 
                         nl.contains("loopback") || nl.contains("virtual") || nl.contains("system") {
                  println!("Found system audio device: {}", name);
                  loopback_device = Some(device);
                }
              }
              
              // Explicitly skip BlackHole devices
              if nl.contains("blackhole") {
                println!("❌ Skipping BlackHole device: {}", name);
              }
            }
          }
        }
        
        // Check if we should use system audio vs microphone
        // For AirPods Pro: we want MIXED capture (both mic + system audio)
        let headphones_detected = detect_headphones_or_external_audio(&host);
        let mut should_use_system_audio = headphones_detected && !force_microphone;
        
        // For mixed capture: prioritize AirPods Pro mic + system audio via SCKit
        println!("🎧 Audio setup: AirPods Pro detected={}, System audio device available={}", 
                 airpods_mic_device.is_some(), loopback_device.is_some());
        
        // If no loopback device found but headphones are detected, provide helpful guidance
        if should_use_system_audio && loopback_device.is_none() {
          println!("🎧 Headphones detected. System audio capture will use ScreenCaptureKit when available.");
          println!("If system capture is unavailable or denied, falling back to microphone.");
        }

        // Simple approach: Use AirPods Pro microphone when available
        // SCKit will handle system audio separately, and UI will mix them
        if airpods_mic_device.is_some() && should_use_system_audio {
          println!("🎵 Using AirPods Pro microphone + ScreenCaptureKit system audio (mixed in UI)");
          should_use_system_audio = false; // Use microphone for CPAL, system audio via SCKit
        }

        // Single-device selection fallback
        let (device, _actual_source) = if should_use_system_audio {
          match loopback_device {
            Some(d) => {
              if let Ok(name) = d.name() {
                println!("✅ Using system audio device: {}", name);
                if name.to_lowercase().contains("aggregate") {
                  println!("🎯 Perfect! Aggregate device will capture system audio + mic together");
                }
              }
              (d, AudioSource::SystemAudio)
            }
            None => {
              println!("Headphones detected but no system audio capture available - using microphone only");
              println!("To capture both your voice AND system audio (for calls/meetings):");
              println!("1. Open Audio MIDI Setup (Spotlight -> 'Audio MIDI Setup')");
              println!("2. Click '+' and create 'Multi-Output Device'");
              println!("3. Check both 'BlackHole 16ch' and your headphones");
              println!("4. Set this Multi-Output as your system output in System Preferences");
              println!("5. In Oatmeal, BlackHole will capture system audio while your headphones play it");
              match mic_device {
                Some(d) => (d, AudioSource::Microphone),
                None => { eprintln!("No input device available"); is_capturing_flag.store(false, Ordering::Relaxed); return; }
              }
            }
          }
        } else {
          println!("Audio going to speakers or using AirPods Pro microphone");
          // Prefer AirPods Pro microphone if available, otherwise default mic
          match airpods_mic_device.or(mic_device) {
            Some(d) => {
              if let Ok(name) = d.name() {
                println!("✅ Using microphone: {}", name);
              }
              (d, AudioSource::Microphone)
            },
            None => { 
              eprintln!("No input device available"); 
              is_capturing_flag.store(false, Ordering::Relaxed); 
              return; 
            }
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
          let mut frames_emitted = 0u64;
          let mut samples_received = 0u64;
          
          println!("📡 Aggregator started: frame_len={}, target_rate={}", frame_len, sample_rate);

          while is_capturing_emit.load(Ordering::Relaxed) {
            match rx_samp.recv() {
              Ok(s) => {
                buf.push(s);
                samples_received += 1;
              },
              Err(_) => break,
            }
            while let Ok(s) = rx_samp.try_recv() {
              buf.push(s);
              samples_received += 1;
              if buf.len() >= frame_len { break; }
            }
            while buf.len() >= frame_len {
              let frame: Vec<f32> = buf.drain(0..frame_len).collect();
              
              // Check if frame has any activity
              let max_amplitude = frame.iter().map(|&s| s.abs()).fold(0.0f32, f32::max);
              
              frames_emitted += 1;
              if frames_emitted % 50 == 0 {
                println!("📡 Aggregator: {} frames emitted, {} samples received, last frame max amplitude: {:.4}", 
                         frames_emitted, samples_received, max_amplitude);
              }
              
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

        // Build CPAL stream with debug logging
        let build_stream = |sample_format: cpal::SampleFormat| -> Result<cpal::Stream, String> {
          match sample_format {
            cpal::SampleFormat::F32 => {
              let is_capturing_cb = is_capturing_flag.clone();
              let sample_count = Arc::new(AtomicU64::new(0));
              let non_zero_samples = Arc::new(AtomicU64::new(0));
              let sample_count_cb = sample_count.clone();
              let non_zero_samples_cb = non_zero_samples.clone();
              device
              .build_input_stream(
                &config,
                move |data: &[f32], _| {
                  if !is_capturing_cb.load(Ordering::Relaxed) { return; }
                  let prev_count = sample_count_cb.fetch_add(data.len() as u64, Ordering::Relaxed);
                  let new_count = prev_count + data.len() as u64;
                  
                  if channels == 1 {
                    for &s in data { 
                      if s.abs() > 0.001 { 
                        non_zero_samples_cb.fetch_add(1, Ordering::Relaxed);
                      }
                      let _ = tx_samp.try_send(s); 
                    }
                  } else {
                    for frame in data.chunks_exact(channels) {
                      let sum: f32 = frame.iter().copied().sum();
                      let avg = sum / channels as f32;
                      if avg.abs() > 0.001 { 
                        non_zero_samples_cb.fetch_add(1, Ordering::Relaxed);
                      }
                      let _ = tx_samp.try_send(avg);
                    }
                  }
                  
                  // Log every 16000 samples (1 second at 16kHz)
                  if new_count / 16000 > prev_count / 16000 {
                    let nz = non_zero_samples_cb.load(Ordering::Relaxed);
                    println!("🎤 Audio samples: {} total, {} non-zero (activity: {:.1}%)", 
                             new_count, nz, 
                             (nz as f32 / new_count as f32) * 100.0);
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
            *stream_slot = Some(ActiveStream::Single(s));
            println!("Started real audio capture ({} Hz, {} ch)", sample_rate, channels);
          }
          Err(e) => {
            eprintln!("{}", e);
            is_capturing_flag.store(false, Ordering::Relaxed);
            return;
          }
        }
      };

      let stop_capture = |is_capturing_flag: Arc<AtomicBool>, stream_slot: &mut Option<ActiveStream>| {
        is_capturing_flag.store(false, Ordering::Relaxed);
        *stream_slot = None; // drop stream; aggregator will also stop
        println!("Stopped real audio capture");
      };

      // Command loop
      while let Ok(cmd) = rx.recv() {
        match cmd {
          Command::Start(app_handle, force_mic) => start_capture(app_handle, force_mic, is_capturing_worker.clone(), &mut stream),
          Command::Stop => stop_capture(is_capturing_worker.clone(), &mut stream),
        }
      }
    });

    Self { tx, is_capturing }
  }

  pub fn start(&self, app_handle: tauri::AppHandle, force_microphone: bool) -> Result<(), String> {
    let _ = self.tx.send(Command::Start(app_handle, force_microphone)).map_err(|e| e.to_string())?;
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
