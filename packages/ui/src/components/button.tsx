import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium shadow-card transition-colors duration-180 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[rgba(85,168,74,.6)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-brand-sprout text-white hover:bg-brand-fresh',
        secondary: 'border-2 border-brand-oat text-neutral-field dark:text-white hover:bg-neutral-oatHusk/60 dark:hover:bg-brand-oat/10',
        ghost: 'text-brand-sprout hover:bg-sprout-50 dark:hover:bg-sprout-900/20 shadow-none',
        destructive: 'bg-error text-white hover:bg-error/90',
        outline: 'border border-black/10 dark:border-white/10 bg-background hover:bg-accent hover:text-accent-foreground',
        link: 'text-brand-sprout underline-offset-4 hover:underline shadow-none'
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-6',
        icon: 'h-10 w-10'
      }
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default'
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };