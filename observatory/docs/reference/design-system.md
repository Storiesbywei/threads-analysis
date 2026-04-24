# Observatory Design System — Braun/Rams Reference

## Core Palette (from Braun product analysis)

```css
--braun-white:      #F0EDE5;  /* Primary housing — warm off-white */
--braun-surface:    #E6E2DA;  /* Secondary/recessed surfaces */
--braun-pebble:     #C5C3BE;  /* Light controls, button surfaces */
--braun-grey:       #8A8A87;  /* Secondary text, inactive elements */
--braun-anthracite: #2E2E2C;  /* Dark elements, speaker grille background */
--braun-ink:        #1A1A18;  /* Typography only */
--accent-orange:    #FF5500;  /* Single functional accent — indicator dot */
--accent-red:       #C02820;  /* Error/danger only */
```

## Design Rules

1. **Warm white housing, never cool/clinical white.** #F0EDE5 not #FFFFFF
2. **Single accent color (orange #FF5500), one meaning only** — active/power state
3. **Typography: lowercase, light weight, generous letter-spacing** — Akzidenz-Grotesk lineage (Inter or Aktiv Grotesk on web)
4. **Hierarchy through weight/size, never through color** — bold vs light, large vs small
5. **40% visual silence** — reserve significant area for breathing room (T1000 speaker grille principle)
6. **Layered box-shadows for physical presence** — contact + near + ambient, never a single flat shadow
7. **Molded form** — subtle gradients implying curvature, not flat cards floating in space
8. **Controls recessed into the body** — inset shadows for input areas
9. **No decoration** — every visual element maps to a function
10. **The design should feel like you could pick it up**

## CSS Patterns

### Housing
```css
background: linear-gradient(165deg, #F2EEE6 0%, #E8E4DC 100%);
border-radius: 12px;
border: 1px solid #D5D0C8;
box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 4px 8px rgba(0,0,0,0.04), 0 12px 24px rgba(0,0,0,0.03);
```

### Recessed Panel
```css
background: #E6E2DA;
border-radius: 8px;
box-shadow: inset 0 2px 4px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(255,255,255,0.4);
border: 1px solid rgba(0,0,0,0.06);
```

### Speaker Grille (dot matrix)
```css
background: radial-gradient(circle, #1a1a1a 1.5px, transparent 1.5px);
background-size: 10px 10px;
background-color: #E8E4DC;
```

### Indicator Dot (active)
```css
width: 12px; height: 12px; border-radius: 50%;
background: #FF5500;
box-shadow: 0 0 8px rgba(255,85,0,0.4), inset 0 -1px 2px rgba(0,0,0,0.2);
```

### Knob
```css
background: radial-gradient(circle at 35% 35%, #ffffff, #c8c8c8);
box-shadow: 0 4px 12px rgba(0,0,0,0.15), inset 0 1px 3px rgba(255,255,255,0.6);
```

## Typography
- **Body/labels:** Inter 400, lowercase, tracking 0.04em
- **Data readouts:** Share Tech Mono 400
- **Section titles:** Cinzel 400 (archaic serif for the observatory context)
- **Color:** #1A1A18 only, never colored text
- **Secondary text:** #8A8A87

## Inspirations
- Braun T3 Pocket Radio (1958) — flush surfaces, 60/40 grille/control split
- Braun T1000 World Receiver (1963) — information density, 12 parallel scales, one red accent
- Braun ET66 Calculator (1987) — color as information hierarchy, generous negative space
- Braun SK4 Record Player (1956) — transparency, material honesty
- Tektronix 465 Oscilloscope (1972) — functional zoning, graticule grid, color-coded channels
- McIntosh MC2105 Amplifier (1967) — backlit meters, reverse-printed nomenclature
- Gossen Luna-Pro Light Meter (1965) — concentric multi-scale dials
- Breitling Navitimer 806 (1952) — extreme info density through strict hierarchy
