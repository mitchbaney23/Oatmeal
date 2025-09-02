import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import MenuBar from './components/MenuBar';
import RecorderPanel from './components/RecorderPanel';
import LiveNotes from './components/LiveNotes';
import SettingsPanel from './components/SettingsPanel';
import PostCallScreen from './components/PostCallScreen';
import { useAudio } from './hooks/useAudio';

export type AppState = 'idle' | 'recording' | 'processing' | 'post-call';

function App() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [showSettings, setShowSettings] = useState(false);
  const { isRecording, setIsRecording, transcript, setTranscript, frameCount, resetAudio, levels } = useAudio();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await invoke('initialize_app');
        
        // Download and initialize whisper model
        console.log('Downloading whisper-small.en model...');
        await invoke('download_whisper_model', { 
          modelName: 'openai/whisper-small.en' 
        });
        
        await invoke('initialize_transcriber');
        console.log('Transcriber ready!');
      } catch (error) {
        console.error('Failed to initialize app:', error);
      }
    };

    initializeApp();
  }, []);

  const handleStartRecording = async () => {
    try {
      await invoke('start_recording');
      setIsRecording(true);
      setAppState('recording');
      resetAudio();
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const handleStopRecording = async () => {
    try {
      await invoke('stop_recording');
      setIsRecording(false);
      setAppState('processing');
      setTimeout(() => setAppState('post-call'), 2000);
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  const handleQuickNote = async () => {
    try {
      await invoke('create_quick_note');
    } catch (error) {
      console.error('Failed to create quick note:', error);
    }
  };

  if (showSettings) {
    return (
      <SettingsPanel onClose={() => setShowSettings(false)} />
    );
  }

  if (appState === 'post-call') {
    return (
      <PostCallScreen 
        transcript={transcript}
        onClose={() => setAppState('idle')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MenuBar 
        onSettings={() => setShowSettings(true)}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onQuickNote={handleQuickNote}
        isRecording={isRecording}
      />
      {appState === 'idle' && (
        <div className="max-w-3xl mx-auto p-10">
          <div className="bg-card border border-border rounded-2xl p-10 text-center">
            <div className="w-3 h-3 bg-muted-foreground rounded-full mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Ready to capture your next call</h2>
            <p className="text-sm text-muted-foreground mb-6">Privacy-first recording with live notes and smart summaries.</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleStartRecording}
                className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90"
              >
                Start Recording (⌘⇧R)
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="inline-flex items-center px-4 py-2 rounded-md border border-border hover:bg-muted/50"
              >
                Settings
              </button>
            </div>
          </div>
        </div>
      )}
      
      {appState === 'recording' && (
        <div className="max-w-6xl mx-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-[24rem_1fr] gap-6">
            <RecorderPanel 
              isRecording={isRecording}
              onStop={handleStopRecording}
              levels={levels}
            />
            <LiveNotes 
              transcript={transcript}
              onTranscriptUpdate={setTranscript}
              frameCount={frameCount}
            />
          </div>
        </div>
      )}
      
      {appState === 'processing' && (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Processing recording...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
