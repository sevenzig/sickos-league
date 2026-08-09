import * as React from 'react';
import { cn } from '@/lib/utils';
import { density, type DensitySize } from '@/lib/density';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Maps to density recipe control heights. Defaults to md (h-11 / 44px). */
  size?: DensitySize;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size = 'md', ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex w-full rounded-md border border-input bg-slate-900/80 px-3 py-2 text-label text-foreground shadow-sm transition-colors file:border-0 file:bg-transparent file:text-label file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
          density[size].control,
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
