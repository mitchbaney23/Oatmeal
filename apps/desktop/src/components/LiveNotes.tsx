import { useEffect, useRef } from 'react';
import { Pill } from './Pill';

interface LiveNotesProps {
  transcript: string;
  onTranscriptUpdate: (_transcript: string) => void;
  frameCount?: number;
}

export default function LiveNotes({ transcript, frameCount = 0 }: LiveNotesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  const pretty = transcript
    .split(/(?<=[\.\!\?])\s+/)
    .filter(Boolean);

  return (
    <div className="flex-1 bg-card border border-border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold bg-clip-text text-transparent" style={{backgroundImage:'linear-gradient(90deg, #2F7D32, #55A84A, #A6D49F)'}}>
          Live Notes
        </h2>
        <div className="text-sm text-muted-foreground">
          {transcript.length} chars • {frameCount} frames
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        className="h-96 overflow-y-auto bg-muted/50 rounded-lg p-4 text-sm"
      >
        {pretty.length > 0 ? (
          <div className="space-y-3 leading-relaxed">
            {pretty.map((s, i) => (
              <p key={i}>{s}</p>
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground italic">
            Transcript will appear here during recording...
          </div>
        )}
      </div>
      
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pill color="info">MEDDPICC</Pill>
          <Pill color="success">Champion</Pill>
          <Pill color="warn">Risk</Pill>
        </div>
        <div className="text-xs text-muted-foreground">
          ⌘⇧R start/stop • ⌘⇧N quick note
        </div>
      </div>
    </div>
  );
}
