import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import RecorderPanel from './components/RecorderPanel';
import LiveNotes from './components/LiveNotes';
import SettingsPanel from './components/SettingsPanel';
import PostCallScreen from './components/PostCallScreen';
import SessionsHistory from './components/SessionsHistory';
import { useAudio } from './hooks/useAudio';
import { Button, Pill } from '@oatmeal/ui';
import { Settings } from 'lucide-react';

export type AppState = 'idle' | 'recording' | 'processing' | 'post-call';

function App() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { isRecording, setIsRecording, transcript, setTranscript, frameCount, resetAudio, startRecording, getRecordingDuration, levels } = useAudio();
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'undetermined' | 'unknown'>('unknown');
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);

  // Enable dark mode by default
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await invoke('initialize_app');
        
        // Check microphone permissions
        try {
          const permission = await invoke<string>('check_microphone_permission');
          setPermissionStatus(permission as 'granted' | 'denied' | 'undetermined' | 'unknown');
        } catch (error) {
          console.warn('Could not check microphone permission:', error);
          setPermissionStatus('unknown');
        }
        
        // Initialize whisper model (using local GGML models)
        console.log('Initializing local Whisper transcriber...');
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
      setIsRecording(true);
      setAppState('recording');
      resetAudio();
      await startRecording();
    } catch (error) {
      console.error('Failed to start recording:', error);
      setIsRecording(false);
      setAppState('idle');
      
      // Check if it's a permission error
      const errorMessage = error?.toString() || '';
      if (errorMessage.includes('permission')) {
        setShowPermissionDialog(true);
        // Re-check permission status
        try {
          const permission = await invoke<string>('check_microphone_permission');
          setPermissionStatus(permission as 'granted' | 'denied' | 'undetermined' | 'unknown');
        } catch (permError) {
          console.warn('Could not re-check microphone permission:', permError);
        }
      }
    }
  };

  const handleStopRecording = async () => {
    try {
      await invoke('stop_recording');
      setIsRecording(false);
      setAppState('processing');
      
      // Save the session to database
      const duration = getRecordingDuration();
      const title = `Recording ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
      
      if (transcript.trim()) {
        try {
          const sessionId = await invoke<string>('save_session', {
            title,
            duration,
            transcript: transcript.trim()
          });
          console.log('Session saved with ID:', sessionId);
          setLastSessionId(sessionId);
        } catch (error) {
          console.error('Failed to save session:', error);
        }
      }
      
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

  const handleRequestPermissions = async () => {
    try {
      const granted = await invoke<boolean>('request_microphone_permission');
      if (granted) {
        setPermissionStatus('granted');
        setShowPermissionDialog(false);
      } else {
        setPermissionStatus('denied');
      }
    } catch (error) {
      console.error('Failed to request permissions:', error);
      setPermissionStatus('unknown');
    }
  };

  if (showSettings) {
    return (
      <SettingsPanel onClose={() => setShowSettings(false)} />
    );
  }

  if (showHistory) {
    return (
      <SessionsHistory onClose={() => setShowHistory(false)} />
    );
  }

  if (showPermissionDialog || (permissionStatus === 'denied' && !isRecording)) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex items-center justify-center">
        <div className="max-w-md mx-auto p-6 bg-card rounded-lg border border-black/10 dark:border-white/10">
          <div className="text-center mb-6">
            <div className="h-12 w-12 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center mx-auto mb-4">
              <svg className="h-6 w-6 text-orange-600 dark:text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">Microphone Permission Required</h2>
            <p className="text-muted-foreground text-sm">
              Oatmeal needs microphone access to transcribe your meetings and calls for note-taking and AI-powered summaries.
            </p>
          </div>
          
          {permissionStatus === 'denied' ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Please enable microphone access in:
                <br />
                <strong>System Preferences → Security & Privacy → Microphone</strong>
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => {
                  setShowPermissionDialog(false);
                  setPermissionStatus('unknown');
                }} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={async () => {
                  // Re-check permission status
                  try {
                    const permission = await invoke<string>('check_microphone_permission');
                    setPermissionStatus(permission as 'granted' | 'denied' | 'undetermined' | 'unknown');
                    if (permission === 'granted') {
                      setShowPermissionDialog(false);
                    }
                  } catch (error) {
                    console.warn('Could not check microphone permission:', error);
                  }
                }} className="flex-1">
                  Check Again
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowPermissionDialog(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleRequestPermissions} className="flex-1">
                  Allow Access
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (appState === 'post-call') {
    return (
      <PostCallScreen 
        transcript={transcript}
        sessionId={lastSessionId}
        onClose={() => setAppState('idle')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Oatmeal Header */}
      <header className="flex items-center justify-between p-6 border-b border-black/10 dark:border-white/10">
        <div className="flex items-center gap-3">
          {/* Logo with gradient */}
          <div 
            className="h-9 w-9 rounded-full"
            style={{
              background: 'linear-gradient(135deg, #2F7D32, #55A84A)'
            }}
          />
          <h1 className="text-2xl font-semibold">oatmeal</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setShowHistory(true)}>
            History
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)}>
            <Settings className="h-4 w-4" />
          </Button>
          
          {/* Audio Status Indicator */}
          {!isRecording && permissionStatus === 'granted' && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-brand-sprout animate-pulse" />
              Smart Audio
            </div>
          )}
          
          {!isRecording && permissionStatus === 'denied' && (
            <div className="flex items-center gap-1 text-xs text-red-500 cursor-pointer" onClick={() => setShowPermissionDialog(true)}>
              <div className="h-2 w-2 rounded-full bg-red-500" />
              No Microphone Access
            </div>
          )}
          
          {!isRecording && (
            <Button onClick={handleStartRecording}>
              New Note
            </Button>
          )}
          {isRecording && (
            <Button variant="destructive" onClick={handleStopRecording}>
              Stop Recording
            </Button>
          )}
        </div>
      </header>


      {appState === 'idle' && (
        <div className="flex-1 flex items-center justify-center">
          <Button onClick={handleStartRecording} size="lg">
            Start Recording (⌘⇧R)
          </Button>
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
