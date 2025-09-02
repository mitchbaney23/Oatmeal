import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Button } from '@oatmeal/ui';
import { Clock, FileText } from 'lucide-react';

interface SessionRecord {
  id: string;
  title: string;
  date: string;
  duration: number;
  transcript?: string;
  summary?: string;
  artifacts?: string;
  created_at: string;
  updated_at: string;
}

interface SessionsHistoryProps {
  onClose: () => void;
}

export default function SessionsHistory({ onClose }: SessionsHistoryProps) {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const sessionList = await invoke<SessionRecord[]>('list_sessions', { limit: 20 });
      setSessions(sessionList);
    } catch (err) {
      setError(err as string);
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold">Recording History</h1>
            <Button variant="ghost" onClick={onClose}>
              ✕
            </Button>
          </div>
          <div className="text-center">Loading sessions...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold">Recording History</h1>
            <Button variant="ghost" onClick={onClose}>
              ✕
            </Button>
          </div>
          <div className="text-center text-red-600">Error: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Recording History</h1>
          <Button variant="ghost" onClick={onClose}>
            ✕
          </Button>
        </div>

        {sessions.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <FileText size={48} className="mx-auto mb-4 opacity-50" />
            <p>No recordings yet</p>
            <p className="text-sm">Start your first recording to see it here</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sessions List */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Recent Sessions</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedSession?.id === session.id
                        ? 'bg-primary/10 border-primary'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedSession(session)}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium truncate">{session.title}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock size={14} />
                        {formatDuration(session.duration)}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatDate(session.created_at)}
                    </p>
                    {session.transcript && (
                      <p className="text-sm mt-2 text-muted-foreground line-clamp-2">
                        {session.transcript.slice(0, 100)}...
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Session Details */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Session Details</h2>
              {selectedSession ? (
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium mb-2">{selectedSession.title}</h3>
                  <div className="space-y-2 text-sm text-muted-foreground mb-4">
                    <div>Duration: {formatDuration(selectedSession.duration)}</div>
                    <div>Date: {formatDate(selectedSession.created_at)}</div>
                  </div>
                  
                  {selectedSession.transcript && (
                    <div className="space-y-2">
                      <h4 className="font-medium">Transcript</h4>
                      <div className="bg-muted/30 p-3 rounded text-sm max-h-64 overflow-y-auto whitespace-pre-wrap">
                        {selectedSession.transcript}
                      </div>
                    </div>
                  )}
                  
                  {selectedSession.summary && (
                    <div className="space-y-2 mt-4">
                      <h4 className="font-medium">Summary</h4>
                      <div className="bg-muted/30 p-3 rounded text-sm">
                        {selectedSession.summary}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="border rounded-lg p-4 text-center text-muted-foreground">
                  Select a session to view details
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}