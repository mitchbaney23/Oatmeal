import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const pillVariants = cva(
  'inline-flex items-center rounded-full px-2 h-6 text-xs font-medium ring-1 transition-colors',
  {
    variants: {
      variant: {
        success: 'bg-success/15 text-success ring-success/30',
        warn: 'bg-warn/15 text-warn ring-warn/30', 
        error: 'bg-error/15 text-error ring-error/30',
        info: 'bg-info/15 text-info ring-info/30',
        champion: 'bg-success/15 text-success ring-success/30',
        budget: 'bg-brand-oat/15 text-brand-oat ring-brand-oat/30',
        buyer: 'bg-indigo-500/15 text-indigo-500 ring-indigo-500/30',
        criteria: 'bg-info/15 text-info ring-info/30',
        risk: 'bg-warn/15 text-warn ring-warn/30',
        blocker: 'bg-error/15 text-error ring-error/30',
        meddpicc: 'bg-brand-sprout/15 text-brand-sprout ring-brand-sprout/30'
      }
    },
    defaultVariants: {
      variant: 'info'
    }
  }
);

export interface PillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillVariants> {
  children: React.ReactNode;
}

const Pill = React.forwardRef<HTMLSpanElement, PillProps>(
  ({ className, variant, children, ...props }, ref) => {
    return (
      <span
        className={cn(pillVariants({ variant, className }))}
        ref={ref}
        {...props}
      >
        {children}
      </span>
    );
  }
);
Pill.displayName = 'Pill';

export { Pill, pillVariants };