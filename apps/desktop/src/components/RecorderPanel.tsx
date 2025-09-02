import { useState, useEffect } from 'react';
import { Button } from '@oatmeal/ui';
import { Square, Bookmark } from 'lucide-react';
import Waveform from './Waveform';

interface RecorderPanelProps {
  isRecording: boolean;
  onStop: () => void;
  levels?: number[];
}

export default function RecorderPanel({ isRecording, onStop, levels = [] }: RecorderPanelProps) {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    if (isRecording) {
      interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      setDuration(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMarkMoment = () => {
    // This will insert a [[MARK]] token into the transcript
    console.log('Mark moment at', formatTime(duration));
  };

  if (!isRecording) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-6 w-96">
      <div className="text-center mb-6">
        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse mx-auto mb-2"></div>
        <p className="text-sm text-muted-foreground">Recording in progress</p>
      </div>
      
      <div className="text-3xl font-mono text-center mb-6">
        {formatTime(duration)}
      </div>

      <Waveform levels={levels} className="mb-6" />
      
      <div className="space-y-3">
        <Button
          variant="outline"
          onClick={handleMarkMoment}
          className="w-full flex items-center gap-2"
        >
          <Bookmark className="w-4 h-4" />
          Mark Moment
        </Button>
        
        <Button
          variant="destructive"
          onClick={onStop}
          className="w-full flex items-center gap-2"
        >
          <Square className="w-4 h-4" />
          Stop Recording
        </Button>
      </div>
    </div>
  );
}
