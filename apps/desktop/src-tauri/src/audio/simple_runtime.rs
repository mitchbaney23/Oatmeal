use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender, Receiver};
use std::sync::Arc;
use std::thread;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use crossbeam_channel as channel;
use tauri::Manager;

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
      let mut stream: Option<cpal::Stream> = None;

      // Function to start mixed AirPods + system audio capture
      let start_mixed_airpods_capture = |app_handle: tauri::AppHandle, 
                                         airpods_device: cpal::Device,
                                         system_device: cpal::Device,
                                         is_capturing_flag: Arc<AtomicBool>| {
        
        // Get configurations for both devices
        let airpods_config = match airpods_device.default_input_config() {
          Ok(config) => config,
          Err(e) => {
            println!("Failed to get AirPods config: {}", e);
            return;
          }
        };
        
        let system_config = match system_device.default_input_config() {
          Ok(config) => config,
          Err(e) => {
            println!("Failed to get system audio config: {}", e);
            return;
          }
        };

        println!("AirPods: {} Hz, {} channels", airpods_config.sample_rate().0, airpods_config.channels());
        println!("System:  {} Hz, {} channels", system_config.sample_rate().0, system_config.channels());

        let target_sample_rate = 48000_usize; // Common rate for mixing
        
        // Create channels for audio from both devices
        let (tx_airpods, rx_airpods) = channel::bounded::<f32>(target_sample_rate * 2);
        let (tx_system, rx_system) = channel::bounded::<f32>(target_sample_rate * 2);

        // Audio mixer thread
        let app_handle_mixer = app_handle.clone();
        let is_capturing_mixer = is_capturing_flag.clone();
        thread::spawn(move || {
          let frame_len = (target_sample_rate / 50).max(1); // ~20ms frames
          let mut airpods_buffer: Vec<f32> = Vec::with_capacity(frame_len * 2);
          let mut system_buffer: Vec<f32> = Vec::with_capacity(frame_len * 2);
          let mut debug_counter = 0;
          
          // High-pass filter state for noise reduction
          let mut voice_filter_state = 0.0f32;
          let mut system_filter_state = 0.0f32;
          let filter_alpha = 0.99f32; // High-pass cutoff ~80Hz at 16kHz

          println!("🎵 Mixed audio thread started - frame_len: {}", frame_len);
          
          while is_capturing_mixer.load(Ordering::Relaxed) {
            // Collect samples from both sources
            while let Ok(sample) = rx_airpods.try_recv() {
              airpods_buffer.push(sample);
              if airpods_buffer.len() >= frame_len { break; }
            }
            while let Ok(sample) = rx_system.try_recv() {
              system_buffer.push(sample);
              if system_buffer.len() >= frame_len { break; }
            }

            // When we have enough samples, mix and emit
            if airpods_buffer.len() >= frame_len || system_buffer.len() >= frame_len {
              debug_counter += 1;
              let mix_len = frame_len.min(airpods_buffer.len().max(system_buffer.len()));
              let mut mixed_frame: Vec<f32> = Vec::with_capacity(mix_len);
              
              // Audio quality preprocessing
              let mut rms_voice = 0.0f32;
              let mut rms_system = 0.0f32;
              let valid_voice_samples = airpods_buffer.len().min(mix_len);
              let valid_system_samples = system_buffer.len().min(mix_len);
              
              // Calculate RMS for dynamic gain adjustment
              if valid_voice_samples > 0 {
                for i in 0..valid_voice_samples {
                  rms_voice += airpods_buffer[i].powi(2);
                }
                rms_voice = (rms_voice / valid_voice_samples as f32).sqrt();
              }
              if valid_system_samples > 0 {
                for i in 0..valid_system_samples {
                  rms_system += system_buffer[i].powi(2);
                }
                rms_system = (rms_system / valid_system_samples as f32).sqrt();
              }
              
              if debug_counter % 100 == 0 { // Debug every ~2 seconds (after computing RMS)
                println!("🎧 AirPods samples: {}, 🔊 System samples: {}, Voice RMS: {:.3}, System RMS: {:.3}", 
                  airpods_buffer.len(), system_buffer.len(), rms_voice, rms_system);
              }

              // Dynamic gain control - boost quiet signals, limit loud ones
              let voice_gain = if rms_voice < 0.01 { 2.0 } else if rms_voice > 0.5 { 0.6 } else { 1.2 };
              let system_gain = if rms_system > 0.3 { 0.2 } else { 0.4 };
              
              for i in 0..mix_len {
                let mut airpods_sample = if i < airpods_buffer.len() { airpods_buffer[i] } else { 0.0 };
                let mut system_sample = if i < system_buffer.len() { system_buffer[i] } else { 0.0 };
                
                // Apply noise gate - reduce very quiet background noise
                if airpods_sample.abs() < 0.005 { airpods_sample = 0.0; }
                if system_sample.abs() < 0.003 { system_sample = 0.0; }
                
                // High-pass filter to remove low-frequency noise (improves Whisper accuracy)
                voice_filter_state = filter_alpha * voice_filter_state + airpods_sample;
                airpods_sample = airpods_sample - voice_filter_state;
                
                system_filter_state = filter_alpha * system_filter_state + system_sample;
                system_sample = system_sample - system_filter_state;
                
                // Apply dynamic gains
                airpods_sample *= voice_gain;
                system_sample *= system_gain;
                
                // Mix with voice priority
                let mixed = airpods_sample + system_sample;
                
                // Soft limiting to prevent clipping
                let limited = if mixed.abs() > 0.95 {
                  mixed.signum() * (0.95 + 0.05 * (1.0 - (-20.0 * (mixed.abs() - 0.95)).exp()))
                } else {
                  mixed
                };
                
                mixed_frame.push(limited);
              }
              
              // Remove used samples
              if airpods_buffer.len() >= mix_len {
                airpods_buffer.drain(0..mix_len);
              } else {
                airpods_buffer.clear();
              }
              if system_buffer.len() >= mix_len {
                system_buffer.drain(0..mix_len);
              } else {
                system_buffer.clear();
              }

              // Emit mixed audio
              let _ = app_handle_mixer.emit_all(
                "audio:frame",
                serde_json::json!({
                  "data": mixed_frame,
                  "timestamp": std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_millis(),
                  "sample_rate": target_sample_rate as u32
                }),
              );
            } else {
              // No data yet, short sleep to prevent busy waiting
              std::thread::sleep(std::time::Duration::from_millis(5));
            }
          }
        });

        // Start AirPods capture stream
        let airpods_format = airpods_config.sample_format();
        let airpods_stream_config: cpal::StreamConfig = airpods_config.into();
        let airpods_channels = airpods_stream_config.channels as usize;
        
        let is_capturing_airpods = is_capturing_flag.clone();
        let tx_airpods_capture = tx_airpods.clone();
        let airpods_stream = match airpods_format {
          cpal::SampleFormat::F32 => {
            airpods_device.build_input_stream(
              &airpods_stream_config,
              move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if !is_capturing_airpods.load(Ordering::Relaxed) { return; }
                
                // Check if there's any significant audio activity
                let max_sample = data.iter().map(|s| s.abs()).fold(0.0_f32, f32::max);
                static mut AIRPODS_DEBUG_COUNTER: usize = 0;
                unsafe { AIRPODS_DEBUG_COUNTER += 1; }
                
                if max_sample > 0.01 && unsafe { AIRPODS_DEBUG_COUNTER } % 50 == 0 {
                  println!("🎤 AirPods receiving audio: max={:.3}", max_sample);
                }
                
                if airpods_channels == 1 {
                  for &sample in data {
                    let _ = tx_airpods_capture.try_send(sample);
                  }
                } else {
                  for frame in data.chunks_exact(airpods_channels) {
                    let sum: f32 = frame.iter().copied().sum();
                    let avg = sum / airpods_channels as f32;
                    let _ = tx_airpods_capture.try_send(avg);
                  }
                }
              },
              move |err| { println!("AirPods stream error: {}", err); },
              None,
            )
          },
          _ => {
            println!("Unsupported AirPods sample format: {:?}", airpods_format);
            return;
          }
        };

        // Start system audio capture stream
        let system_format = system_config.sample_format();
        let system_stream_config: cpal::StreamConfig = system_config.into();
        let system_channels = system_stream_config.channels as usize;
        
        let is_capturing_system = is_capturing_flag.clone();
        let tx_system_capture = tx_system.clone();
        let system_stream = match system_format {
          cpal::SampleFormat::F32 => {
            system_device.build_input_stream(
              &system_stream_config,
              move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if !is_capturing_system.load(Ordering::Relaxed) { return; }
                
                if system_channels == 1 {
                  for &sample in data {
                    let _ = tx_system_capture.try_send(sample);
                  }
                } else {
                  for frame in data.chunks_exact(system_channels) {
                    let sum: f32 = frame.iter().copied().sum();
                    let avg = sum / system_channels as f32;
                    let _ = tx_system_capture.try_send(avg);
                  }
                }
              },
              move |err| { println!("System audio stream error: {}", err); },
              None,
            )
          },
          _ => {
            println!("Unsupported system audio sample format: {:?}", system_format);
            return;
          }
        };

        // Start both streams
        match (airpods_stream, system_stream) {
          (Ok(ap_stream), Ok(sys_stream)) => {
            if ap_stream.play().is_ok() && sys_stream.play().is_ok() {
              println!("✅ Mixed capture started: AirPods + System Audio");
              
              // Keep streams alive (they'll be dropped when function exits, but that's ok for now)
              // In a real implementation, we'd store these streams somewhere
              while is_capturing_flag.load(Ordering::Relaxed) {
                std::thread::sleep(std::time::Duration::from_millis(100));
              }
              println!("Mixed capture stopped");
            } else {
              println!("Failed to start one or both streams");
            }
          }
          (Err(e), _) => {
            println!("Failed to build AirPods stream: {}", e);
          }
          (_, Err(e)) => {
            println!("Failed to build system audio stream: {}", e);
          }
        }
      };

      let start_capture = |app_handle: tauri::AppHandle,
                           _force_microphone: bool,
                           is_capturing_flag: Arc<AtomicBool>,
                           stream_slot: &mut Option<cpal::Stream>| {
        if is_capturing_flag.load(Ordering::Relaxed) {
          return;
        }
        is_capturing_flag.store(true, Ordering::Relaxed);

        let host = cpal::default_host();
        
        // Debug: List all available devices
        println!("=== AVAILABLE AUDIO DEVICES ===");
        if let Ok(input_devices) = host.input_devices() {
          for device in input_devices {
            if let Ok(name) = device.name() {
              println!("Input device: {}", name);
            }
          }
        }
        if let Ok(output_devices) = host.output_devices() {
          for device in output_devices {
            if let Ok(name) = device.name() {
              println!("Output device: {}", name);
            }
          }
        }
        println!("================================");
        
        let default_input = host.default_input_device();
        let default_output = host.default_output_device();
        
        if let Some(ref output_device) = default_output {
          if let Ok(output_name) = output_device.name() {
            println!("Default output device: {}", output_name);
          }
        }
        
        let mut device = match default_input {
          Some(device) => device,
          None => {
            eprintln!("No default input device available");
            is_capturing_flag.store(false, Ordering::Relaxed);
            return;
          }
        };

        // Prefer a loopback system-audio device (BlackHole/Loopback) when available
        let mut using_system_audio = false;
        if let Ok(input_devices) = host.input_devices() {
          for sys_device in input_devices {
            if let Ok(sys_name) = sys_device.name() {
              let nl = sys_name.to_lowercase();
              if nl.contains("blackhole") || nl.contains("soundflower") || nl.contains("loopback") || nl.contains("aggregate") || nl.contains("multi-output") {
                println!("🎛️ Using system audio device: {}", sys_name);
                device = sys_device;
                using_system_audio = true;
                break;
              }
            }
          }
        }

        if !using_system_audio {
          if let Ok(name) = device.name() {
            println!("Default input device (mic): {}", name);
          }
        }

        // Get device configuration
        let config = match device.default_input_config() {
          Ok(config) => config,
          Err(e) => {
            println!("Failed to get default input config: {}", e);
            is_capturing_flag.store(false, Ordering::Relaxed);
            return;
          }
        };

        let sample_format = config.sample_format();
        let config: cpal::StreamConfig = config.into();
        let channels = config.channels as usize;
        let sample_rate = config.sample_rate.0 as usize;

        println!("Audio config: {} Hz, {} channels", sample_rate, channels);

        // Channel for moving samples out of callback
        let (tx_samples, rx_samples) = channel::bounded::<f32>(sample_rate * 2);

        // Aggregator thread
        let app_handle_emit = app_handle.clone();
        let is_capturing_emit = is_capturing_flag.clone();
        thread::spawn(move || {
          let frame_len = (sample_rate / 50).max(1); // ~20ms frames
          let mut buffer: Vec<f32> = Vec::with_capacity(frame_len * 2);

          while is_capturing_emit.load(Ordering::Relaxed) {
            match rx_samples.recv_timeout(std::time::Duration::from_millis(50)) {
              Ok(sample) => buffer.push(sample),
              Err(_) => continue,
            }

            // Collect more samples if available
            while let Ok(sample) = rx_samples.try_recv() {
              buffer.push(sample);
              if buffer.len() >= frame_len { break; }
            }

            // Emit frames when we have enough data
            while buffer.len() >= frame_len {
              let frame: Vec<f32> = buffer.drain(0..frame_len).collect();
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

          // Flush remaining buffer
          if !buffer.is_empty() {
            let _ = app_handle_emit.emit_all(
              "audio:frame",
              serde_json::json!({
                "data": buffer,
                "timestamp": std::time::SystemTime::now()
                  .duration_since(std::time::UNIX_EPOCH)
                  .unwrap()
                  .as_millis(),
                "sample_rate": sample_rate as u32
              }),
            );
          }
        });

        // Build input stream based on sample format  
        let is_capturing_f32 = is_capturing_flag.clone();
        let is_capturing_i16 = is_capturing_flag.clone();
        let is_capturing_u16 = is_capturing_flag.clone();
        
        let stream_result = match sample_format {
          cpal::SampleFormat::F32 => {
            device.build_input_stream(
              &config,
              move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if !is_capturing_f32.load(Ordering::Relaxed) { return; }
                
                if channels == 1 {
                  for &sample in data {
                    let _ = tx_samples.try_send(sample);
                  }
                } else {
                  // Mix channels to mono
                  for frame in data.chunks_exact(channels) {
                    let sum: f32 = frame.iter().copied().sum();
                    let avg = sum / channels as f32;
                    let _ = tx_samples.try_send(avg);
                  }
                }
              },
              move |err| { println!("Input stream error: {}", err); },
              None,
            )
          }
          cpal::SampleFormat::I16 => {
            device.build_input_stream(
              &config,
              move |data: &[i16], _: &cpal::InputCallbackInfo| {
                if !is_capturing_i16.load(Ordering::Relaxed) { return; }
                
                if channels == 1 {
                  for &sample in data {
                    let f_sample = sample as f32 / i16::MAX as f32;
                    let _ = tx_samples.try_send(f_sample);
                  }
                } else {
                  for frame in data.chunks_exact(channels) {
                    let mut sum = 0.0f32;
                    for &sample in frame {
                      sum += sample as f32 / i16::MAX as f32;
                    }
                    let avg = sum / channels as f32;
                    let _ = tx_samples.try_send(avg);
                  }
                }
              },
              move |err| { println!("Input stream error: {}", err); },
              None,
            )
          }
          cpal::SampleFormat::U16 => {
            device.build_input_stream(
              &config,
              move |data: &[u16], _: &cpal::InputCallbackInfo| {
                if !is_capturing_u16.load(Ordering::Relaxed) { return; }
                let to_f32 = |v: u16| (v as f32 / u16::MAX as f32) * 2.0 - 1.0;
                
                if channels == 1 {
                  for &sample in data {
                    let _ = tx_samples.try_send(to_f32(sample));
                  }
                } else {
                  for frame in data.chunks_exact(channels) {
                    let mut sum = 0.0f32;
                    for &sample in frame {
                      sum += to_f32(sample);
                    }
                    let avg = sum / channels as f32;
                    let _ = tx_samples.try_send(avg);
                  }
                }
              },
              move |err| { println!("Input stream error: {}", err); },
              None,
            )
          }
          _ => {
            println!("Unsupported sample format: {:?}", sample_format);
            is_capturing_flag.store(false, Ordering::Relaxed);
            return;
          }
        };

        match stream_result {
          Ok(s) => {
            if let Err(e) = s.play() {
              println!("Failed to start input stream: {}", e);
              is_capturing_flag.store(false, Ordering::Relaxed);
              return;
            }
            *stream_slot = Some(s);
            println!("Audio capture started successfully");
          }
          Err(e) => {
            println!("Failed to build input stream: {}", e);
            is_capturing_flag.store(false, Ordering::Relaxed);
          }
        }
      };

      let stop_capture = |is_capturing_flag: Arc<AtomicBool>, stream_slot: &mut Option<cpal::Stream>| {
        is_capturing_flag.store(false, Ordering::Relaxed);
        *stream_slot = None; // drop stream
        println!("Audio capture stopped");
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
    self.tx.send(Command::Start(app_handle, force_microphone)).map_err(|e| e.to_string())?;
    Ok(())
  }

  pub fn stop(&self) -> Result<(), String> {
    self.tx.send(Command::Stop).map_err(|e| e.to_string())?;
    Ok(())
  }

  pub fn is_capturing(&self) -> bool {
    self.is_capturing.load(Ordering::Relaxed)
  }
}
