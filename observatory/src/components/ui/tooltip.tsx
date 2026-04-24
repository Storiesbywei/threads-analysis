import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          ref={ref}
          className={cn(
            'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50',
            'px-3 py-2 bg-surface-raised border border-divider rounded-lg shadow-raised',
            'text-xs font-mono text-ink-secondary whitespace-nowrap',
            className,
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
