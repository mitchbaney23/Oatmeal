import React from 'react';

type PillColor = 'success' | 'warn' | 'error' | 'info' | 'oat' | 'sprout';

const map: Record<PillColor, string> = {
  success: 'bg-success/15 text-success ring-success/30',
  warn: 'bg-warn/15 text-warn ring-warn/30',
  error: 'bg-error/15 text-error ring-error/30',
  info: 'bg-info/15 text-info ring-info/30',
  oat: 'bg-brand-oat/20 text-brand-oat ring-brand-oat/30',
  sprout: 'bg-sprout-100 text-brand-sprout ring-brand-sprout/30',
};

export function Pill({ color = 'success', children }: { color?: PillColor; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 h-6 text-xs font-medium ring-1 ${map[color]}`}>
      {children}
    </span>
  );
}

