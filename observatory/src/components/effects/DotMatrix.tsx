interface DotMatrixProps {
  className?: string;
  muted?: boolean;
}

export function DotMatrix({ className = '', muted = false }: DotMatrixProps) {
  return (
    <div
      className={`absolute inset-0 pointer-events-none ${muted ? 'dot-matrix-muted' : 'dot-matrix'} ${className}`}
      aria-hidden="true"
    />
  );
}
