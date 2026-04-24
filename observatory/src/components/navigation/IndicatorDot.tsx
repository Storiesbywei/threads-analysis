import { cn } from '@/lib/utils';

interface IndicatorDotProps {
  status: 'active' | 'inactive' | 'error' | 'loading';
  label?: string;
  className?: string;
}

const statusStyles = {
  active: 'bg-accent shadow-[0_0_8px_rgba(255,85,0,0.4)] animate-pulse-soft',
  inactive: 'bg-ink-muted',
  error: 'bg-[#C02820] shadow-[0_0_8px_rgba(192,40,32,0.3)]',
  loading: 'bg-accent/50 animate-pulse',
};

export function IndicatorDot({ status, label, className }: IndicatorDotProps) {
  return (
    <div className={cn('group relative', className)} title={label}>
      <div className={cn('w-2 h-2 rounded-full transition-all duration-300', statusStyles[status])} />
      {label && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-surface-raised border border-divider rounded text-[10px] font-mono text-ink-secondary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-raised">
          {label}
        </div>
      )}
    </div>
  );
}
