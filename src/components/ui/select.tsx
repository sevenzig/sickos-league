import * as React from 'react';
import { cn } from '@/lib/utils';
import { density, type DensitySize } from '@/lib/density';

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Maps to density recipe control heights. Defaults to md (h-11 / 44px). */
  size?: DensitySize;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, size = 'md', children, ...props }, ref) => {
    return (
      <select
        className={cn(
          'flex w-full rounded-md border border-input bg-slate-900/80 px-3 py-2 text-label text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
          density[size].control,
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = 'Select';

export { Select };
