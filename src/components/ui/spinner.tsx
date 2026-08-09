import * as React from 'react';
import { cn } from '@/lib/utils';

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Size in px — default 32 */
  size?: number;
}

const Spinner: React.FC<SpinnerProps> = ({ className, size = 32, ...props }) => (
  <div
    className={cn('animate-spin rounded-full border-b-2 border-blue-500', className)}
    style={{ width: size, height: size }}
    {...props}
  />
);
Spinner.displayName = 'Spinner';

interface LoadingBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  message?: string;
}

const LoadingBlock: React.FC<LoadingBlockProps> = ({ className, message, ...props }) => (
  <div className={cn('flex flex-col items-center justify-center py-16 gap-4', className)} {...props}>
    <Spinner size={40} />
    {message && <p className="text-body text-slate-400">{message}</p>}
  </div>
);
LoadingBlock.displayName = 'LoadingBlock';

export { Spinner, LoadingBlock };
