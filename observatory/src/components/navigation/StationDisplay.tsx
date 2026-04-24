import { TextScramble } from '@/components/effects/TextScramble';
import type { Station } from '@/lib/stations';

interface StationDisplayProps {
  station: Station;
}

export function StationDisplay({ station }: StationDisplayProps) {
  return (
    <div className="flex items-center gap-3">
      {/* Orange indicator dot — like the Braun T3 power indicator */}
      <div
        className="w-8 h-8 rounded-full bg-accent flex-shrink-0 flex items-center justify-center"
        style={{ boxShadow: '0 0 8px rgba(255,85,0,0.3), inset 0 -1px 2px rgba(0,0,0,0.15)' }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-white/50" />
      </div>

      <div>
        <div className="text-base text-ink font-mono tracking-wider">
          <TextScramble text={station.label} speed={25} />
        </div>
        <div className="text-[11px] text-ink-secondary font-mono">
          {station.number} — {station.description}
        </div>
      </div>
    </div>
  );
}
