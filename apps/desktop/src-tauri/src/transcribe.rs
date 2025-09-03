use reqwest::Client;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH, Instant};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperState};

pub struct Transcriber {
    client: Client,
    model_path: Option<PathBuf>,
    whisper_context: Option<WhisperContext>,
    whisper_state: Option<WhisperState>,
    model_downloaded: bool,
    last_text: Option<String>,
    last_when: Option<Instant>,
}

impl Transcriber {
    fn find_supported_model_in(dir: &Path) -> Option<PathBuf> {
        // Try common Whisper.cpp GGML filenames (prefer base over tiny)
        let candidates = [
            // Prefer small.en for better accuracy than base on short chunks
            "ggml-small.en.bin",
            "ggml-small.bin",
            "whisper-small.bin",
            // Then base
            "ggml-base.en.bin",
            "ggml-base.bin",
            "whisper-base.bin",
            // Then tiny as last resort
            "ggml-tiny.en.bin",
            "ggml-tiny.bin",
            "whisper-tiny.bin",
        ];
        for name in candidates.iter() {
            let p = dir.join(name);
            if p.exists() { return Some(p); }
        }
        None
    }

    fn find_models_dir() -> Result<PathBuf, String> {
        // Walk up to locate a 'models' directory that actually contains a supported GGML model
        let mut dir = std::env::current_dir().map_err(|e| format!("Failed to get current dir: {}", e))?;
        let mut checked: Vec<String> = Vec::new();
        for _ in 0..8 {
            let candidate = dir.join("models");
            if candidate.exists() {
                if let Some(model) = Self::find_supported_model_in(&candidate) {
                    println!("Models dir '{}' contains supported model: {}", candidate.display(), model.file_name().unwrap().to_string_lossy());
                    return Ok(candidate);
                } else {
                    checked.push(candidate.display().to_string());
                }
            }
            if let Some(parent) = dir.parent() {
                dir = parent.to_path_buf();
            } else {
                break;
            }
        }
        let hint = if checked.is_empty() { String::from("no 'models' directories found in parent chain") } else { format!("checked: {:?}", checked) };
        Err(format!("Could not locate a 'models' directory with GGML model files; {}", hint))
    }

    fn pick_model_path(models_dir: &Path, preferred: Option<&str>) -> Result<PathBuf, String> {
        // If a preferred model is provided and exists, use it
        if let Some(name) = preferred {
            let p = models_dir.join(name);
            if p.exists() { return Ok(p); }
        }

        // Use the default search order to find a supported model
        if let Some(p) = Self::find_supported_model_in(models_dir) { return Ok(p); }

        // Nothing matched; give a helpful error listing what's available
        let available: Vec<String> = std::fs::read_dir(models_dir)
            .map(|entries| entries
                .filter_map(|e| e.ok())
                .filter_map(|e| e.file_name().into_string().ok())
                .collect())
            .unwrap_or_default();
        Err(format!(
            "No supported Whisper model file found in {}. Available: {:?}",
            models_dir.display(),
            available
        ))
    }

    pub fn new() -> Self {
        Self {
            client: Client::new(),
            model_path: None,
            whisper_context: None,
            whisper_state: None,
            model_downloaded: false,
            last_text: None,
            last_when: None,
        }
    }

    pub async fn initialize(&mut self, model_name: Option<&str>) -> Result<(), String> {
        // Reduce noisy ggml/whisper internal logs in dev
        std::env::set_var("GGML_LOG_LEVEL", "ERROR");
        std::env::set_var("WHISPER_NO_PRINTS", "1");

        // Locate models directory robustly
        let models_dir = match Self::find_models_dir() {
            Ok(p) => {
                println!("Found models directory at: {}", p.display());
                p
            },
            Err(e) => {
                eprintln!("Model directory discovery failed: {}", e);
                return Err(e);
            }
        };

        // Pick an available model path
        let model_path = match Self::pick_model_path(&models_dir, model_name) {
            Ok(p) => p,
            Err(e) => {
                eprintln!("Model file selection failed: {}", e);
                return Err(e);
            }
        };

        // Initialize Whisper context with the local model
        println!("Loading Whisper model: {}", model_path.display());
        let ctx_params = WhisperContextParameters::default();
        let ctx = WhisperContext::new_with_params(
            model_path.to_str().unwrap(),
            ctx_params
        ).map_err(|e| format!("Failed to create whisper context: {:?}", e))?;
        
        // Create a whisper state for processing
        let state = ctx.create_state().map_err(|e| format!("Failed to create whisper state: {:?}", e))?;
        
        self.whisper_context = Some(ctx);
        self.whisper_state = Some(state);
        self.model_path = Some(model_path);
        self.model_downloaded = true;
        
        println!("✅ Local Whisper model loaded successfully");
        Ok(())
    }

    pub async fn download_model_from_hf(&mut self, model_name: &str) -> Result<(), String> {
        // Download model files from Hugging Face
        let base_url = format!("https://huggingface.co/{}/resolve/main", model_name);
        
        // Create models directory
        let models_dir = std::env::current_dir()
            .map_err(|e| format!("Failed to get current dir: {}", e))?
            .join("models");
        
        std::fs::create_dir_all(&models_dir)
            .map_err(|e| format!("Failed to create models dir: {}", e))?;

        // Download model files
        let files = vec![
            "config.json",
            "tokenizer.json", 
            "model.safetensors",
        ];

        for file in files {
            let url = format!("{}/{}", base_url, file);
            let file_path = models_dir.join(file);
            
            if file_path.exists() {
                println!("File {} already exists, skipping download", file);
                continue;
            }
            
            println!("Downloading {} from Hugging Face...", file);
            
            let response = self.client.get(&url)
                .send()
                .await
                .map_err(|e| format!("Failed to download {}: {}", file, e))?;

            if !response.status().is_success() {
                return Err(format!("Failed to download {}: HTTP {}", file, response.status()));
            }

            let bytes = response.bytes()
                .await
                .map_err(|e| format!("Failed to read {}: {}", file, e))?;

            std::fs::write(&file_path, bytes)
                .map_err(|e| format!("Failed to write {}: {}", file, e))?;
        }

        self.model_path = Some(models_dir);
        self.model_downloaded = true;
        Ok(())
    }

    fn resample_to_16k(input: &[f32], src_sr: u32) -> Vec<f32> {
        let dst_sr = 16_000u32;
        if src_sr == 0 || input.is_empty() || src_sr == dst_sr {
            return input.to_vec();
        }
        if src_sr % dst_sr == 0 {
            // Clean decimation (e.g., 48000 -> 16000) with simple low-pass by averaging
            let factor = (src_sr / dst_sr) as usize; // e.g., 3
            let out_len = input.len() / factor;
            let mut out = Vec::with_capacity(out_len);
            for chunk in input.chunks_exact(factor) {
                let mut sum = 0.0f32;
                for &v in chunk { sum += v; }
                out.push(sum / factor as f32);
            }
            if out.is_empty() { out.push(0.0); }
            out
        } else {
            // Fallback to linear resampling
            let ratio = dst_sr as f32 / src_sr as f32;
            let out_len = ((input.len() as f32) * ratio).max(1.0) as usize;
            let mut out = Vec::with_capacity(out_len);
            let mut pos = 0.0f32;
            let step = 1.0f32 / ratio; // input index step per output sample
            for _ in 0..out_len {
                let i0 = pos.floor() as usize;
                let i1 = (i0 + 1).min(input.len().saturating_sub(1));
                let frac = pos - (i0 as f32);
                let sample = input[i0] * (1.0 - frac) + input[i1] * frac;
                out.push(sample);
                pos += step;
                if pos >= input.len() as f32 { break; }
            }
            if out.is_empty() { out.push(0.0); }
            out
        }
    }

    pub async fn transcribe_audio_data(&mut self, audio_data: &[f32], sample_rate: u32) -> Result<String, String> {
        if !self.model_downloaded {
            return Err("Model not initialized. Call initialize() first.".to_string());
        }

        // Check if we have enough audio data
        if audio_data.len() < 1000 {
            return Ok("".to_string());
        }
        
        // Resample to 16 kHz for whisper
        let audio_16k = Self::resample_to_16k(audio_data, sample_rate);

        // Calculate audio energy for voice activity detection on resampled signal
        let energy: f32 = audio_16k.iter().map(|&x| x * x).sum::<f32>() / audio_16k.len() as f32;
        let energy_db = 10.0 * energy.log10();
        
        // Only transcribe if there's sufficient audio energy
        if energy_db <= -50.0 { // slightly more permissive
            return Ok("".to_string());
        }

        // Use local Whisper model (no API costs!)
        if self.whisper_state.is_some() {
            let result = {
                let state = self.whisper_state.as_mut().unwrap();
                Self::transcribe_with_whisper_static(state, &audio_16k).await
            };
            
            match result {
                Ok(text) if !text.trim().is_empty() => {
                    println!("🎤 Local Whisper transcribed: {}", text);
                    return Ok(text);
                },
                Ok(_) => {
                    // Empty result - probably silence
                    return Ok("".to_string());
                }, 
                Err(e) => {
                    println!("⚠️ Local Whisper failed: {}", e);
                }
            }
        }
        // No fallback: return empty to avoid fake text in UI
        Ok(String::new())
    }

    async fn transcribe_with_whisper_static(state: &mut WhisperState, audio_data: &[f32]) -> Result<String, String> {
        // Set up transcription parameters suitable for short live chunks
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_n_threads(4);
        params.set_translate(false);
        params.set_language(Some("en"));
        params.set_no_timestamps(true);
        params.set_single_segment(true);
        params.set_no_context(true);
        params.set_max_len(64);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);
        params.set_suppress_non_speech_tokens(true);
        params.set_temperature(0.2);
        params.set_temperature_inc(0.2);
        params.set_entropy_thold(2.4);
        params.set_logprob_thold(-1.5);

        // Run local Whisper transcription
        state.full(params, audio_data)
            .map_err(|e| format!("Whisper transcription failed: {:?}", e))?;

        // Extract text from segments
        let num_segments = state.full_n_segments()
            .map_err(|e| format!("Failed to get segments: {:?}", e))?;
        
        let mut result = String::new();
        for i in 0..num_segments {
            let segment_text = state.full_get_segment_text(i)
                .map_err(|e| format!("Failed to get segment text: {:?}", e))?;
            result.push_str(&segment_text);
            if i < num_segments - 1 {
                result.push(' ');
            }
        }

        let cleaned = result.trim().to_string();
        // Filter out common repetition artifacts like endless "check"
        let lower = cleaned.to_lowercase();
        let is_repetitive_check = lower.replace([',', '.', ' '], "")
            .chars().collect::<Vec<_>>()
            .chunks(5)
            .all(|chunk| chunk.iter().collect::<String>().contains("check") );
        if cleaned.len() < 3 || is_repetitive_check {
            return Ok(String::new());
        }
        Ok(cleaned)
    }

    fn mock_transcription(&mut self, audio_data: &[f32]) -> Result<String, String> {
        // Mock transcription for demo purposes
        let speech_samples = vec![
            "So we're looking at a timeline of about three months.",
            "The budget approval process usually takes two weeks.",
            "I need to check with our technical team on that.",
            "What kind of integration capabilities do you offer?",
            "That sounds like it would solve our current pain points.",
            "Can you walk me through the implementation process?",
            "We've been evaluating several different solutions.",
            "The security requirements are pretty strict here.",
            "How does your pricing model work for our use case?",
            "I'll need to discuss this with the decision makers.",
        ];
        
        // Use zero-crossing rate and energy to vary selection
        let mut zcr = 0usize;
        for w in audio_data.windows(2) {
            if (w[0] >= 0.0 && w[1] < 0.0) || (w[0] < 0.0 && w[1] >= 0.0) {
                zcr += 1;
            }
        }
        
        let zcr_norm = (zcr as f32) / (audio_data.len().max(1) as f32);
        let energy: f32 = audio_data.iter().map(|&x| x * x).sum::<f32>() / audio_data.len() as f32;
        let energy_bin = ((energy * 10000.0) as usize) % 11;
        let zcr_bin = ((zcr_norm * 1000.0) as usize) % 13;
        let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as usize;
        let mut idx = (energy_bin * 7 + zcr_bin * 13 + now_ms) % speech_samples.len();

        // Avoid repeating the same sentence back-to-back
        let mut chosen = speech_samples[idx].to_string();
        if let Some(last) = &self.last_text {
            if last == &chosen {
                idx = (idx + 1) % speech_samples.len();
                chosen = speech_samples[idx].to_string();
            }
        }

        self.last_text = Some(chosen.clone());
        self.last_when = Some(Instant::now());
        
        Ok(chosen)
    }

    async fn transcribe_via_openai(&self, audio_data: &[f32]) -> Result<String, String> {
        let api_key = std::env::var("OPENAI_API_KEY").map_err(|_| "OPENAI_API_KEY not set".to_string())?;

        // Encode to 16-bit mono WAV in-memory
        let sample_rate = 16000u32;
        let mut cursor = std::io::Cursor::new(Vec::<u8>::new());
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::new(&mut cursor, spec)
            .map_err(|e| format!("Failed to init WAV writer: {}", e))?;
        for &s in audio_data {
            // clamp and convert to i16
            let v = (s.max(-1.0).min(1.0) * i16::MAX as f32) as i16;
            writer.write_sample(v).map_err(|e| format!("WAV write failed: {}", e))?;
        }
        writer.finalize().map_err(|e| format!("WAV finalize failed: {}", e))?;
        let wav_bytes = cursor.into_inner();

        // Build multipart form
        let part = reqwest::multipart::Part::bytes(wav_bytes)
            .file_name("audio.wav")
            .mime_str("audio/wav").unwrap();
        let form = reqwest::multipart::Form::new()
            .text("model", "gpt-4o-mini-transcribe")
            .part("file", part);

        let url = "https://api.openai.com/v1/audio/transcriptions";
        let resp = self.client
            .post(url)
            .bearer_auth(api_key)
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("OpenAI request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("OpenAI error ({}): {}", status, body));
        }

        let json: serde_json::Value = resp.json().await.map_err(|e| format!("Invalid OpenAI response: {}", e))?;
        let text = json.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
        Ok(text)
    }

    pub fn is_ready(&self) -> bool {
        self.model_downloaded
    }

    pub fn is_initialized(&self) -> bool {
        self.model_downloaded
    }
}
