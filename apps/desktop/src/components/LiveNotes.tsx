import { useEffect, useRef } from 'react';

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
        <h2 className="text-lg font-semibold">Live Notes</h2>
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
      
      <div className="mt-4 text-xs text-muted-foreground">
        <p>⌘⇧R to start/stop recording • ⌘⇧N for quick note</p>
      </div>
    </div>
  );
}
