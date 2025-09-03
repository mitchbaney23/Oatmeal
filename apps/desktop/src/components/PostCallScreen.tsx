import { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@oatmeal/ui';
import { Download, Copy, X, FolderPlus, Star, CheckCircle, ThumbsUp } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { SummaryPipeline, OllamaProvider, type SummaryVariant } from '@oatmeal/llm';

interface PostCallScreenProps {
  transcript: string;
  sessionId: string | null;
  onClose: () => void;
}

export default function PostCallScreen({ transcript, sessionId, onClose }: PostCallScreenProps) {
  const [summaryMd, setSummaryMd] = useState<string>('# Generating AI summary...');
  const [style, setStyle] = useState<'auto' | 'general' | 'sales' | 'freeform'>('freeform');
  const [busy, setBusy] = useState(false);
  const lastGoodRef = useRef<string>('');
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | ''>('');
  const [newFolderName, setNewFolderName] = useState('');
  const [saving, setSaving] = useState(false);
  
  // New state for multiple summary variants
  const [summaryVariants, setSummaryVariants] = useState<SummaryVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [showVariants, setShowVariants] = useState(false);
  const [generatingVariants, setGeneratingVariants] = useState(false);

  const generateSummary = useCallback(async () => {
    if (!transcript || !transcript.trim()) return;
    const toDisplay = (val: unknown) => {
      if (typeof val === 'string') return val;
      try { return JSON.stringify(val, null, 2); } catch { return String(val); }
    };
    setBusy(true);
    setSummaryMd(prev => prev || '# Generating AI summary...');
    try {
      const settings = await invoke<any>('get_settings');
      if (style === 'freeform' && settings.summary_engine === 'ollama') {
        // Direct Ollama freeform markdown to avoid rigid layout
        const resp = await fetch(`${settings.ollama_host || 'http://127.0.0.1:11434'}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: settings.ollama_model,
            messages: [
              { role: 'system', content: 'You are a helpful assistant that produces a concise, well-structured Markdown summary with appropriate headings based on the content. Do not include code fences.' },
              { role: 'user', content: `Summarize the following meeting transcript as clean Markdown. Use headings you infer from the content (e.g. Overview, Key Points, Decisions, Action Items, Risks).\n\n${transcript}` }
            ],
            options: { temperature: 0.2 },
            stream: false
          })
        });
        if (!resp.ok) throw new Error(`Ollama ${resp.status}`);
        const json = await resp.json();
        const content: string = json.message?.content || '';
        const cleaned = content.replace(/```[a-z]*\n?|```\n?/g, '').trim();
        if (cleaned) {
          setSummaryMd(toDisplay(cleaned));
          lastGoodRef.current = cleaned;
          if (sessionId) await invoke('update_session_summary', { sessionId, summary: cleaned });
          return;
        }
      }

      // Use pipeline with auto or explicit style
      const openaiKey = await invoke<string | null>('get_env_var', { name: 'OPENAI_API_KEY' });
      const anthropicKey = await invoke<string | null>('get_env_var', { name: 'ANTHROPIC_API_KEY' });
      const useOllama = settings.summary_engine === 'ollama';
      const pipeline = new SummaryPipeline({
        openaiKey: settings.summary_engine === 'openai' ? (openaiKey || undefined) : undefined,
        anthropicKey: settings.summary_engine === 'anthropic' ? (anthropicKey || undefined) : undefined,
        ollama: useOllama ? { enabled: true, model: settings.ollama_model, host: settings.ollama_host } : undefined,
      });
      // For explicit override, we can bias the transcript with a hint
      const biased = style === 'general' ? `${transcript}\n\n(Hint: Non-sales internal meeting)`
        : style === 'sales' ? `${transcript}\n\n(Hint: This is a sales conversation)`
        : transcript;
      const result = await pipeline.runSummaryPipeline(biased);
      if (result.markdown) {
        setSummaryMd(toDisplay(result.markdown));
        lastGoodRef.current = result.markdown;
        if (sessionId) await invoke('update_session_summary', { sessionId, summary: result.markdown });
      }
    } catch (err) {
      console.error('Failed to generate summary:', err);
      // Preserve last good summary if present
      if (lastGoodRef.current) {
        setSummaryMd(lastGoodRef.current);
      } else {
        setSummaryMd('# Summary\n\nUnable to generate AI summary.');
      }
    } finally {
      setBusy(false);
    }
  }, [style, transcript, sessionId]);

  const generateMultipleVariants = useCallback(async () => {
    if (!transcript || !transcript.trim()) return;
    
    setGeneratingVariants(true);
    try {
      const settings = await invoke<any>('get_settings');
      if (settings.summary_engine === 'ollama') {
        const provider = new OllamaProvider({
          host: settings.ollama_host || 'http://127.0.0.1:11434',
          model: settings.ollama_model
        });
        
        const mode = style === 'sales' ? 'sales' : 'general';
        const variants = await provider.generateMultipleSummaries(transcript, mode);
        setSummaryVariants(variants);
        setShowVariants(true);
        
        // Select the first variant by default
        if (variants.length > 0) {
          setSelectedVariantId(variants[0].id);
          const firstVariant = variants[0];
          const displayed = typeof firstVariant.summary === 'string' 
            ? firstVariant.summary 
            : JSON.stringify(firstVariant.summary, null, 2);
          setSummaryMd(displayed);
        }
      }
    } catch (err) {
      console.error('Failed to generate multiple variants:', err);
    } finally {
      setGeneratingVariants(false);
    }
  }, [transcript, style]);

  const selectVariant = (variant: SummaryVariant) => {
    setSelectedVariantId(variant.id);
    const displayed = typeof variant.summary === 'string' 
      ? variant.summary 
      : JSON.stringify(variant.summary, null, 2);
    setSummaryMd(displayed);
  };

  const markVariantAsPreferred = async (variantId: string) => {
    if (!sessionId) return;
    
    try {
      // Store the preference in the database
      await invoke('store_summary_preference', {
        sessionId,
        variantId,
        rating: 5,
        chosen: true
      });
      
      // Update the session with the preferred summary
      const variant = summaryVariants.find(v => v.id === variantId);
      if (variant) {
        const summaryToStore = typeof variant.summary === 'string' 
          ? variant.summary 
          : JSON.stringify(variant.summary, null, 2);
        await invoke('update_session_summary', { sessionId, summary: summaryToStore });
      }
    } catch (err) {
      console.error('Failed to store preference:', err);
    }
  };

  useEffect(() => {
    generateSummary();
  }, [generateSummary]);

  useEffect(() => {
    const loadFolders = async () => {
      try {
        const list = await invoke<Array<{ id: string; name: string }>>('list_folders');
        setFolders(list);
      } catch (e) {
        console.warn('Failed to list folders', e);
      }
    };
    loadFolders();
  }, []);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const id = await invoke<string>('create_folder', { name: newFolderName.trim() });
      setFolders(prev => [...prev, { id, name: newFolderName.trim() }]);
      setSelectedFolderId(id);
      setNewFolderName('');
      if (sessionId) await invoke('assign_session_folder', { sessionId, folderId: id });
    } catch (e) {
      console.error('Failed to create folder', e);
    }
  };

  const handleAssignFolder = async (id: string | '') => {
    setSelectedFolderId(id);
    if (!sessionId) return;
    try {
      await invoke('assign_session_folder', { sessionId, folderId: id || null });
    } catch (e) {
      console.error('Failed to assign folder', e);
    }
  };

  const handleExportZip = () => {
    console.log('Exporting session as ZIP...');
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold bg-clip-text text-transparent" style={{backgroundImage:'linear-gradient(90deg, #2F7D32, #55A84A, #A6D49F)'}}>
            Call Summary
          </h1>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Summary</h2>
                <div className="flex items-center gap-2">
                  <select
                    value={style}
                    onChange={(e) => setStyle(e.target.value as any)}
                    className="px-3 py-1 border border-border rounded-md bg-background text-sm"
                    disabled={busy || generatingVariants}
                  >
                    <option value="auto">Auto</option>
                    <option value="general">General</option>
                    <option value="sales">Sales</option>
                    <option value="freeform">Freeform</option>
                  </select>
                  <Button size="sm" variant="outline" onClick={generateSummary} disabled={busy || generatingVariants}>
                    {busy ? 'Generating…' : 'Regenerate'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={generateMultipleVariants} disabled={busy || generatingVariants}>
                    {generatingVariants ? 'Creating Options…' : 'Get Options'}
                  </Button>
                </div>
              </div>

              {/* Variant Selection UI */}
              {showVariants && summaryVariants.length > 0 && (
                <div className="mb-4 p-3 bg-muted/20 rounded-lg">
                  <h3 className="text-sm font-medium mb-2">Choose your preferred summary style:</h3>
                  <div className="flex gap-2 mb-2">
                    {summaryVariants.map(variant => (
                      <button
                        key={variant.id}
                        onClick={() => selectVariant(variant)}
                        className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                          selectedVariantId === variant.id 
                            ? 'bg-brand-sprout text-white border-brand-sprout' 
                            : 'bg-background border-border hover:border-brand-sprout'
                        }`}
                      >
                        {variant.approach.charAt(0).toUpperCase() + variant.approach.slice(1).replace('-', ' ')}
                      </button>
                    ))}
                  </div>
                  {selectedVariantId && (
                    <div className="flex items-center gap-2">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => markVariantAsPreferred(selectedVariantId)}
                        className="text-xs"
                      >
                        <ThumbsUp className="w-3 h-3 mr-1" />
                        This is best
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        {summaryVariants.find(v => v.id === selectedVariantId)?.latencyMs}ms
                      </span>
                    </div>
                  )}
                </div>
              )}
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm">{summaryMd}</pre>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(summaryMd)}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Summary
                </Button>
                <Button size="sm" onClick={handleExportZip}>
                  <Download className="w-4 h-4 mr-2" />
                  Export ZIP
                </Button>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4">Organize</h2>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <select
                    className="px-3 py-2 border border-border rounded-md bg-background"
                    value={selectedFolderId}
                    onChange={(e) => handleAssignFolder(e.target.value)}
                  >
                    <option value="">No folder</option>
                    {folders.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                  <span className="text-sm text-muted-foreground">Assign to folder</span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="New folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="flex-1 px-3 py-2 border border-border rounded-md bg-background"
                  />
                  <Button size="sm" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
                    <FolderPlus className="w-4 h-4 mr-2" />
                    Create
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4">Transcript</h2>
            <div className="space-y-4">
              <div className="bg-muted/30 p-3 rounded text-sm max-h-[500px] overflow-y-auto whitespace-pre-wrap">
                {transcript}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
