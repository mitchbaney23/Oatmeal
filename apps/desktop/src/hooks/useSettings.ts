import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

export interface Settings {
  enable_telemetry: boolean;
  retention_days: number;
  use_gpu: boolean;
  model: string;
  enable_hubspot: boolean;
  enable_gmail: boolean;
  chunk_seconds: number; // live transcription chunk length in seconds
  summary_engine: 'ollama' | 'anthropic' | 'openai' | 'none';
  ollama_model: string;
  ollama_host: string;
  force_microphone: boolean;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const result = await invoke<Settings>('get_settings');
      setSettings(result);
      setError(null);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (newSettings: Settings): Promise<Settings> => {
    try {
      const saved = await invoke<Settings>('update_settings', { settings: newSettings });
      setSettings(saved);
      setError(null);
      return saved;
    } catch (err) {
      setError(err as string);
      throw err;
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  return {
    settings,
    loading,
    error,
    saveSettings,
    reloadSettings: loadSettings,
  };
}
