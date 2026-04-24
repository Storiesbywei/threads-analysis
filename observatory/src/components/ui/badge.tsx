import { cn } from '@/lib/utils';
import { TAG_COLORS } from '@/lib/types';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tag?: string;
  variant?: 'default' | 'outline';
}

export function Badge({ tag, variant = 'default', className, children, ...props }: BadgeProps) {
  const color = tag ? TAG_COLORS[tag] ?? TAG_COLORS.unclassified : undefined;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-mono transition-colors',
        {
          'bg-surface text-ink-secondary': variant === 'default' && !color,
          'border bg-transparent': variant === 'outline',
        },
        className,
      )}
      style={
        color
          ? variant === 'default'
            ? { backgroundColor: color, color: '#1a1a1a' }
            : { borderColor: color, color }
          : undefined
      }
      {...props}
    >
      {children ?? tag}
    </span>
  );
}
