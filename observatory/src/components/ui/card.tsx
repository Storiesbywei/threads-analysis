import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  dotMatrix?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, dotMatrix = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg bg-surface-raised shadow-raised relative overflow-hidden',
          className,
        )}
        {...props}
      >
        {dotMatrix && (
          <div className="absolute inset-0 dot-matrix-muted pointer-events-none" aria-hidden="true" />
        )}
        <div className="relative z-10">{children}</div>
      </div>
    );
  },
);
Card.displayName = 'Card';

export const CardHeader = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-5 py-4 border-b border-divider/50', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-5 py-4', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';
