export interface AudioFrame {
  data: Int16Array;
  timestamp: number;
  sampleRate: number;
}

export interface AudioCaptureConfig {
  sampleRate: number;
  channels: number;
  vadThreshold: number; // 0-3
}

export class AudioCapture {
  private isCapturing = false;
  private config: AudioCaptureConfig;

  constructor(config: AudioCaptureConfig = {
    sampleRate: 16000,
    channels: 1,
    vadThreshold: 2
  }) {
    this.config = config;
  }

  async start(): Promise<void> {
    this.isCapturing = true;
    console.log('Audio capture started');
  }

  async stop(): Promise<void> {
    this.isCapturing = false;
    console.log('Audio capture stopped');
  }

  onAudioFrame(callback: (frame: AudioFrame) => void): void {
    // Implementation would set up the callback for audio frames
    console.log('Audio frame callback registered');
  }
}