import * as React from 'react';
import { cn } from '@/lib/utils';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn('text-label font-medium text-slate-300', className)}
      {...props}
    />
  )
);
Label.displayName = 'Label';

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

const FormField: React.FC<FormFieldProps> = ({ label, htmlFor, error, hint, className, children }) => (
  <div className={cn('space-y-1.5', className)}>
    <Label htmlFor={htmlFor}>{label}</Label>
    {children}
    {hint && !error && <p className="text-caption text-muted-foreground">{hint}</p>}
    {error && <p className="text-caption text-destructive">{error}</p>}
  </div>
);
FormField.displayName = 'FormField';

export { Label, FormField };
