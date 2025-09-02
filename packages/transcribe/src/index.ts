import { EventEmitter } from 'events';
import { AudioFrame } from '@oatmeal/audio-core';

export interface TranscriptSegment {
  text: string;
  start: number; // ms
  end: number; // ms
  confidence: number;
  speaker?: string;
}

export interface TranscribeConfig {
  model: 'tiny' | 'base' | 'small' | 'medium';
  language: 'en' | 'auto';
  enableCloud: boolean;
}

export class TranscribeService extends EventEmitter {
  private config: TranscribeConfig;
  private isTranscribing = false;

  constructor(config: TranscribeConfig = {
    model: 'base',
    language: 'auto',
    enableCloud: false
  }) {
    super();
    this.config = config;
  }

  async init(modelPath?: string): Promise<void> {
    console.log('Transcribe service initialized');
  }

  async ingest(frame: AudioFrame): Promise<void> {
    // Would process audio frame
  }

  async flush(): Promise<void> {
    // Would flush any pending audio
  }

  start(): void {
    this.isTranscribing = true;
    this.emit('started');
  }

  stop(): void {
    this.isTranscribing = false;
    this.emit('stopped');
  }

  // Events: 'partial', 'final', 'languageDetected'
}