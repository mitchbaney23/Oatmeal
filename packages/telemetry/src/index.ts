import fs from 'fs';
import path from 'path';
import { homedir } from 'os';

export interface TelemetryEvent {
  event: string;
  timestamp: number;
  duration?: number;
  metadata?: Record<string, any>;
}

export class TelemetryService {
  private enabled: boolean;
  private logPath: string;

  constructor(enabled = true) {
    this.enabled = enabled;
    this.logPath = path.join(homedir(), 'Oatmeal', 'telemetry.log');
    
    // Ensure directory exists
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  track(event: string, metadata?: Record<string, any>, duration?: number): void {
    if (!this.enabled) return;

    const telemetryEvent: TelemetryEvent = {
      event,
      timestamp: Date.now(),
      duration,
      metadata
    };

    // Write to local file (future: could send to remote endpoint)
    fs.appendFileSync(this.logPath, JSON.stringify(telemetryEvent) + '\n');
  }

  trackPipelineRun(provider: string, model: string, tokens: number, latencyMs: number): void {
    this.track('pipeline_run', {
      provider,
      model,
      tokens,
      latency_ms: latencyMs
    });
  }

  trackRecordingSession(durationSeconds: number, transcriptionMethod: 'local' | 'cloud'): void {
    this.track('recording_session', {
      duration_seconds: durationSeconds,
      transcription_method: transcriptionMethod
    });
  }
}