import type { ReactNode } from 'react';

/**
 * DeviceShell — The physical device housing for the Threads Observatory.
 *
 * Renders a Braun-inspired molded plastic enclosure with three sections:
 *   1. Status bar (top) — indicator dot, station number, description
 *   2. Viewport (center) — scrollable recessed content area
 *   3. Controls (bottom) — rotary knob and branding
 *
 * The sections are separated by physical seam lines and a dot-matrix
 * grille strip, evoking the T3's perforated speaker panel and the
 * SK4's sectioned layout.
 *
 * Design references:
 *   - T3 Pocket Radio: flush surfaces, monochromatic unity, 60/40 split
 *   - SK4 Record Player: sectioned zones, material honesty
 *   - T1000 World Receiver: information density zoning, single red accent
 *   - ET66 Calculator: generous negative space, color as hierarchy
 */

interface DeviceShellProps {
  /** Top status bar content (indicator dot, station label, description) */
  statusBar: ReactNode;
  /** Bottom controls section content (rotary knob, branding) */
  controls: ReactNode;
  /** Main scrollable content area (dashboard pages) */
  children: ReactNode;
}

export function DeviceShell({ statusBar, controls, children }: DeviceShellProps) {
  return (
    /* Backdrop — cooler surface behind the device, like a desk */
    <div className="device-backdrop flex items-start justify-center px-4 py-8 sm:py-12">
      {/* Device body — the physical object */}
      <div
        className="device-body w-full"
        style={{ maxWidth: 1000 }}
      >
        {/* ── Status bar ─────────────────────────────────────── */}
        <div className="device-status-bar">
          {statusBar}
        </div>

        {/* ── Seam line (status → viewport) ───────────────────── */}
        <hr className="device-seam" />

        {/* ── Recessed viewport ────────────────────────────────── */}
        <div className="p-3 sm:p-4">
          <div className="device-viewport device-viewport-scroll">
            {children}
          </div>
        </div>

        {/* ── Grille strip (viewport → controls) ──────────────── */}
        <div className="device-grille-strip" aria-hidden="true" />

        {/* ── Controls section ─────────────────────────────────── */}
        <div className="device-controls">
          {controls}
        </div>
      </div>
    </div>
  );
}
