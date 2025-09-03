import { Settings, Mic, MicOff, FileText, Circle, History } from 'lucide-react';
// import LogoUrl from '../assets/oatmeal-logo.png';
import { Button } from '@oatmeal/ui';

interface MenuBarProps {
  onSettings: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onQuickNote: () => void;
  onHistory: () => void;
  isRecording: boolean;
}

export default function MenuBar({
  onSettings,
  onStartRecording,
  onStopRecording,
  onQuickNote,
  onHistory,
  isRecording
}: MenuBarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-card/95 backdrop-blur border-b border-border">
      <div className="flex items-center gap-2">
        <div 
          className="h-7 w-7 rounded-sm shadow-card"
          style={{
            background: 'linear-gradient(135deg, #2F7D32, #55A84A)'
          }}
        />
        <h1 className="text-lg font-semibold">Oatmeal</h1>
        {isRecording && (
          <span className="ml-3 inline-flex items-center gap-1 text-xs text-destructive">
            <Circle className="w-3 h-3 fill-current" />
            Live
          </span>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onQuickNote}
          className="flex items-center gap-2"
        >
          <FileText className="w-4 h-4" />
          Quick Note (⌘⇧N)
        </Button>
        
        {isRecording ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={onStopRecording}
            className="flex items-center gap-2"
          >
            <MicOff className="w-4 h-4" />
            Stop (⌘⇧R)
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={onStartRecording}
            className="flex items-center gap-2"
          >
            <Mic className="w-4 h-4" />
            Record (⌘⇧R)
          </Button>
        )}
        
        <Button
          variant="ghost"
          size="sm"
          onClick={onHistory}
          className="flex items-center gap-2"
        >
          <History className="w-4 h-4" />
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={onSettings}
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
