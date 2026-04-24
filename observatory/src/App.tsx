import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { STATIONS, getStationIndex } from '@/lib/stations';
import { DeviceShell } from '@/components/DeviceShell';
import { RotaryNav } from '@/components/navigation/RotaryNav';
import { StationDisplay } from '@/components/navigation/StationDisplay';
import { StationScroller } from '@/components/navigation/StationScroller';

import SignalPage from '@/pages/SignalPage';
import EntropyPage from '@/pages/EntropyPage';
import NebulaPage from '@/pages/NebulaPage';
import CodexPage from '@/pages/CodexPage';
import CensusPage from '@/pages/CensusPage';
import PalacePage from '@/pages/PalacePage';
import PulsePage from '@/pages/PulsePage';
import NetworkPage from '@/pages/NetworkPage';
import GenesisPage from '@/pages/GenesisPage';
import RhythmPage from '@/pages/RhythmPage';
import OraclePage from '@/pages/OraclePage';
import DigestPage from '@/pages/DigestPage';

const PAGES: React.ComponentType[] = [
  SignalPage,
  EntropyPage,
  NebulaPage,
  CodexPage,
  CensusPage,
  PalacePage,
  PulsePage,
  NetworkPage,
  GenesisPage,
  RhythmPage,
  OraclePage,
  DigestPage,
];

export function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const currentIndex = Math.max(0, getStationIndex(location.pathname));
  const station = STATIONS[currentIndex] ?? STATIONS[0]!;

  // When the user swipes to a new station, update the URL.
  const handleStationChange = useCallback(
    (index: number) => {
      const target = STATIONS[index];
      if (target && target.path !== location.pathname) {
        navigate(target.path, { replace: true });
      }
    },
    [location.pathname, navigate],
  );

  // Pre-render all 12 station elements (they're stubs for now).
  const panels = useMemo(
    () => PAGES.map((Page, i) => <Page key={STATIONS[i]!.id} />),
    [],
  );

  return (
    <DeviceShell
      statusBar={<StationDisplay station={station} />}
      controls={<RotaryNav />}
    >
      <StationScroller
        currentIndex={currentIndex}
        onStationChange={handleStationChange}
      >
        {panels}
      </StationScroller>
    </DeviceShell>
  );
}
