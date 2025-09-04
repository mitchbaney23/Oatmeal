import { useEffect, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { Button } from '@oatmeal/ui';
import { X, Cpu, Bot } from 'lucide-react';
import { useSettings, type Settings as BackendSettings } from '../hooks/useSettings';

interface SettingsPanelProps {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, loading, error, saveSettings, reloadSettings } = useSettings();
  const [draft, setDraft] = useState<BackendSettings | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [dirty, setDirty] = useState(false);

  const normalize = (s: BackendSettings): BackendSettings => ({
    ...s,
    chunk_seconds: Number.isFinite(Number(s.chunk_seconds)) ? Number(s.chunk_seconds) : 2.5,
  });

  useEffect(() => {
    if (!settings) return;
    // Only hydrate from backend if not initialized yet, or if not dirty
    if (!initialized || !dirty) {
      setDraft(normalize(settings as BackendSettings));
      if (!initialized) setInitialized(true);
    }
  }, [settings, initialized, dirty]);

  const handleSave = async () => {
    if (!draft) return;
    try {
      const saved = await saveSettings(normalize(draft));
      await emit('settings:updated', saved);
      // Extra safety: re-fetch to ensure UI reflects DB
      await reloadSettings();
      setDraft(normalize(saved));
      setDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      // Error already captured in hook; keep UI responsive
      console.error('Failed to save settings', e);
    }
  };

  const handleClose = async () => {
    // Auto-save when closing
    if (draft && settings) {
      // Check if there are any changes
      const hasChanges = JSON.stringify(draft) !== JSON.stringify(settings);
      if (hasChanges) {
        try {
          await saveSettings(draft);
        } catch (e) {
          console.error('Failed to auto-save settings on close', e);
        }
      }
    }
    onClose();
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Settings</h1>
          <div className="flex items-center gap-3">
            {savedFlash && (
              <span className="text-xs px-2 py-1 rounded bg-emerald-600/10 text-emerald-600 border border-emerald-600/30">Saved</span>
            )}
            <Button variant="ghost" size="sm" onClick={handleClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {loading && (
          <div className="bg-card border border-border rounded-2xl p-6 mb-6 text-sm text-muted-foreground">
            Loading settings...
          </div>
        )}
        {error && (
          <div className="bg-destructive/10 border border-destructive rounded-2xl p-4 mb-6 text-sm">
            Failed to load settings: {String(error)}
          </div>
        )}

        <div className="space-y-8">

          <section className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Performance</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Transcription chunk length</p>
                  <p className="text-sm text-muted-foreground">How many seconds of audio to batch per step</p>
                </div>
                <input
                  type="number"
                  min={1}
                  max={6}
                  step={0.5}
                  value={draft?.chunk_seconds ?? 2.5}
                  onChange={(e) => {
                    const raw = (e.target as HTMLInputElement).valueAsNumber;
                    if (!draft) return;
                    if (Number.isNaN(raw)) return; // ignore transient empty state
                    const val = Math.max(1, Math.min(6, raw));
                    setDraft(prev => ({ ...(prev as BackendSettings), chunk_seconds: val }));
                    setDirty(true);
                  }}
                  className="w-24 px-3 py-1 border border-border rounded-md bg-background text-right"
                  disabled={!draft}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Force microphone input</p>
                  <p className="text-sm text-muted-foreground">Ignore system-audio capture when headphones are detected</p>
                </div>
                <input
                  type="checkbox"
                  checked={!!draft?.force_microphone}
                  onChange={(e) => draft && (setDraft(prev => ({ ...(prev as BackendSettings), force_microphone: (e.target as HTMLInputElement).checked })), setDirty(true))}
                  className="h-4 w-4"
                  disabled={!draft}
                />
              </div>

            </div>
          </section>

          <section className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Bot className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Summaries</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Summary engine</p>
                  <p className="text-sm text-muted-foreground">Choose where to generate AI summaries</p>
                </div>
                <select
                  value={draft?.summary_engine ?? 'ollama'}
                  onChange={(e) => draft && setDraft(prev => ({ ...(prev as BackendSettings), summary_engine: e.target.value as any }))}
                  className="px-3 py-1 border border-border rounded-md bg-background"
                  disabled={!draft}
                >
                  <option value="ollama">Local (Ollama)</option>
                  <option value="anthropic">Claude (cloud)</option>
                  <option value="openai">OpenAI (cloud)</option>
                  <option value="none">Disabled</option>
                </select>
              </div>

              {draft?.summary_engine === 'ollama' && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Ollama model</p>
                      <p className="text-sm text-muted-foreground">e.g., llama3.1:8b-instruct-q4_K_M</p>
                    </div>
                    <input
                      type="text"
                      value={draft?.ollama_model ?? ''}
                      onChange={(e) => draft && setDraft(prev => ({ ...(prev as BackendSettings), ollama_model: e.target.value }))}
                      className="w-72 px-3 py-1 border border-border rounded-md bg-background"
                      disabled={!draft}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Ollama host</p>
                      <p className="text-sm text-muted-foreground">Local server URL</p>
                    </div>
                    <input
                      type="text"
                      value={draft?.ollama_host ?? 'http://127.0.0.1:11434'}
                      onChange={(e) => draft && setDraft(prev => ({ ...(prev as BackendSettings), ollama_host: e.target.value }))}
                      className="w-72 px-3 py-1 border border-border rounded-md bg-background"
                      disabled={!draft}
                    />
                  </div>
                </>
              )}
            </div>
          </section>

          
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
          <Button onClick={handleSave} disabled={!draft}>
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
