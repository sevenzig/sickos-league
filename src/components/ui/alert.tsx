import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'flex gap-3 rounded-lg border p-4',
  {
    variants: {
      variant: {
        error: 'bg-danger/10 border-danger/30 text-danger',
        success: 'bg-success/10 border-success/30 text-success',
        warning: 'bg-warning/10 border-warning/30 text-warning',
        info: 'bg-blue-900/20 border-blue-700/60 text-blue-300',
      },
    },
    defaultVariants: {
      variant: 'error',
    },
  }
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  /** Optional title rendered in bold above the message */
  title?: string;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, title, children, ...props }, ref) => (
    <div ref={ref} className={cn(alertVariants({ variant }), className)} {...props}>
      <div className="min-w-0 flex-1">
        {title && <p className="text-label font-semibold mb-0.5">{title}</p>}
        <div className="text-label">{children}</div>
      </div>
    </div>
  )
);
Alert.displayName = 'Alert';

export { Alert, alertVariants };
