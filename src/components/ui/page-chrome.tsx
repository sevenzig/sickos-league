import * as React from 'react';
import { cn } from '@/lib/utils';
import { Panel } from '@/components/ui/panel';

export interface PageChromeProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * Shared page title bar — replaces repeated h-[74px] gradient headers.
 */
const PageChrome = React.forwardRef<HTMLDivElement, PageChromeProps>(
  ({ className, title, actions, children, ...props }, ref) => {
    return (
      <Panel
        ref={ref}
        padding="none"
        className={cn(
          'min-h-[74px] px-6 sm:px-8 flex items-center justify-between gap-4',
          className
        )}
        {...props}
      >
        <div className="min-w-0 flex-1">
          {typeof title === 'string' ? (
            <h1 className="text-title text-slate-50 truncate">{title}</h1>
          ) : (
            title
          )}
        </div>
        {actions ? <div className="flex items-center gap-2 flex-shrink-0">{actions}</div> : null}
        {children}
      </Panel>
    );
  }
);
PageChrome.displayName = 'PageChrome';

export { PageChrome };
