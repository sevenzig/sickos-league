import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { density, type DensitySize } from '@/lib/density';

const panelVariants = cva(
  'bg-gradient-to-br from-slate-800/95 to-slate-900/95 backdrop-blur-sm rounded-panel border border-slate-700/50 shadow-panel',
  {
    variants: {
      padding: {
        none: '',
        sm: density.sm.pad,
        md: density.md.pad,
        lg: density.lg.pad,
        xl: density.xl.pad,
        default: 'p-6',
      },
    },
    defaultVariants: {
      padding: 'default',
    },
  }
);

export interface PanelProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof panelVariants> {
  /** Alias for padding size when using density recipes */
  size?: DensitySize | 'default' | 'none';
}

const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
  ({ className, padding, size, ...props }, ref) => {
    const resolvedPadding = padding ?? size ?? 'default';
    return (
      <div
        ref={ref}
        className={cn(panelVariants({ padding: resolvedPadding }), className)}
        {...props}
      />
    );
  }
);
Panel.displayName = 'Panel';

export { Panel, panelVariants };
