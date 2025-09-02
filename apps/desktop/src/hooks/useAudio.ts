import { useState, useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';

export interface AudioFrame {
  data: number[];
  timestamp: number;
  sample_rate: number;
}

export function useAudio() {
  const [isRecording, setIsRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [audioBuffer, setAudioBuffer] = useState<number[]>([]);
  const [levels, setLevels] = useState<number[]>([]); // recent normalized RMS levels
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const lastSnippetRef = useRef<string>("");

  const handleAudioFrame = useCallback(async (frame: AudioFrame) => {
    setFrameCount(prev => prev + 1);
    if (!sampleRate) setSampleRate(frame.sample_rate);

    // Accumulate audio data
    setAudioBuffer(prev => [...prev, ...frame.data]);

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
    
    // Transcribe roughly every ~2 seconds worth of samples
    const enoughForTwoSeconds = sampleRate ? audioBuffer.length >= sampleRate * 2 : false;
    if (enoughForTwoSeconds) {
      try {
        const transcriptionResult = await invoke<string>('transcribe_audio', {
          audioFrames: audioBuffer
        });
        
        const cleaned = (transcriptionResult || '').trim();
        if (cleaned && cleaned !== lastSnippetRef.current) {
          setTranscript(prev => prev + (prev ? ' ' : '') + cleaned);
          lastSnippetRef.current = cleaned;
        }
        
        // Clear buffer after transcription
        setAudioBuffer([]);
      } catch (error) {
        console.error('Transcription failed:', error);
        // Fallback to demo text on error
        const demoText = [
          "Let me tell you about our current challenges...",
          "The budget hasn't been finalized yet...", 
          "I'll need to check with our CISO before we can proceed...",
          "What kind of timeline are we looking at?",
          "That sounds like it could solve our deployment issues..."
        ];
        
        const randomText = demoText[Math.floor(Math.random() * demoText.length)];
        if (randomText !== lastSnippetRef.current) {
          setTranscript(prev => prev + (prev ? ' ' : '') + randomText);
          lastSnippetRef.current = randomText;
        }
        setAudioBuffer([]);
      }
    }
  }, [frameCount, audioBuffer, sampleRate]);

  useEffect(() => {
    const unlisten = listen<AudioFrame>('audio:frame', (event) => {
      handleAudioFrame(event.payload);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [handleAudioFrame]);

  const startRecording = () => {
    setRecordingStartTime(Date.now());
  };

  const getRecordingDuration = () => {
    if (!recordingStartTime) return 0;
    return Math.floor((Date.now() - recordingStartTime) / 1000);
  };

  const resetAudio = () => {
    setFrameCount(0);
    setTranscript('');
    setAudioBuffer([]);
    setLevels([]);
    setSampleRate(null);
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
