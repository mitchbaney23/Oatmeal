import { useState, useEffect, useCallback, useRef } from 'react';
import { useSettings } from './useSettings';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';

export interface AudioFrame {
  data: number[];
  timestamp: number;
  sample_rate: number;
}

export function useAudio() {
  const { settings } = useSettings();
  const [isRecording, setIsRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [transcript, setTranscript] = useState('');
  const audioBufferRef = useRef<number[]>([]);
  const [levels, setLevels] = useState<number[]>([]); // recent normalized RMS levels
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const lastSnippetRef = useRef<string>("");
  const speakingRef = useRef<boolean>(false);
  const lastVoiceMsRef = useRef<number | null>(null);
  const sampleRateRef = useRef<number | null>(null);
  const transcribingRef = useRef<boolean>(false);

  const resetHotRefs = () => {
    audioBufferRef.current = [];
    speakingRef.current = false;
    lastVoiceMsRef.current = null;
    sampleRateRef.current = null;
    transcribingRef.current = false;
  };

  const flushTranscription = useCallback(async () => {
    if (transcribingRef.current) return;
    const sr = sampleRateRef.current;
    if (!sr || audioBufferRef.current.length === 0) return;
    transcribingRef.current = true;
    const chunk = audioBufferRef.current;
    audioBufferRef.current = [];
    try {
      const transcriptionResult = await invoke<string>('transcribe_audio', {
        audioFrames: chunk,
        audio_frames: chunk,
        sampleRate: sr,
        sample_rate: sr,
      });
      const cleaned = (transcriptionResult || '').trim();
      if (cleaned && cleaned !== lastSnippetRef.current) {
        setTranscript(prev => prev + (prev ? ' ' : '') + cleaned);
        lastSnippetRef.current = cleaned;
      }
    } catch (error) {
      console.error('Transcription failed:', error);
    } finally {
      speakingRef.current = false;
      lastVoiceMsRef.current = null;
      transcribingRef.current = false;
    }
  }, []);

  const handleAudioFrame = useCallback(async (frame: AudioFrame) => {
    setFrameCount(prev => prev + 1);
    if (!sampleRateRef.current) {
      sampleRateRef.current = frame.sample_rate;
      setSampleRate(frame.sample_rate);
    }

    // Accumulate audio data
    audioBufferRef.current.push(...frame.data);

    // Compute a simple RMS level for visualization
    const rms = Math.sqrt(
      frame.data.reduce((acc, v) => acc + (v * v), 0) / Math.max(1, frame.data.length)
    );
    // Normalize: if input is float -1..1 then rms ~0..1; if i16, approximate normalization
    const normalized = rms > 1 ? Math.min(1, rms / 32767) : Math.min(1, rms);
    setLevels(prev => {
      const next = [...prev, normalized];
      // Keep ~60 recent frames (~1.2s at 50fps)
      if (next.length > 60) next.splice(0, next.length - 60);
      return next;
    });
    // Lightweight VAD gating to trigger on speech end
    const nowMs = frame.timestamp;
    const vadOn = 0.03;   // start speaking threshold
    const vadOff = 0.02;  // stop speaking threshold (hysteresis)
    if (!speakingRef.current && normalized >= vadOn) {
      speakingRef.current = true;
    }
    if (speakingRef.current) {
      if (normalized >= vadOff) {
        lastVoiceMsRef.current = nowMs;
      } else if (lastVoiceMsRef.current == null) {
        lastVoiceMsRef.current = nowMs;
      }
    }

    // Transcribe when either: chunk length reached OR we detect a pause after speech
    const chunkSeconds = Math.max(1, Math.min(6, Number(settings?.chunk_seconds ?? 2.5)));
    const sr = sampleRateRef.current;
    const neededSamples = sr ? Math.floor(sr * chunkSeconds) : 0;
    const enoughForChunk = sr ? audioBufferRef.current.length >= neededSamples : false;
    const silenceGapMs = lastVoiceMsRef.current ? (nowMs - lastVoiceMsRef.current) : Infinity;
    const minUtteranceSamples = sr ? Math.floor(sr * Math.min(1.0, chunkSeconds)) : 0; // at least ~1s
    const pauseDetected = speakingRef.current && silenceGapMs >= 450 && audioBufferRef.current.length >= minUtteranceSamples;

    if ((enoughForChunk || pauseDetected) && !transcribingRef.current) {
      flushTranscription();
    }
  }, [frameCount, settings?.chunk_seconds, flushTranscription]);

  // Stable event subscription to avoid resubscribe storms
  const handlerRef = useRef<(f: AudioFrame) => void>();
  useEffect(() => { handlerRef.current = handleAudioFrame; }, [handleAudioFrame]);
  useEffect(() => {
    let active = true;
    let unlistenFn: (() => void) | null = null;
    listen<AudioFrame>('audio:frame', (event) => {
      if (active) handlerRef.current?.(event.payload);
    }).then(fn => { unlistenFn = fn; });
    return () => { active = false; if (unlistenFn) unlistenFn(); };
  }, []);

  const startRecording = async () => {
    await invoke('start_recording');
    setRecordingStartTime(Date.now());
  };

  const getRecordingDuration = () => {
    if (!recordingStartTime) return 0;
    return Math.floor((Date.now() - recordingStartTime) / 1000);
  };

  const resetAudio = () => {
    setFrameCount(0);
    setTranscript('');
    setLevels([]);
    setSampleRate(null);
    resetHotRefs();
    setRecordingStartTime(null);
  };

  return {
    isRecording,
    setIsRecording,
    frameCount,
    transcript,
    setTranscript,
    resetAudio,
    startRecording,
    getRecordingDuration,
    levels,
    sampleRate
  };
}
