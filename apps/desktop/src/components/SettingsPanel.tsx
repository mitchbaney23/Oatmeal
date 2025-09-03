import { useEffect, useState } from 'react';
import { Button } from '@oatmeal/ui';
import { X, Shield, Clock, Cpu, Zap, Bot } from 'lucide-react';
import { useSettings, type Settings as BackendSettings } from '../hooks/useSettings';

interface SettingsPanelProps {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, loading, error, saveSettings } = useSettings();
  const [draft, setDraft] = useState<BackendSettings | null>(null);

  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  const handleSave = async () => {
    if (!draft) return;
    try {
      await saveSettings(draft);
      onClose();
    } catch (e) {
      // Error already captured in hook; keep UI responsive
      console.error('Failed to save settings', e);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Settings</h1>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
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
              <Shield className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Privacy & Security</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Anonymous telemetry</p>
                  <p className="text-sm text-muted-foreground">Help improve Oatmeal with usage data</p>
                </div>
                <input
                  type="checkbox"
                  checked={!!draft?.enable_telemetry}
                  onChange={(e) => draft && setDraft(prev => ({ ...(prev as BackendSettings), enable_telemetry: e.target.checked }))}
                  className="w-4 h-4"
                  disabled={!draft}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <div>
                    <p className="font-medium">Data retention</p>
                    <p className="text-sm text-muted-foreground">Auto-delete recordings after</p>
                  </div>
                </div>
                <select
                  value={draft?.retention_days ?? 30}
                  onChange={(e) => draft && setDraft(prev => ({ ...(prev as BackendSettings), retention_days: Number(e.target.value) }))}
                  className="px-3 py-1 border border-border rounded-md bg-background"
                  disabled={!draft}
                >
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={365}>1 year</option>
                </select>
              </div>
            </div>
          </section>

          <section className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Performance</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">GPU acceleration</p>
                  <p className="text-sm text-muted-foreground">Use GPU for faster transcription</p>
                </div>
                <input
                  type="checkbox"
                  checked={!!draft?.use_gpu}
                  onChange={(e) => draft && setDraft(prev => ({ ...(prev as BackendSettings), use_gpu: e.target.checked }))}
                  className="w-4 h-4"
                  disabled={!draft}
                />
              </div>
              
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
                    const val = Math.max(1, Math.min(6, Number(e.target.value)));
                    if (draft) setDraft(prev => ({ ...(prev as BackendSettings), chunk_seconds: val }));
                  }}
                  className="w-24 px-3 py-1 border border-border rounded-md bg-background text-right"
                  disabled={!draft}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">LLM Model</p>
                  <p className="text-sm text-muted-foreground">Choose AI model for analysis</p>
                </div>
                <select
                  value={draft?.model ?? 'claude-3-5-sonnet'}
                  onChange={(e) => draft && setDraft(prev => ({ ...(prev as BackendSettings), model: e.target.value }))}
                  className="px-3 py-1 border border-border rounded-md bg-background"
                  disabled={!draft}
                >
                  <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                  <option value="gpt-4">GPT-4</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                </select>
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

          <section className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Integrations</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">HubSpot</p>
                  <p className="text-sm text-muted-foreground">Sync notes to HubSpot CRM</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {draft?.enable_hubspot ? 'Connected' : 'Disconnected'}
                  </span>
                  <input
                    type="checkbox"
                    checked={!!draft?.enable_hubspot}
                    onChange={(e) => draft && setDraft(prev => ({ ...(prev as BackendSettings), enable_hubspot: e.target.checked }))}
                    className="w-4 h-4"
                    disabled={!draft}
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Gmail</p>
                  <p className="text-sm text-muted-foreground">Create draft emails</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {draft?.enable_gmail ? 'Connected' : 'Disconnected'}
                  </span>
                  <input
                    type="checkbox"
                    checked={!!draft?.enable_gmail}
                    onChange={(e) => draft && setDraft(prev => ({ ...(prev as BackendSettings), enable_gmail: e.target.checked }))}
                    className="w-4 h-4"
                    disabled={!draft}
                  />
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!draft}>
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
