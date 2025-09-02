import React from 'react';

interface WaveformProps {
  levels: number[]; // values 0..1
  height?: number;
  className?: string;
}

export default function Waveform({ levels, height = 36, className = '' }: WaveformProps) {
  const bars = levels.slice(-60); // ensure max 60 bars
  return (
    <div
      className={`w-full overflow-hidden rounded-md bg-muted/50 border border-border ${className}`}
      style={{ height }}
    >
      <div className="h-full flex items-end gap-[2px] px-2">
        {bars.length === 0 ? (
          <div className="text-xs text-muted-foreground m-auto">Waiting for audio…</div>
        ) : (
          bars.map((lv, i) => {
            const h = Math.max(2, Math.floor(lv * (height - 6)));
            return (
              <div
                key={i}
                className="w-[3px] bg-primary/80 rounded-sm"
                style={{ height: `${h}px` }}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

