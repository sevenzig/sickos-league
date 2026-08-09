import * as React from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  className,
  title,
  description,
  actions,
  children,
  ...props
}) => (
  <div className={cn('py-12 text-center', className)} {...props}>
    {children && <div className="mb-4">{children}</div>}
    <p className="text-heading text-slate-300">{title}</p>
    {description && <p className="mt-2 text-body text-slate-500">{description}</p>}
    {actions && <div className="mt-6 flex justify-center gap-3">{actions}</div>}
  </div>
);
EmptyState.displayName = 'EmptyState';

export { EmptyState };
