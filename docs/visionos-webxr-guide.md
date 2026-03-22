# visionOS WebXR Guide -- Vision Pro Particle Visualization

Reference documentation for building immersive WebXR data visualizations on Apple Vision Pro.
Researched March 2026. Covers visionOS 2.x + Safari 18.x WebXR behavior.

---

## Table of Contents

1. [AR Passthrough: Why It Does Not Work](#1-ar-passthrough-why-it-does-not-work)
2. [What Actually Works: immersive-vr](#2-what-actually-works-immersive-vr)
3. [Input Model: Gaze + Pinch](#3-input-model-gaze--pinch)
4. [Gesture-to-Event Mapping](#4-gesture-to-event-mapping)
5. [Hand Tracking with Three.js](#5-hand-tracking-with-threejs)
6. [Raycasting and Object Selection](#6-raycasting-and-object-selection)
7. [Locomotion and Movement](#7-locomotion-and-movement)
8. [Spatial Data Visualization UX](#8-spatial-data-visualization-ux)
9. [visionOS-Specific Quirks and Limitations](#9-visionos-specific-quirks-and-limitations)
10. [Fixing FirefliesXR.tsx](#10-fixing-firefliesxrtsx)
11. [Sources](#11-sources)

---

## 1. AR Passthrough: Why It Does Not Work

### The Short Answer

visionOS Safari **does not support `immersive-ar`** WebXR sessions. The feature flag exists in Safari settings but is non-functional. This is confirmed by Apple engineers on the Developer Forums and corroborated by every third-party source.

### The Technical Details

The WebXR spec defines two immersive session types:

| Session Mode | Description | visionOS Support |
|-------------|-------------|------------------|
| `immersive-vr` | Fully virtual environment, replaces real world | YES (default since visionOS 2.0) |
| `immersive-ar` | Digital content overlaid on real-world passthrough | NO (flag exists, non-functional) |

When you call `navigator.xr.isSessionSupported('immersive-ar')`, visionOS Safari returns `false`. The current FirefliesXR code tries AR first and falls back to VR, which is correct behavior, but means you will always get VR mode on Vision Pro.

### What About the Digital Crown?

The Digital Crown on Vision Pro controls passthrough blending for **native** visionOS apps (RealityKit/SwiftUI). WebXR sessions do **not** get this behavior. In a WebXR `immersive-vr` session:

- The Digital Crown is reserved as a **system exit gesture** (press to leave the immersive session)
- There is no programmatic or user-controlled passthrough blending
- The `environmentBlendMode` will report `opaque`, not `alpha-blend` or `additive`
- You cannot request `mesh-detection`, `plane-detection`, or `hit-test` features

### Workarounds

There are no true workarounds for AR passthrough in WebXR on visionOS. Your options:

1. **Accept VR mode.** Design a compelling virtual environment instead of relying on passthrough. This is what every shipping WebXR experience on Vision Pro does today.

2. **Build a native app.** If passthrough is essential, use RealityKit + SwiftUI with a `MixedImmersionStyle` or `FullImmersionStyle` space. Native apps get Digital Crown passthrough control.

3. **Use a transparent/dark background.** Setting `scene.background = null` with `alpha: true` on the WebGLRenderer does nothing for passthrough in `immersive-vr`, but it does make the VR environment feel less jarring (pure black matches Vision Pro's OLED panels).

4. **Wait for Apple.** The WebXR AR Module may ship in a future visionOS update. There is no public timeline.

---

## 2. What Actually Works: immersive-vr

### Session Setup

```javascript
// Check support
const supported = await navigator.xr.isSessionSupported('immersive-vr');

// Request session
const session = await navigator.xr.requestSession('immersive-vr', {
  optionalFeatures: ['local-floor', 'hand-tracking'],
});

// Bind to Three.js renderer
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
await renderer.xr.setSession(session);
```

### Supported Session Features

| Feature | Status | Notes |
|---------|--------|-------|
| `local` | YES | Origin at initial head position |
| `local-floor` | YES | Origin at floor level, recommended |
| `bounded-floor` | Partial | Falls back to `local-floor` |
| `hand-tracking` | YES | Requires feature flag on visionOS <2.0; default on 2.0+ |
| `layers` | NO | WebXR Layers API not supported |
| `mesh-detection` | NO | AR module only |
| `plane-detection` | NO | AR module only |
| `hit-test` | NO | AR module only |
| `anchors` | NO | AR module only |
| `depth-sensing` | NO | Not implemented |

### Enabling WebXR on Vision Pro

Users must enable WebXR (one-time setup):

- **visionOS 2.0+**: WebXR Device API is enabled **by default**
- **visionOS 1.x**: Settings > Apps > Safari > Advanced > Feature Flags > enable "WebXR Device API"
- **Hand tracking**: Settings > Apps > Safari > Advanced > Feature Flags > enable "WebXR Hand Input Module"

### HTTPS Requirement

All WebXR content requires HTTPS. No exceptions. For local development, use `localhost` (allowed without HTTPS) or set up a self-signed cert proxy.

---

## 3. Input Model: Gaze + Pinch

Vision Pro has no controllers. All WebXR input comes through the **natural input** system: the user looks at something (gaze) and pinches their fingers (tap) to interact.

### The `transient-pointer` Input Type

Apple introduced a new `targetRayMode` called **`transient-pointer`** specifically for Vision Pro. It is fundamentally different from `tracked-pointer` (controllers) or `gaze` (head-mounted pointer).

Key characteristics:

| Property | Behavior |
|----------|----------|
| **Lifecycle** | Input source exists ONLY during a pinch gesture. Created on pinch-start, destroyed on pinch-end. |
| **targetRaySpace** | Origin between the user's eyes, direction toward what they were looking at when the pinch began. Updates with **hand movement** (not eye movement) during the pinch. |
| **gripSpace** | Position of the pinch (where thumb meets index finger). Available for the duration of the gesture. |
| **Privacy** | Gaze direction is only revealed at the moment of pinch. No continuous eye tracking data is exposed. |

### Input Source Indexing (Critical for Three.js)

When `hand-tracking` is also requested, input sources are ordered:

| Index | Type | Description |
|-------|------|-------------|
| 0 | `tracked-pointer` | Left hand joints (persistent, no events) |
| 1 | `tracked-pointer` | Right hand joints (persistent, no events) |
| 2 | `transient-pointer` | Left hand pinch (exists only during pinch) |
| 3 | `transient-pointer` | Right hand pinch (exists only during pinch) |

**This is critical**: Many Three.js examples only listen to controllers at index 0 and 1. On Vision Pro with hand tracking enabled, the pinch events fire on indices 2 and 3. The standard `renderer.xr.getController(0)` approach works because Three.js maps events correctly, but be aware of this if accessing `inputSources` directly.

---

## 4. Gesture-to-Event Mapping

### Complete Event Sequence for a Pinch

```
User looks at target
  |
User pinches fingers together
  |
  +---> inputsourceschange (input ADDED to session.inputSources)
  +---> selectstart
  |
  |  [User moves hand while pinching = drag]
  |  [targetRaySpace updates with hand movement]
  |
User releases pinch
  |
  +---> select (the "click" equivalent)
  +---> selectend
  +---> inputsourceschange (input REMOVED from session.inputSources)
```

### Mapping Physical Gestures to WebXR Events

| Physical Gesture | WebXR Event(s) | Best Use |
|-----------------|----------------|----------|
| Look + quick pinch | `selectstart` -> `select` -> `selectend` | Tap / click / select object |
| Look + pinch + hold | `selectstart` (sustained, no `select` yet) | Begin drag, show tooltip |
| Look + pinch + move hand | `selectstart` + frame updates to `gripSpace` | Drag object, pan scene |
| Look + release pinch | `select` + `selectend` | Complete action, drop object |
| Two-hand pinch | Two separate input sources, two event streams | Zoom, rotate (custom logic) |

### Events NOT Available on Vision Pro

| Event | Status | Notes |
|-------|--------|-------|
| `squeeze` / `squeezestart` / `squeezeend` | NOT FIRED | These map to controller grip buttons, which don't exist |
| `selectstart` with `gamepad` data | NO GAMEPAD | No analog stick, trigger, or button data |
| Continuous gaze ray | NOT EXPOSED | Gaze is only revealed at pinch moment |

---

## 5. Hand Tracking with Three.js

### Setup

```javascript
// Request hand tracking when starting session
const session = await navigator.xr.requestSession('immersive-vr', {
  optionalFeatures: ['local-floor', 'hand-tracking'],
});
```

### Accessing Hand Data in Three.js

```javascript
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';

const handModelFactory = new XRHandModelFactory();

// Get hand objects (index 0 = left, index 1 = right)
const hand0 = renderer.xr.getHand(0);
const hand1 = renderer.xr.getHand(1);

// Add visual hand models to scene
const handModel0 = handModelFactory.createHandModel(hand0, 'mesh');
hand0.add(handModel0);
scene.add(hand0);

const handModel1 = handModelFactory.createHandModel(hand1, 'mesh');
hand1.add(handModel1);
scene.add(hand1);
```

**Important**: When hand tracking is enabled, YOU must render the user's hands. The system does not composite hand visuals into WebXR sessions. If you skip hand model rendering, the user sees no hands at all.

### Accessing Joint Data

The WebXR Hand Input Module exposes 25 joints per hand:

```javascript
// Joint names follow W3C WebXR Hand Input spec
const jointNames = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal',
  'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal',
  'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal',
  'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal',
  'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];

// In your render loop, access joints via the hand object
function onFrame(time, xrFrame) {
  const hand = renderer.xr.getHand(0);

  // Each joint is an XRHandSpace (extends Object3D)
  const wrist = hand.joints['wrist'];
  if (wrist) {
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    wrist.getWorldPosition(position);
    wrist.getWorldQuaternion(quaternion);
  }

  const indexTip = hand.joints['index-finger-tip'];
  const thumbTip = hand.joints['thumb-tip'];

  if (indexTip && thumbTip) {
    const indexPos = new THREE.Vector3();
    const thumbPos = new THREE.Vector3();
    indexTip.getWorldPosition(indexPos);
    thumbTip.getWorldPosition(thumbPos);

    const pinchDistance = indexPos.distanceTo(thumbPos);
    const isPinching = pinchDistance < 0.05; // 5cm threshold
  }
}
```

### Custom Pinch Detection (Beyond selectstart/selectend)

If you want finer-grained pinch detection than the binary selectstart/selectend events:

```javascript
// Reusable vectors (allocate once)
const _indexPos = new THREE.Vector3();
const _thumbPos = new THREE.Vector3();

function detectPinch(hand) {
  const indexTip = hand.joints['index-finger-tip'];
  const thumbTip = hand.joints['thumb-tip'];

  if (!indexTip?.visible || !thumbTip?.visible) return null;

  indexTip.getWorldPosition(_indexPos);
  thumbTip.getWorldPosition(_thumbPos);

  const distance = _indexPos.distanceTo(_thumbPos);

  return {
    isPinching: distance < 0.04,      // 4cm = pinching
    isNearPinch: distance < 0.08,     // 8cm = approaching pinch
    distance,
    midpoint: _indexPos.clone().lerp(_thumbPos, 0.5),
  };
}
```

### Detecting Finger Pointing

```javascript
function isFingerPointing(hand, fingerName) {
  const proximal = hand.joints[`${fingerName}-finger-phalanx-proximal`];
  const intermediate = hand.joints[`${fingerName}-finger-phalanx-intermediate`];
  const distal = hand.joints[`${fingerName}-finger-phalanx-distal`];
  const tip = hand.joints[`${fingerName}-finger-tip`];

  if (!proximal || !intermediate || !distal || !tip) return false;

  const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3();
  const _p2 = new THREE.Vector3(), _p3 = new THREE.Vector3();

  proximal.getWorldPosition(_p0);
  intermediate.getWorldPosition(_p1);
  distal.getWorldPosition(_p2);
  tip.getWorldPosition(_p3);

  const baseDir = _p1.clone().sub(_p0).normalize();
  const tipDir = _p3.clone().sub(_p2).normalize();

  // High dot product = finger is straight (pointing)
  return baseDir.dot(tipDir) > 0.85;
}

// Usage: isFingerPointing(hand, 'index')
```

### Detecting Palm Direction

```javascript
function getPalmFacing(hand, camera) {
  const wrist = hand.joints['wrist'];
  if (!wrist) return 'unknown';

  const palmNormal = new THREE.Vector3(0, -1, 0);
  const wristQuat = new THREE.Quaternion();
  wrist.getWorldQuaternion(wristQuat);
  palmNormal.applyQuaternion(wristQuat);

  const cameraForward = new THREE.Vector3(0, 0, -1);
  cameraForward.applyQuaternion(camera.quaternion);

  const dot = palmNormal.dot(cameraForward);

  if (dot > 0.5) return 'toward-user';
  if (dot < -0.5) return 'away-from-user';
  return 'sideways';
}
```

---

## 6. Raycasting and Object Selection

### Standard Three.js XR Raycasting (Works on Vision Pro)

```javascript
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();

// For point clouds, set a pick threshold (in meters)
raycaster.params.Points = { threshold: 0.08 }; // 8cm

const controller = renderer.xr.getController(0);

controller.addEventListener('selectstart', (event) => {
  // Extract ray from controller (which maps to gaze on Vision Pro)
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  const hits = raycaster.intersectObjects(selectableObjects);

  if (hits.length > 0) {
    const hit = hits[0];
    // hit.point = world position of intersection
    // hit.index = particle index (for Points geometry)
    // hit.object = the intersected Object3D
    handleSelection(hit);
  }
});
```

### Vision Pro Considerations for Raycasting

1. **Increase hit thresholds.** Gaze precision is lower than mouse precision. For particle clouds, use 8-12cm thresholds instead of the typical 2-5cm.

2. **Visual feedback on gaze.** Since you cannot see continuous gaze, provide hover feedback when the user's gaze ray (during a pinch) passes over interactive objects. Use `selectstart` to begin highlighting, update each frame.

3. **Forgiving selection.** If the user pinch-selects near but not exactly on a particle, consider snapping to the nearest particle within a generous radius.

```javascript
// Forgiving nearest-particle selection
function findNearestParticle(rayOrigin, rayDirection, positions, maxDistance = 0.15) {
  let bestIdx = -1;
  let bestDist = maxDistance;
  const particlePos = new THREE.Vector3();
  const projected = new THREE.Vector3();

  for (let i = 0; i < positions.count; i++) {
    particlePos.fromBufferAttribute(positions, i);

    // Project particle onto ray, find distance
    projected.copy(particlePos).sub(rayOrigin);
    const t = projected.dot(rayDirection);
    if (t < 0) continue; // behind the ray

    projected.copy(rayDirection).multiplyScalar(t).add(rayOrigin);
    const dist = projected.distanceTo(particlePos);

    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  return bestIdx;
}
```

---

## 7. Locomotion and Movement

### Recommended Approaches for Vision Pro

Vision Pro is primarily a seated/standing experience. Aggressive locomotion causes discomfort. Ranked by comfort:

| Method | Comfort | Implementation |
|--------|---------|----------------|
| **Gaze + pinch-drag to pan** | HIGH | Move camera rig opposite to hand delta |
| **Pinch-to-zoom** (two hands) | HIGH | Scale scene or move camera along look vector |
| **Teleportation** | MEDIUM | Pinch a floor/node target to jump there |
| **Continuous fly** (WASD in VR) | LOW | Causes vection / nausea, avoid |

### Grab-to-Pan Implementation (Already in FirefliesXR)

The current FirefliesXR grab locomotion is a good approach. Here is the pattern:

```javascript
let isGrabbing = false;
let grabStartPos = new THREE.Vector3();
let rigStartPos = new THREE.Vector3();

controller.addEventListener('selectstart', (event) => {
  // If no object was hit, start grab locomotion
  if (!objectHit) {
    isGrabbing = true;
    grabStartPos.setFromMatrixPosition(controller.matrixWorld);
    rigStartPos.copy(cameraRig.position);
  }
});

controller.addEventListener('selectend', () => {
  isGrabbing = false;
});

// In render loop
function updateLocomotion() {
  if (!isGrabbing) return;

  const currentPos = new THREE.Vector3();
  currentPos.setFromMatrixPosition(controller.matrixWorld);

  // Move rig in opposite direction of hand movement (pull-to-move)
  const delta = grabStartPos.clone().sub(currentPos);
  cameraRig.position.copy(rigStartPos).add(delta);
}
```

### Two-Hand Zoom

```javascript
let hand0Pos = new THREE.Vector3();
let hand1Pos = new THREE.Vector3();
let initialSpan = 0;
let initialScale = 1;

function checkTwoHandZoom() {
  const sources = renderer.xr.getSession()?.inputSources;
  if (!sources) return;

  // Find active transient-pointers (pinching hands)
  const pinching = [];
  for (const source of sources) {
    if (source.targetRayMode === 'transient-pointer' && source.gripSpace) {
      pinching.push(source);
    }
  }

  if (pinching.length === 2) {
    const frame = renderer.xr.getFrame();
    const refSpace = renderer.xr.getReferenceSpace();
    const pose0 = frame.getPose(pinching[0].gripSpace, refSpace);
    const pose1 = frame.getPose(pinching[1].gripSpace, refSpace);

    if (pose0 && pose1) {
      const p0 = new THREE.Vector3().copy(pose0.transform.position);
      const p1 = new THREE.Vector3().copy(pose1.transform.position);
      const span = p0.distanceTo(p1);

      if (initialSpan === 0) {
        initialSpan = span;
        initialScale = galaxyGroup.scale.x;
      } else {
        const scaleFactor = span / initialSpan;
        const newScale = THREE.MathUtils.clamp(initialScale * scaleFactor, 0.2, 5.0);
        galaxyGroup.scale.setScalar(newScale);
      }
    }
  } else {
    initialSpan = 0; // reset when not two-hand pinching
  }
}
```

---

## 8. Spatial Data Visualization UX

### Content Placement

Apple's spatial design guidelines recommend:

| Zone | Distance | Use |
|------|----------|-----|
| **Near field** | 0.5 - 1.0m | Interactive controls, tooltips, detail panels |
| **Comfort zone** | 1.0 - 2.0m | Primary content, main visualization |
| **Mid field** | 2.0 - 4.0m | Context, secondary information |
| **Far field** | 4.0 - 20.0m | Environment, background elements |

For the particle visualization:
- Place the galaxy/cluster center at ~2-3m (the current `SPHERE_RADIUS = 3` is good)
- Tooltips/labels should appear 0.5-1.0m from the user, not at the particle position
- Keep UI panels (legends, stats) at 1.0-1.5m, slightly below eye level

### Field of View

- Comfortable horizontal FOV: 60 degrees (30 left + 30 right)
- Comfortable vertical FOV: 40 degrees (20 up + 20 down)
- Content requiring neck movement: acceptable but fatiguing
- Content behind the user: never

For a particle cloud, this means the initial view should show the most interesting clusters directly ahead, with the full galaxy wrapping around the user's comfortable arc.

### Interaction Patterns for Data Viz

| Pattern | Description | Implementation |
|---------|-------------|----------------|
| **Look + tap to inspect** | Pinch a particle to see its details | `selectstart` -> raycast -> show label |
| **Pinch-drag to orbit** | Grab empty space to rotate the cloud | Modify galaxy group rotation |
| **Two-hand scale** | Pinch with both hands to zoom in/out | Scale galaxy group |
| **Proximity reveal** | Details appear as user moves closer | Distance check in render loop |
| **Cluster glow** | Highlight related particles on select | Modify alpha/size attributes |
| **Audio spatialization** | Data-driven ambient sound per cluster | Web Audio API PannerNode |

### Color and Legibility

- Use emissive/bright colors against dark backgrounds (current approach is correct)
- Minimum text size: 1cm at 1m distance (equivalent to ~0.6 degrees visual angle)
- Sprite labels at 25cm height (current `spriteHeight = 0.25`) are good for close inspection
- Consider increasing to 35-40cm for labels the user reads from 2-3m away

### Scale and Units

Everything in WebXR is in **meters**. The current FirefliesXR constants are well-calibrated:

```
SPHERE_RADIUS = 3m  (galaxy fills a room-sized volume)
DRIFT_AMPLITUDE = 0.005m = 5mm (subtle particle breathing)
spriteHeight = 0.25m = 25cm (readable label size)
raycaster threshold = 0.08m = 8cm (forgiving pick radius)
```

---

## 9. visionOS-Specific Quirks and Limitations

### Known Issues

1. **No squeeze events.** `squeezestart`/`squeeze`/`squeezeend` never fire. There is no secondary action button equivalent.

2. **No gamepad data.** `inputSource.gamepad` is null or empty. No analog triggers, sticks, or buttons.

3. **Transient input sources.** Input sources are created and destroyed with each pinch. Do not cache references to `XRInputSource` objects across frames.

4. **gripSpace may be missing.** The Zappar technical deep-dive notes that `gripSpace` is not implemented in Safari's WebXR. Some frameworks work around this with wrist-position offsets. Three.js `getController()` abstracts this, but if you access `inputSource.gripSpace` directly, check for null.

5. **No continuous gaze.** You cannot know where the user is looking unless they are actively pinching. Design interactions that do not require hover states.

6. **Session exit is uninterruptible.** Pressing the Digital Crown exits the WebXR session immediately. You get a `sessionend` event but cannot prevent or delay exit. Save state on every interaction, not just on exit.

7. **No video textures in some cases.** Video playback inside WebXR has been reported as unreliable. Test thoroughly if using video.

8. **Performance budget.** Safari's WebGL in XR has a lower performance ceiling than native Metal. For a 40K particle system:
   - Use `THREE.Points` (instanced geometry), not individual meshes
   - Keep shader operations simple
   - Target 90fps (the system will warn/degrade below this)
   - `setPixelRatio(1)` in XR (the system handles resolution)

### CSS Considerations (Pre-XR UI)

For the non-XR interface that the user sees before entering WebXR:

```css
/* visionOS Safari uses gaze + pinch, which maps to pointer: coarse, hover: none */
@media (pointer: coarse) and (hover: none) {
  /* Enlarge tap targets to 44pt minimum */
  button, .interactive { min-height: 44px; min-width: 44px; }

  /* Duplicate :hover styles onto :active for pinch feedback */
  .button:active { /* same as :hover styles */ }
}
```

### Feature Detection

```javascript
async function detectVisionPro() {
  const xr = navigator.xr;
  if (!xr) return { isXR: false };

  const vrSupported = await xr.isSessionSupported('immersive-vr').catch(() => false);
  const arSupported = await xr.isSessionSupported('immersive-ar').catch(() => false);

  // Vision Pro: VR yes, AR no, no controllers, has hand tracking
  // Quest: VR yes, AR yes (with passthrough)
  return {
    isXR: vrSupported,
    isVisionPro: vrSupported && !arSupported, // heuristic, not guaranteed
    isQuest: vrSupported && arSupported,       // heuristic
    arSupported,
    vrSupported,
  };
}
```

---

## 10. Fixing FirefliesXR.tsx

The current `FirefliesXR.tsx` implementation is largely correct. Key observations:

### What Works

- Session fallback logic (`immersive-ar` check -> `immersive-vr` fallback) is correct
- `local-floor` reference space is correct
- `hand-tracking` as optional feature is correct
- Controller setup with `getController(0)` and `getController(1)` works because Three.js handles the transient-pointer mapping internally
- Grab locomotion pattern is good for Vision Pro
- Point cloud raycasting with 8cm threshold is appropriate

### What to Consider Changing

1. **Remove the AR expectation from UI.** Since `immersive-ar` will never succeed on visionOS, the status message "AR: false, VR: true" may confuse users. Consider showing "Entering spatial view..." instead.

2. **Add hand model rendering.** When hand tracking is enabled, the user cannot see their hands unless you render them. Add `XRHandModelFactory` to show hand meshes in the scene.

3. **Consider billboard labels.** The current label sprites use `depthTest: false` which makes them always visible. In XR this can be disorienting. Consider using `depthTest: true` and positioning labels between the user and the particle.

4. **Save state continuously.** The Digital Crown exit gives no warning. If you track any user state (selected filters, position), save it to localStorage on every interaction.

5. **Add two-hand zoom.** The particles are at a fixed scale. Adding two-hand pinch-to-zoom would let users dive into dense clusters.

---

## 11. Sources

### Apple Official

- [Introducing Natural Input for WebXR in Apple Vision Pro (WebKit Blog)](https://webkit.org/blog/15162/introducing-natural-input-for-webxr-in-apple-vision-pro/)
- [Build Immersive Web Experiences with WebXR -- WWDC24](https://developer.apple.com/videos/play/wwdc2024/10066/)
- [Designing for visionOS (Human Interface Guidelines)](https://developer.apple.com/design/human-interface-guidelines/designing-for-visionos)
- [Spatial Layout (Human Interface Guidelines)](https://developer.apple.com/design/human-interface-guidelines/spatial-layout)
- [Design for Spatial Input -- WWDC23](https://developer.apple.com/videos/play/wwdc2023/10073/)
- [Principles of Spatial Design -- WWDC23](https://developer.apple.com/videos/play/wwdc2023/10072/)

### Apple Developer Forums

- [WebXR: Support for AR module in VisionOS 2.x](https://developer.apple.com/forums/thread/756850)
- [WebAR with visionOS 2.0?](https://developer.apple.com/forums/thread/756736)
- [Immersive AR mode of WebXR in visionOS Safari](https://developer.apple.com/forums/thread/743655)

### W3C Standards

- [WebXR Hand Input Module -- Level 1](https://www.w3.org/TR/webxr-hand-input-1/)
- [WebXR Device API Input Explainer](https://immersive-web.github.io/webxr/input-explainer.html)

### Third-Party Technical References

- [How to Create WebXR Experiences on Vision Pro (Zappar)](https://www.zappar.com/insights/how-to-create-webxr-experiences-on-vision-pro-a-technical-deep-dive)
- [visionOS 2 Apple Vision Pro WebXR Default Support (UploadVR)](https://www.uploadvr.com/visionos-2-apple-vision-pro-webxr/)
- [Apple Vision Pro WebXR Transient Pointer Input (Road to VR)](https://www.roadtovr.com/apple-vision-pro-webxr-transient-pointer-pinch-input/)
- [Hand and Gesture Detection in WebXR VR and Three.js (VR Me Up)](https://www.vrmeup.com/devlog/devlog_12_webxr_hands_and_gestures.html)
- [Three.js WebXR Dragging Example](https://threejs.org/examples/webxr_xr_dragging.html)
- [How to Enable WebXR on Apple Vision Pro (AppleInsider)](https://appleinsider.com/inside/apple-vision-pro/tips/how-to-enable-webxr-support-on-apple-vision-pro)
- [WebXR on visionOS (VR Software Wiki, Brown University)](https://www.vrwiki.cs.brown.edu/apple-vision-pro/development-approaches-for-visionos/webxr-on-visionos)
- [Best VR Headsets for WebXR and Three.js 2026](https://threejsresources.com/vr/blog/best-vr-headsets-with-webxr-support-for-three-js-developers-2026)
