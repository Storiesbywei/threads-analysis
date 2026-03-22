import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { XRButton } from 'three/examples/jsm/webxr/XRButton.js';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';
import { TAG_COLORS } from '../../lib/colors';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PostNode {
  id: string;
  timestamp: number;
  variety: string;
  tag: string;
  subTags: string[];
  surprise: number;
  wordCount: number;
  replyToId: string | null;
  quotedPostId: string | null;
  textPreview: string;
}

interface TagInfo {
  tag: string;
  count: number;
  color: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BG = 0x020208;

// XR room-scale: everything in meters
const SPHERE_RADIUS = 3;             // tag centers on a 3m radius sphere
const BASE_NEBULA = 0.8;             // base nebula size (meters)
const DRIFT_AMPLITUDE = 0.005;       // gentle drift in meters
const DRIFT_SPEED = 0.5;
const BLINK_AMPLITUDE = 0.1;
const BLINK_SPEED = 0.7;
const GALAXY_AUTO_ROTATE = 0.00015;  // very slow spin (rad/frame)

// XR interaction constants
const TAP_THRESHOLD_MS = 300;        // < 300ms pinch = tap, > 300ms = hold
const GRAB_MOVE_SCALE = 3;           // 3x hand movement = 3x camera movement
const GRAB_DAMPING = 0.85;           // smooth damping for grab locomotion
const ZOOM_SCALE_MIN = 0.2;          // minimum galaxy scale (zoomed out)
const ZOOM_SCALE_MAX = 5.0;          // maximum galaxy scale (zoomed in)
const HIGHLIGHT_RADIUS = 0.5;        // meters — radius for proximity highlight
const FLASH_DURATION_MS = 300;       // flash brightness on selection

// Non-XR orbit constants
const ORBIT_RADIUS_INIT = 6;
const ORBIT_ZOOM_SPEED = 0.3;
const ORBIT_RADIUS_MIN = 1;
const ORBIT_RADIUS_MAX = 15;

const PHI_GOLDEN = (1 + Math.sqrt(5)) / 2;

// Tag ordering (same as FirefliesView)
const TAG_ORDER = [
  'reaction', 'one-liner', 'question', 'shitpost', 'meta-social',
  'philosophy', 'tech', 'political', 'race', 'sex-gender',
  'commentary', 'personal', 'daily-life', 'food', 'work',
  'creative', 'language', 'media', 'finance', 'url-share',
];

// ─── Seeded PRNG ─────────────────────────────────────────────────────────────

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Shaders (adjusted for XR / meters) ─────────────────────────────────────

const VERTEX_SHADER = `
  attribute float size;
  attribute float alpha;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // In XR, distances are in meters — scale point size accordingly
    gl_PointSize = size * (3.0 / -mvPosition.z);
    gl_PointSize = clamp(gl_PointSize, 1.0, 48.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    // Soft circle with glow falloff
    float core = 1.0 - smoothstep(0.0, 0.2, d);
    float glow = 1.0 - smoothstep(0.0, 0.5, d);
    float brightness = core * 0.8 + glow * 0.5;
    gl_FragColor = vec4(vColor * (brightness + 0.2), brightness * vAlpha * 1.3);
  }
`;

// ─── Canvas text rendering for XR labels ────────────────────────────────────

function createTextSprite(
  text: string,
  options: {
    fontSize?: number;
    color?: string;
    bgColor?: string;
    maxWidth?: number;
    padding?: number;
  } = {},
): THREE.Sprite {
  const {
    fontSize = 28,
    color = '#e6edf3',
    bgColor = 'rgba(2, 2, 8, 0.88)',
    maxWidth = 512,
    padding = 16,
  } = options;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Measure text to size canvas
  ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, monospace`;
  const lines = wrapText(ctx, text, maxWidth - padding * 2);
  const lineHeight = fontSize * 1.3;
  const textHeight = lines.length * lineHeight;

  canvas.width = maxWidth;
  canvas.height = textHeight + padding * 2;

  // Background
  ctx.fillStyle = bgColor;
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 12);
  ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  roundRect(ctx, 0.5, 0.5, canvas.width - 1, canvas.height - 1, 12);
  ctx.stroke();

  // Text
  ctx.fillStyle = color;
  ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, monospace`;
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], padding, padding + i * lineHeight);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const aspect = canvas.width / canvas.height;
  const spriteHeight = 0.25; // 25cm tall in world
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(spriteHeight * aspect, spriteHeight, 1);

  return sprite;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const test = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(test);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) lines.push(currentLine);

  // Limit to 4 lines
  if (lines.length > 4) {
    lines.length = 4;
    lines[3] = lines[3].slice(0, -3) + '...';
  }

  return lines;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FirefliesXR() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postCount, setPostCount] = useState(0);
  const [xrSupported, setXrSupported] = useState<boolean | null>(null);
  const [xrActive, setXrActive] = useState(false);
  const [tagInfos, setTagInfos] = useState<TagInfo[]>([]);
  const [selectedPost, setSelectedPost] = useState<PostNode | null>(null);
  const [xrStatus, setXrStatus] = useState<string>('');

  // Refs for animation loop
  const nodesRef = useRef<PostNode[]>([]);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    let disposed = false;
    const container = mountRef.current;

    // ── Scene setup ──────────────────────────────────────────────────────

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);

    const width = window.innerWidth;
    const height = window.innerHeight;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.01, 100);
    camera.position.set(0, 1.6, ORBIT_RADIUS_INIT); // eye level in non-XR

    // Camera rig for XR movement (teleportation)
    const cameraRig = new THREE.Group();
    cameraRig.add(camera);
    scene.add(cameraRig);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ── WebXR setup ──────────────────────────────────────────────────────

    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');

    // Check XR support
    const xrSystem = navigator.xr;
    if (xrSystem) {
      // XRButton auto-detects AR vs VR — try immersive-ar first, falls back to VR
      Promise.all([
        xrSystem.isSessionSupported('immersive-ar'),
        xrSystem.isSessionSupported('immersive-vr'),
      ]).then(([arSupported, vrSupported]) => {
        if (disposed) return;
        const supported = arSupported || vrSupported;
        setXrSupported(supported);
        // We use our own ENTER XR button — no hidden XRButton needed
      });
    } else {
      setXrSupported(false);
    }

    // XR session events
    renderer.xr.addEventListener('sessionstart', () => {
      setXrActive(true);
      // Transparent background for AR passthrough
      scene.background = null;
      renderer.setClearColor(0x000000, 0); // fully transparent clear
      renderer.setClearAlpha(0);

      // Check environment blending mode
      const session = renderer.xr.getSession();
      if (session) {
        console.log('XR environment blending:', session.environmentBlendMode);
        // 'opaque' = VR, 'alpha-blend' = AR passthrough, 'additive' = see-through
      }

      // Move camera rig so user is at center of galaxy
      cameraRig.position.set(0, 0, 0);
    });

    renderer.xr.addEventListener('sessionend', () => {
      setXrActive(false);
      scene.background = new THREE.Color(BG);
      cameraRig.position.set(0, 0, 0);
      camera.position.set(0, 1.6, ORBIT_RADIUS_INIT);
    });

    // ── XR Controllers (gaze + pinch on Vision Pro) ─────────────────────

    const controller0 = renderer.xr.getController(0);
    const controller1 = renderer.xr.getController(1);
    scene.add(controller0);
    scene.add(controller1);

    // ── Hand Model Rendering ──────────────────────────────────────────
    // On Vision Pro, users cannot see their hands unless we render them.
    // Vision Pro composites real hands at system level — no need for Three.js hand models
    // (Three.js mesh hands appear black and at wrong scale on visionOS)

    // ── XR Raycaster ──────────────────────────────────────────────────

    const xrRaycaster = new THREE.Raycaster();
    xrRaycaster.params.Points = { threshold: 0.08 }; // 8cm threshold in meters

    // Reusable vectors (allocate once, never in hot path)
    const tempMatrix = new THREE.Matrix4();
    const rayDirection = new THREE.Vector3(0, 0, -1);
    const _grabCurrentPos = new THREE.Vector3();
    const _grabDelta = new THREE.Vector3();
    const _dampedRigTarget = new THREE.Vector3();
    const _tempVec = new THREE.Vector3(); // reusable for gaze proximity checks

    // ── Active Label State ────────────────────────────────────────────

    let activeLabel: THREE.Sprite | null = null;
    let activeLabelTargetIdx = -1;

    function removeActiveLabel() {
      if (activeLabel) {
        scene.remove(activeLabel);
        if (activeLabel.material instanceof THREE.SpriteMaterial && activeLabel.material.map) {
          activeLabel.material.map.dispose();
        }
        (activeLabel.material as THREE.SpriteMaterial).dispose();
        activeLabel = null;
        activeLabelTargetIdx = -1;
      }
    }

    // ── Pinch Interaction State (per-controller) ──────────────────────

    interface PinchState {
      active: boolean;
      startTime: number;
      startPos: THREE.Vector3;
      controller: THREE.Object3D;
      hitIdx: number;             // particle index hit on selectstart, or -1
      isGrabbing: boolean;        // true if no particle was hit (locomotion mode)
    }

    const pinchStates: Map<THREE.Object3D, PinchState> = new Map();

    // Grab locomotion state
    let grabController: THREE.Object3D | null = null;
    let grabStartPos = new THREE.Vector3();
    let rigStartPos = new THREE.Vector3();
    let rigVelocity = new THREE.Vector3();

    // Two-hand zoom state
    let twoHandZoomActive = false;
    let initialPinchDist = 0;
    let initialGalaxyScale = 1;

    // Visual feedback: flash state
    let flashIdx = -1;
    let flashStartTime = 0;

    // ── Motion grid for grab feedback ─────────────────────────────────

    const gridSize = 4;     // 4m x 4m grid
    const gridDivs = 20;
    const motionGrid = new THREE.GridHelper(gridSize, gridDivs, 0x1a1a3a, 0x0a0a1a);
    motionGrid.visible = false;
    motionGrid.position.y = -0.5; // slightly below floor level
    (motionGrid.material as THREE.Material).transparent = true;
    (motionGrid.material as THREE.Material).opacity = 0.3;
    cameraRig.add(motionGrid); // moves with the rig

    // ── Selection helpers ─────────────────────────────────────────────

    function raycastFromController(controller: THREE.Object3D): number {
      if (!points) return -1;

      tempMatrix.identity().extractRotation(controller.matrixWorld);
      xrRaycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      xrRaycaster.ray.direction.copy(rayDirection).applyMatrix4(tempMatrix);

      const intersections = xrRaycaster.intersectObject(points);
      if (intersections.length > 0) {
        const idx = intersections[0].index;
        if (idx !== undefined && idx < nodesRef.current.length) {
          return idx;
        }
      }
      return -1;
    }

    function showPostLabel(idx: number) {
      const node = nodesRef.current[idx];
      if (!node) return;

      setSelectedPost(node);
      removeActiveLabel();

      const tagColor = TAG_COLORS[node.tag] || '#8b949e';
      const labelText = `[${node.tag}] ${node.textPreview || '(no text)'}`;
      activeLabel = createTextSprite(labelText, {
        fontSize: 24,
        color: tagColor,
        maxWidth: 480,
      });

      // Position label slightly above the particle
      if (geometry) {
        const posArray = geometry.attributes.position.array as Float32Array;
        const localPos = new THREE.Vector3(
          posArray[idx * 3],
          posArray[idx * 3 + 1] + 0.15,
          posArray[idx * 3 + 2],
        );
        galaxyGroup.localToWorld(localPos);
        activeLabel.position.copy(localPos);
      }
      activeLabelTargetIdx = idx;
      scene.add(activeLabel);
    }

    function showExpandedTooltip(idx: number) {
      const node = nodesRef.current[idx];
      if (!node) return;

      setSelectedPost(node);
      removeActiveLabel();

      const tagColor = TAG_COLORS[node.tag] || '#8b949e';
      // Expanded detail: tag, full text preview, date, word count, surprise
      const dateStr = new Date(node.timestamp).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      const labelText = `[${node.tag}] ${node.textPreview || '(no text)'}\n${dateStr} | ${node.wordCount}w | ${node.surprise.toFixed(1)} bits`;
      activeLabel = createTextSprite(labelText, {
        fontSize: 22,
        color: tagColor,
        maxWidth: 512,
      });

      if (geometry) {
        const posArray = geometry.attributes.position.array as Float32Array;
        const localPos = new THREE.Vector3(
          posArray[idx * 3],
          posArray[idx * 3 + 1] + 0.2,
          posArray[idx * 3 + 2],
        );
        galaxyGroup.localToWorld(localPos);
        activeLabel.position.copy(localPos);
      }
      activeLabelTargetIdx = idx;
      scene.add(activeLabel);
    }

    function triggerFlash(idx: number) {
      flashIdx = idx;
      flashStartTime = performance.now();
    }

    // ── selectstart: begin pinch ──────────────────────────────────────

    function onSelectStart(event: { target: THREE.Object3D }) {
      if (!renderer.xr.isPresenting || !points) return;

      const controller = event.target;
      const hitIdx = raycastFromController(controller);

      const state: PinchState = {
        active: true,
        startTime: performance.now(),
        startPos: new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld),
        controller,
        hitIdx,
        isGrabbing: false,
      };

      if (hitIdx >= 0) {
        // Hit a particle — post selection mode
        pinchStates.set(controller, state);
      } else {
        // No particle hit — galaxy rotation mode (rotate the universe like a snow globe)
        state.isGrabbing = true;
        pinchStates.set(controller, state);

        if (!grabController) {
          grabController = controller;
          grabStartPos.setFromMatrixPosition(controller.matrixWorld);
        }
      }

      // Check for two-hand zoom
      checkTwoHandZoomStart();
    }

    // ── select (quick pinch+release = tap) ────────────────────────────

    function onSelect(event: { target: THREE.Object3D }) {
      if (!renderer.xr.isPresenting) return;

      const controller = event.target;
      const state = pinchStates.get(controller);
      if (!state) return;

      const elapsed = performance.now() - state.startTime;

      if (state.hitIdx >= 0 && elapsed < TAP_THRESHOLD_MS) {
        // Quick tap on a particle — select it
        showPostLabel(state.hitIdx);
        triggerFlash(state.hitIdx);
      }
    }

    // ── selectend: release pinch ──────────────────────────────────────

    function onSelectEnd(event: { target: THREE.Object3D }) {
      if (!renderer.xr.isPresenting) return;

      const controller = event.target;
      const state = pinchStates.get(controller);

      if (state) {
        // End grab locomotion if this was the grab controller
        if (state.isGrabbing && grabController === controller) {
          grabController = null;
          motionGrid.visible = false;
        }

        pinchStates.delete(controller);
      }

      // Reset two-hand zoom when either hand releases
      twoHandZoomActive = false;
      initialPinchDist = 0;
    }

    // ── Two-hand zoom helpers ─────────────────────────────────────────

    function checkTwoHandZoomStart() {
      // Need both controllers actively pinching
      const states = Array.from(pinchStates.values());
      if (states.length === 2) {
        twoHandZoomActive = true;
        initialPinchDist = 0; // will be set on first frame with valid positions
        initialGalaxyScale = galaxyGroup.scale.x;
      }
    }

    function updateTwoHandZoom() {
      if (!twoHandZoomActive) return;

      const states = Array.from(pinchStates.values());
      if (states.length !== 2) {
        twoHandZoomActive = false;
        return;
      }

      const pos0 = new THREE.Vector3().setFromMatrixPosition(states[0].controller.matrixWorld);
      const pos1 = new THREE.Vector3().setFromMatrixPosition(states[1].controller.matrixWorld);
      const currentDist = pos0.distanceTo(pos1);

      if (initialPinchDist === 0) {
        // First frame — capture initial distance
        initialPinchDist = currentDist;
        initialGalaxyScale = galaxyGroup.scale.x;
      } else {
        const scaleFactor = currentDist / initialPinchDist;
        const newScale = THREE.MathUtils.clamp(
          initialGalaxyScale * scaleFactor,
          ZOOM_SCALE_MIN,
          ZOOM_SCALE_MAX,
        );
        galaxyGroup.scale.setScalar(newScale);
      }
    }

    // ── Register controller events ────────────────────────────────────

    // Listen on ALL controllers — Vision Pro with hand tracking fires on indices 0-3
    controller0.addEventListener('selectstart', onSelectStart);
    controller0.addEventListener('select', onSelect);
    controller0.addEventListener('selectend', onSelectEnd);
    controller1.addEventListener('selectstart', onSelectStart);
    controller1.addEventListener('select', onSelect);
    controller1.addEventListener('selectend', onSelectEnd);

    // Also listen on controllers 2-3 (transient-pointer on Vision Pro)
    const controller2 = renderer.xr.getController(2);
    const controller3 = renderer.xr.getController(3);
    scene.add(controller2);
    scene.add(controller3);
    controller2.addEventListener('selectstart', onSelectStart);
    controller2.addEventListener('select', onSelect);
    controller2.addEventListener('selectend', onSelectEnd);
    controller3.addEventListener('selectstart', onSelectStart);
    controller3.addEventListener('select', onSelect);
    controller3.addEventListener('selectend', onSelectEnd);
    controller1.addEventListener('selectstart', onSelectStart);
    controller1.addEventListener('select', onSelect);
    controller1.addEventListener('selectend', onSelectEnd);

    // ── Keyboard controls (WASD always active) ────────────────────────────

    const keys: Record<string, boolean> = {};
    const MOVE_SPEED = 0.05;

    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ── Non-XR orbit controls ─────────────────────────────────────────────

    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.minDistance = ORBIT_RADIUS_MIN;
    orbitControls.maxDistance = ORBIT_RADIUS_MAX;
    orbitControls.autoRotate = true;
    orbitControls.autoRotateSpeed = 0.3;
    orbitControls.target.set(0, 0, 0);

    // Non-XR raycaster for hover/click
    const mouseRaycaster = new THREE.Raycaster();
    mouseRaycaster.params.Points = { threshold: 0.05 };
    const mouse = new THREE.Vector2();

    const onMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onClick = (e: MouseEvent) => {
      if (renderer.xr.isPresenting) return;
      if (!points) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const clickMouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      mouseRaycaster.setFromCamera(clickMouse, camera);
      const intersections = mouseRaycaster.intersectObject(points);

      if (intersections.length > 0) {
        const idx = intersections[0].index;
        if (idx !== undefined && idx < nodesRef.current.length) {
          setSelectedPost(nodesRef.current[idx]);
        }
      } else {
        setSelectedPost(null);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('click', onClick);

    // ── Resize ────────────────────────────────────────────────────────────

    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // ── Data loading + particle creation ─────────────────────────────────

    let points: THREE.Points | null = null;
    let geometry: THREE.BufferGeometry | null = null;
    let phases: Float32Array | null = null;
    let basePositions: Float32Array | null = null;
    let baseAlphas: Float32Array | null = null;
    let nodeCount = 0;

    // Galaxy group for auto-rotation in XR
    const galaxyGroup = new THREE.Group();
    scene.add(galaxyGroup);

    // Tag label sprites in scene (static cluster labels)
    const tagLabels: THREE.Sprite[] = [];

    async function loadData() {
      try {
        const res = await fetch('/api/garden-tree');
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        if (disposed) return;

        const nodes: PostNode[] = data.nodes || [];
        nodesRef.current = nodes;
        nodeCount = nodes.length;

        if (nodeCount === 0) {
          setError('No posts found');
          setLoading(false);
          return;
        }

        const minTs = data.dateRange.min;
        const maxTs = data.dateRange.max;
        const tsRange = maxTs - minTs || 1;

        // Build tag info for legend
        const tagCounts = new Map<string, number>();
        for (const n of nodes) {
          const t = n.tag || 'reaction';
          tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
        }
        const infos: TagInfo[] = [...tagCounts.entries()]
          .map(([tag, count]) => ({
            tag,
            count,
            color: TAG_COLORS[tag] || '#6e7681',
          }))
          .sort((a, b) => b.count - a.count);
        setTagInfos(infos);
        setPostCount(nodeCount);

        // Max tag count for nebula scaling
        let maxTagCount = 0;
        for (const [, count] of tagCounts) {
          if (count > maxTagCount) maxTagCount = count;
        }

        // ── Compute tag centers on Fibonacci sphere ──────────────────────

        const tagCount = TAG_ORDER.length;
        const tagCenters: Record<string, { x: number; y: number; z: number }> = {};

        for (let i = 0; i < tagCount; i++) {
          const theta = (2 * Math.PI * i) / PHI_GOLDEN;
          const phi = Math.acos(1 - 2 * (i + 0.5) / tagCount);
          const x = SPHERE_RADIUS * Math.sin(phi) * Math.cos(theta);
          const y = SPHERE_RADIUS * Math.sin(phi) * Math.sin(theta);
          const z = SPHERE_RADIUS * Math.cos(phi);
          tagCenters[TAG_ORDER[i]] = { x, y, z };
        }

        // ── Build particle arrays (room-scale galaxy) ────────────────────

        const positions = new Float32Array(nodeCount * 3);
        const colors = new Float32Array(nodeCount * 3);
        const sizes = new Float32Array(nodeCount);
        const alphas = new Float32Array(nodeCount);
        phases = new Float32Array(nodeCount);
        basePositions = new Float32Array(nodeCount * 3);
        baseAlphas = new Float32Array(nodeCount);

        for (let i = 0; i < nodeCount; i++) {
          const node = nodes[i];
          const seed = hashString(node.id);
          const rng = mulberry32(seed);

          const tag = node.tag || 'reaction';
          const tagCenter = tagCenters[tag] || { x: 0, y: 0, z: 0 };

          const thisTagCount = tagCounts.get(tag) || 1;
          const nebulaRadius = BASE_NEBULA * Math.sqrt(thisTagCount / maxTagCount);

          const timeFrac = (node.timestamp - minTs) / tsRange;

          // ── BIG BANG LAYOUT ──
          // At t=0: all posts start at origin (singularity), mixed together
          // As t increases: posts expand outward AND separate into tag clusters
          // At t=1: fully separated into distinct tag nebulae at the outer rim

          // Radial distance from center = time (expanding universe)
          const expansionRadius = SPHERE_RADIUS * timeFrac;

          // Interpolate between origin (0,0,0) and tag cluster center
          // Early posts are near origin with random angles (mixed)
          // Late posts are near their tag center (separated)
          const separation = Math.pow(timeFrac, 0.7); // ease-in: stays mixed longer, then separates

          // Target position: tag cluster center scaled by expansion
          const targetX = tagCenter.x * separation;
          const targetY = tagCenter.y * separation;
          const targetZ = tagCenter.z * separation;

          // Add nebula jitter (spherical, within the cluster)
          const jitterR = nebulaRadius * Math.cbrt(rng()) * (0.3 + timeFrac * 0.7);
          const jitterTheta = rng() * Math.PI * 2;
          const jitterPhi = Math.acos(2 * rng() - 1);

          // Surprise pushes outward from cluster center
          const surprise = node.surprise || 0;
          const surpriseOffset = ((surprise - 8) / 10) * nebulaRadius * 0.3;

          const px = targetX + (jitterR + surpriseOffset) * Math.sin(jitterPhi) * Math.cos(jitterTheta);
          const py = targetY + (jitterR + surpriseOffset) * Math.sin(jitterPhi) * Math.sin(jitterTheta);
          const pz = targetZ + (jitterR + surpriseOffset) * Math.cos(jitterPhi);

          positions[i * 3]     = px;
          positions[i * 3 + 1] = py;
          positions[i * 3 + 2] = pz;
          basePositions[i * 3]     = px;
          basePositions[i * 3 + 1] = py;
          basePositions[i * 3 + 2] = pz;

          // Color from tag
          const hexColor = TAG_COLORS[node.tag] || '#8b949e';
          const color = new THREE.Color(hexColor);
          colors[i * 3]     = color.r;
          colors[i * 3 + 1] = color.g;
          colors[i * 3 + 2] = color.b;

          // Size: scaled for meters (much smaller than pixel-space)
          let sz = 0.03 + Math.sqrt(node.wordCount || 1) * 0.005;
          if (surprise > 11) sz += 0.02;
          sizes[i] = sz;

          // Alpha/brightness
          const alphaVal = 0.6 + Math.max(0, (surprise - 5) / 13) * 0.4;
          alphas[i] = Math.min(1, alphaVal);
          baseAlphas[i] = alphas[i];

          // Random phase for animation
          phases[i] = rng() * Math.PI * 2;
        }

        // ── Create geometry ──────────────────────────────────────────────

        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

        // ── Custom shader material ───────────────────────────────────────

        const material = new THREE.ShaderMaterial({
          vertexShader: VERTEX_SHADER,
          fragmentShader: FRAGMENT_SHADER,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          vertexColors: true,
        });

        points = new THREE.Points(geometry, material);
        galaxyGroup.add(points);

        // ── Tag cluster labels (subtle glowing text, no boxes) ──────────

        for (const tag of TAG_ORDER) {
          const center = tagCenters[tag];
          if (!center) continue;
          const count = tagCounts.get(tag) || 0;
          if (count === 0) continue;

          // Create minimal glowing label — no background box
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d')!;
          const tagColor = TAG_COLORS[tag] || '#8b949e';
          const fontSize = 16;
          canvas.width = 256;
          canvas.height = 32;

          // Just text, no background — transparent canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = tagColor;
          ctx.globalAlpha = 0.6;
          ctx.font = `500 ${fontSize}px -apple-system, monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(tag, canvas.width / 2, canvas.height / 2);

          const texture = new THREE.CanvasTexture(canvas);
          texture.needsUpdate = true;
          const mat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          const label = new THREE.Sprite(mat);
          const nebulaRadius = BASE_NEBULA * Math.sqrt(count / maxTagCount);
          // Labels at the outer rim where clusters fully separate
          label.position.set(center.x * 1.1, center.y * 1.1 + nebulaRadius + 0.12, center.z * 1.1);
          label.scale.set(0.5, 0.06, 1);
          galaxyGroup.add(label);
          tagLabels.push(label);

          // Add a subtle point light glow at each cluster center
          // (represents total engagement/likes as brightness)
          const glowGeo = new THREE.SphereGeometry(0.02, 8, 8);
          const glowMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(tagColor),
            transparent: true,
            opacity: 0.3,
          });
          const glowSphere = new THREE.Mesh(glowGeo, glowMat);
          glowSphere.position.set(center.x, center.y, center.z);
          galaxyGroup.add(glowSphere);
        }

        // ── Post-to-post gravitational connections ──────────────────────
        // Multi-tag posts connect to other posts that share their tags.
        // Lines go between ACTUAL post positions, not cluster centers.
        // Brightness = word count (heavier posts = brighter connection).

        const arcPositions: number[] = [];
        const arcColors: number[] = [];
        const CURVE_SEGMENTS = 8;
        const MAX_CONNECTIONS = 500; // cap for performance

        // Build a tag → post indices map
        const tagPostIndices = new Map<string, number[]>();
        for (let i = 0; i < nodeCount; i++) {
          const node = nodes[i];
          if (!node.subTags) continue;
          const parents = new Set(node.subTags.map((st: string) => st.split(':')[0]));
          for (const tag of parents) {
            if (!tagPostIndices.has(tag)) tagPostIndices.set(tag, []);
            tagPostIndices.get(tag)!.push(i);
          }
        }

        // For multi-tag posts, connect to a random post in the OTHER tag
        let connectionCount = 0;
        for (let i = 0; i < nodeCount && connectionCount < MAX_CONNECTIONS; i++) {
          const node = nodes[i];
          if (!node.subTags || node.subTags.length <= 1) continue;
          const parents = [...new Set(node.subTags.map((st: string) => st.split(':')[0]))];
          if (parents.length <= 1) continue;

          // This post's position
          const ax = positions[i * 3];
          const ay = positions[i * 3 + 1];
          const az = positions[i * 3 + 2];

          // Connect to a post in each other tag
          for (let t = 1; t < parents.length && connectionCount < MAX_CONNECTIONS; t++) {
            const otherTag = parents[t];
            const otherIndices = tagPostIndices.get(otherTag);
            if (!otherIndices || otherIndices.length === 0) continue;

            // Pick a nearby post (by index proximity = temporal proximity)
            const targetIdx = otherIndices[Math.min(Math.floor(i / nodeCount * otherIndices.length), otherIndices.length - 1)];
            const bx = positions[targetIdx * 3];
            const by = positions[targetIdx * 3 + 1];
            const bz = positions[targetIdx * 3 + 2];

            // Curved connection with gravitational bend toward origin
            const midX = (ax + bx) / 2;
            const midY = (ay + by) / 2;
            const midZ = (az + bz) / 2;
            const dist = Math.sqrt((bx-ax)**2 + (by-ay)**2 + (bz-az)**2);

            // Bend toward origin (gravitational pull from center)
            const bendStrength = 0.15;
            const cpx = midX * (1 - bendStrength);
            const cpy = midY * (1 - bendStrength);
            const cpz = midZ * (1 - bendStrength);

            const color1 = new THREE.Color(TAG_COLORS[parents[0]] || '#444');
            const color2 = new THREE.Color(TAG_COLORS[otherTag] || '#444');

            for (let s = 0; s < CURVE_SEGMENTS; s++) {
              const t0 = s / CURVE_SEGMENTS;
              const t1 = (s + 1) / CURVE_SEGMENTS;
              const x0 = (1-t0)*(1-t0)*ax + 2*(1-t0)*t0*cpx + t0*t0*bx;
              const y0 = (1-t0)*(1-t0)*ay + 2*(1-t0)*t0*cpy + t0*t0*by;
              const z0 = (1-t0)*(1-t0)*az + 2*(1-t0)*t0*cpz + t0*t0*bz;
              const x1 = (1-t1)*(1-t1)*ax + 2*(1-t1)*t1*cpx + t1*t1*bx;
              const y1 = (1-t1)*(1-t1)*ay + 2*(1-t1)*t1*cpy + t1*t1*by;
              const z1 = (1-t1)*(1-t1)*az + 2*(1-t1)*t1*cpz + t1*t1*bz;

              arcPositions.push(x0, y0, z0, x1, y1, z1);
              const r0 = color1.r + (color2.r - color1.r) * t0;
              const g0 = color1.g + (color2.g - color1.g) * t0;
              const b0 = color1.b + (color2.b - color1.b) * t0;
              arcColors.push(r0, g0, b0, r0, g0, b0);
            }
            connectionCount++;
          }
        }

        if (arcPositions.length > 0) {
          const arcGeo = new THREE.BufferGeometry();
          arcGeo.setAttribute('position', new THREE.Float32BufferAttribute(arcPositions, 3));
          arcGeo.setAttribute('color', new THREE.Float32BufferAttribute(arcColors, 3));
          const arcMat = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.03,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          const arcLines = new THREE.LineSegments(arcGeo, arcMat);
          galaxyGroup.add(arcLines);
        }

        setLoading(false);
      } catch (err: unknown) {
        if (!disposed) {
          const message = err instanceof Error ? err.message : String(err);
          console.error('FirefliesXR fetch error:', err);
          setError(message);
          setLoading(false);
        }
      }
    }

    loadData();

    // ── Animation loop (setAnimationLoop for XR compatibility) ──────────

    let frameCount = 0;

    renderer.setAnimationLoop((_time, frame) => {
      if (disposed) return;

      const now = performance.now();
      const time = now * 0.001;
      frameCount++;

      const inXR = renderer.xr.isPresenting;

      // ── XR: Hold detection (> 300ms = show expanded tooltip) ────────

      if (inXR) {
        const nowMs = performance.now();
        for (const [, state] of pinchStates) {
          if (state.active && state.hitIdx >= 0 && !state.isGrabbing) {
            const elapsed = nowMs - state.startTime;
            if (elapsed > TAP_THRESHOLD_MS) {
              // Long hold on a particle — show expanded tooltip
              showExpandedTooltip(state.hitIdx);
              triggerFlash(state.hitIdx);
              // Mark as handled so we don't re-trigger
              state.hitIdx = -1;
            }
          }
        }
      }

      // ── XR: Galaxy rotation (pinch + move hand = spin the universe) ──

      if (inXR && grabController) {
        _grabCurrentPos.setFromMatrixPosition(grabController.matrixWorld);
        _grabDelta.subVectors(_grabCurrentPos, grabStartPos);

        // Map hand movement to galaxy rotation (like turning a snow globe)
        const ROTATION_SENSITIVITY = 2.0;
        galaxyGroup.rotation.y += _grabDelta.x * ROTATION_SENSITIVITY;
        galaxyGroup.rotation.x += _grabDelta.y * ROTATION_SENSITIVITY;

        // Clamp X rotation to avoid flipping upside down
        galaxyGroup.rotation.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, galaxyGroup.rotation.x));

        // Update start position for continuous rotation
        grabStartPos.copy(_grabCurrentPos);
      }

      // ── XR: Two-hand pinch-to-zoom ──────────────────────────────────

      if (inXR && twoHandZoomActive) {
        updateTwoHandZoom();
      }

      // ── Galaxy auto-rotation (pause during manual rotation) ──────────

      if (!grabController) {
        galaxyGroup.rotation.y += GALAXY_AUTO_ROTATE;
      }

      // ── WASD movement (always active in non-XR) ────────────────────────

      if (!inXR) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        if (keys['KeyW'] || keys['ArrowUp']) camera.position.addScaledVector(forward, MOVE_SPEED);
        if (keys['KeyS'] || keys['ArrowDown']) camera.position.addScaledVector(forward, -MOVE_SPEED);
        if (keys['KeyA'] || keys['ArrowLeft']) camera.position.addScaledVector(right, -MOVE_SPEED);
        if (keys['KeyD'] || keys['ArrowRight']) camera.position.addScaledVector(right, MOVE_SPEED);
        if (keys['Space']) camera.position.y += MOVE_SPEED;
        if (keys['ShiftLeft'] || keys['ShiftRight']) camera.position.y -= MOVE_SPEED;

        // Update orbit target to follow camera (so orbit + WASD work together)
        if (keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'] || keys['Space'] || keys['ShiftLeft'] || keys['ShiftRight'] || keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight']) {
          orbitControls.target.copy(camera.position).add(forward.multiplyScalar(2));
        }

        orbitControls.update();
      }

      // ── Animate particles ─────────────────────────────────────────────

      if (geometry && phases && basePositions && baseAlphas) {
        const posArray = geometry.attributes.position.array as Float32Array;
        const alphaArray = geometry.attributes.alpha.array as Float32Array;
        const sizeArray = geometry.attributes.size.array as Float32Array;

        // Flash decay factor (0.0 = no flash, 1.0 = full flash)
        const flashElapsed = now - flashStartTime;
        const flashFactor = flashIdx >= 0 && flashElapsed < FLASH_DURATION_MS
          ? 1.0 - (flashElapsed / FLASH_DURATION_MS)
          : 0;
        if (flashElapsed >= FLASH_DURATION_MS) flashIdx = -1;

        // Gaze proximity glow: always follows head direction (approximates eye tracking)
        // In XR, camera direction = where user is looking (head tracking)
        // Particles near the gaze ray glow brighter — visual cursor
        let gazeOrigin: THREE.Vector3 | null = null;
        let gazeDir: THREE.Vector3 | null = null;
        if (inXR) {
          // Camera world position and direction = head tracking
          gazeOrigin = new THREE.Vector3();
          camera.getWorldPosition(gazeOrigin);
          gazeDir = new THREE.Vector3(0, 0, -1);
          camera.getWorldDirection(gazeDir);
        }

        for (let i = 0; i < nodeCount; i++) {
          const phase = phases[i];
          posArray[i * 3]     = basePositions[i * 3]     +
            Math.sin(time * DRIFT_SPEED + phase) * DRIFT_AMPLITUDE;
          posArray[i * 3 + 1] = basePositions[i * 3 + 1] +
            Math.sin(time * DRIFT_SPEED * 0.7 + phase * 1.3) * DRIFT_AMPLITUDE;
          posArray[i * 3 + 2] = basePositions[i * 3 + 2] +
            Math.cos(time * DRIFT_SPEED * 0.9 + phase * 0.8) * DRIFT_AMPLITUDE;

          // Brightness pulse (firefly blinking)
          let alpha = baseAlphas[i] +
            Math.sin(time * BLINK_SPEED + phase * 3) * BLINK_AMPLITUDE;

          // Flash selected particle brighter momentarily
          if (i === flashIdx && flashFactor > 0) {
            alpha = Math.min(1.0, alpha + flashFactor * 0.6);
            // Temporarily increase size for visual pop
            sizeArray[i] = sizeArray[i] + flashFactor * 0.04;
          }

          // Proximity highlight: boost brightness of particles near the gaze ray
          // (acts as visual gaze cursor — particles glow when you look at them)
          if (gazeOrigin && gazeDir && i % 2 === 0) {
            // Check every other particle for performance (40K/frame is heavy)
            _tempVec.set(posArray[i * 3], posArray[i * 3 + 1], posArray[i * 3 + 2]);
            galaxyGroup.localToWorld(_tempVec);

            _tempVec.sub(gazeOrigin);
            const tProj = _tempVec.dot(gazeDir);

            if (tProj > 0 && tProj < 5) { // only check particles within 5m
              // perpendicular distance to ray
              const perpSq = _tempVec.lengthSq() - tProj * tProj;
              const hrSq = HIGHLIGHT_RADIUS * HIGHLIGHT_RADIUS;

              if (perpSq < hrSq) {
                const closeness = 1.0 - Math.sqrt(perpSq) / HIGHLIGHT_RADIUS;
                alpha = Math.min(1.0, alpha + closeness * 0.4);
                // Also bump size slightly for glow cursor effect
                sizeArray[i] = sizeArray[i] + closeness * 0.02;
              }
            }
          }

          alphaArray[i] = alpha;
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.alpha.needsUpdate = true;
        geometry.attributes.size.needsUpdate = true;
      }

      // ── Make tag labels face camera (billboard) ────────────────────────

      // THREE.Sprite auto-faces camera, no manual billboard needed

      // ── Active label follows its particle ──────────────────────────────

      if (activeLabel && activeLabelTargetIdx >= 0 && geometry) {
        const posArray = geometry.attributes.position.array as Float32Array;
        const idx = activeLabelTargetIdx;
        // Transform from galaxy group local space to world
        const localPos = new THREE.Vector3(
          posArray[idx * 3],
          posArray[idx * 3 + 1] + 0.15,
          posArray[idx * 3 + 2],
        );
        galaxyGroup.localToWorld(localPos);
        activeLabel.position.copy(localPos);
      }

      // ── Non-XR hover raycasting (throttled) ────────────────────────────

      if (!inXR && points && frameCount % 3 === 0) {
        mouseRaycaster.setFromCamera(mouse, camera);
        const intersections = mouseRaycaster.intersectObject(points);
        if (intersections.length > 0) {
          renderer.domElement.style.cursor = 'pointer';
        } else {
          renderer.domElement.style.cursor = 'default';
        }
      }

      renderer.render(scene, camera);
    });

    // ── Cleanup ──────────────────────────────────────────────────────────

    return () => {
      disposed = true;

      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      renderer.domElement.removeEventListener('click', onClick);
      window.removeEventListener('resize', onResize);

      controller0.removeEventListener('selectstart', onSelectStart);
      controller0.removeEventListener('select', onSelect);
      controller0.removeEventListener('selectend', onSelectEnd);
      controller1.removeEventListener('selectstart', onSelectStart);
      controller1.removeEventListener('select', onSelect);
      controller1.removeEventListener('selectend', onSelectEnd);

      // Controllers 2-3 cleanup
      controller2.removeEventListener('selectstart', onSelectStart);
      controller2.removeEventListener('select', onSelect);
      controller2.removeEventListener('selectend', onSelectEnd);
      controller3.removeEventListener('selectstart', onSelectStart);
      controller3.removeEventListener('select', onSelect);
      controller3.removeEventListener('selectend', onSelectEnd);

      removeActiveLabel();
      for (const label of tagLabels) {
        if (label.material instanceof THREE.SpriteMaterial && label.material.map) {
          label.material.map.dispose();
        }
        (label.material as THREE.SpriteMaterial).dispose();
      }

      if (geometry) geometry.dispose();
      if (points && points.material) {
        const mat = points.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else {
          mat.dispose();
        }
      }

      orbitControls.dispose();
      renderer.setAnimationLoop(null);
      renderer.dispose();

      // cleanup complete

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // ── Enter XR handler ────────────────────────────────────────────────────

  const handleEnterXR = useCallback(async () => {
    const xrSystem = navigator.xr;
    const renderer = rendererRef.current;

    if (!renderer) {
      setXrStatus('Renderer not ready — wait for particles to load');
      return;
    }

    if (!xrSystem) {
      setXrStatus('navigator.xr is undefined — WebXR not available in this browser');
      return;
    }

    setXrStatus('Checking XR support...');

    try {
      // Check what's supported
      const arSupported = await xrSystem.isSessionSupported('immersive-ar').catch(() => false);
      const vrSupported = await xrSystem.isSessionSupported('immersive-vr').catch(() => false);
      setXrStatus('Entering spatial view...');

      // Prefer AR (passthrough) over VR
      const mode: XRSessionMode = arSupported ? 'immersive-ar' : vrSupported ? 'immersive-vr' : 'immersive-vr';

      setXrStatus(`Requesting ${mode === 'immersive-ar' ? 'AR' : 'spatial'} session...`);

      const session = await xrSystem.requestSession(mode, {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['bounded-floor', 'hand-tracking', 'layers'],
      });

      setXrStatus(`Session: ${mode}, blend: ${session.environmentBlendMode}`);
      await renderer.xr.setSession(session);
      setXrStatus('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setXrStatus(`XR failed: ${msg}`);
    }
  }, []);

  const handleDismissPost = useCallback(() => {
    setSelectedPost(null);
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      ref={mountRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {/* Top-left: stats */}
      {!loading && !xrActive && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            zIndex: 20,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontFamily: 'monospace',
              letterSpacing: '0.15em',
              color: 'rgba(255,255,255,0.35)',
              fontWeight: 600,
            }}
          >
            {postCount.toLocaleString()} FIREFLIES
            <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 6px' }}>
              {' '}/{' '}
            </span>
            XR
          </div>
        </div>
      )}

      {/* Top-right: title */}
      {!loading && !xrActive && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 20,
            pointerEvents: 'none',
            textAlign: 'right',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontFamily: 'monospace',
              letterSpacing: '0.2em',
              color: 'rgba(255,255,255,0.25)',
              fontWeight: 600,
            }}
          >
            THREADS FIREFLIES XR
          </div>
          <div
            style={{
              fontSize: 9,
              fontFamily: 'monospace',
              color: 'rgba(255,255,255,0.15)',
              marginTop: 2,
              letterSpacing: '0.1em',
            }}
          >
            @maybe_foucault
          </div>
        </div>
      )}

      {/* ENTER XR button overlay */}
      {!loading && !xrActive && (
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {/* Always show ENTER XR button — Vision Pro may need user gesture to trigger permission */}
          <button
            onClick={handleEnterXR}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 12,
              color: 'rgba(255, 255, 255, 0.7)',
              cursor: 'pointer',
              padding: '12px 32px',
              fontSize: 14,
              fontFamily: 'monospace',
              letterSpacing: '0.25em',
              fontWeight: 600,
              backdropFilter: 'blur(12px)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            }}
          >
            ENTER XR
          </button>
          {xrSupported === false && (
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>
              WebXR may need to be enabled in Safari settings
            </div>
          )}
          {xrStatus && (
            <div style={{
              fontSize: 11, fontFamily: 'monospace', color: '#58a6ff', marginTop: 8,
              background: 'rgba(0,0,0,0.7)', padding: '6px 12px', borderRadius: 6,
              maxWidth: 400, textAlign: 'center', lineHeight: 1.4,
            }}>
              {xrStatus}
            </div>
          )}

          {xrSupported === null && !loading && (
            <div
              style={{
                fontSize: 10,
                fontFamily: 'monospace',
                color: 'rgba(255, 255, 255, 0.2)',
                letterSpacing: '0.1em',
              }}
            >
              checking XR support...
            </div>
          )}
        </div>
      )}

      {/* Bottom-left: controls hint */}
      {!loading && !xrActive && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            zIndex: 20,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontFamily: 'monospace',
              color: 'rgba(255,255,255,0.2)',
              letterSpacing: '0.08em',
              lineHeight: '1.6',
            }}
          >
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>DRAG</span> orbit
            <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>SCROLL</span> zoom
            <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>CLICK</span> select post
          </div>
        </div>
      )}

      {/* Tag legend (non-XR only) */}
      {!loading && !xrActive && tagInfos.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 48,
            left: 16,
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            maxHeight: 'calc(100vh - 120px)',
            overflowY: 'auto',
          }}
        >
          {tagInfos.map(({ tag, count, color }) => (
            <div
              key={tag}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '2px 7px 2px 5px',
                fontSize: 8,
                fontFamily: 'monospace',
                letterSpacing: '0.03em',
                color,
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: color,
                  flexShrink: 0,
                  boxShadow: `0 0 4px ${color}`,
                }}
              />
              <span>{tag}</span>
              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 7 }}>
                {count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Selected post panel (non-XR) */}
      {selectedPost && !xrActive && (
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            right: 16,
            zIndex: 30,
            background: 'rgba(2, 2, 8, 0.92)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: '12px 16px',
            maxWidth: 360,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: TAG_COLORS[selectedPost.tag] || '#6e7681',
                boxShadow: `0 0 6px ${TAG_COLORS[selectedPost.tag] || '#6e7681'}`,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontFamily: 'monospace',
                color: TAG_COLORS[selectedPost.tag] || '#6e7681',
                fontWeight: 600,
              }}
            >
              {selectedPost.tag}
            </span>
            <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)' }}>
              {selectedPost.variety}
            </span>
            <button
              onClick={handleDismissPost}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.3)',
                cursor: 'pointer',
                fontSize: 14,
                padding: '0 4px',
                fontFamily: 'monospace',
              }}
            >
              x
            </button>
          </div>

          {selectedPost.textPreview && (
            <div
              style={{
                fontSize: 11,
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                color: 'rgba(255,255,255,0.65)',
                lineHeight: '1.5',
                marginBottom: 6,
              }}
            >
              {selectedPost.textPreview}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 12,
              fontSize: 9,
              fontFamily: 'monospace',
              color: 'rgba(255,255,255,0.3)',
            }}
          >
            <span>
              {new Date(selectedPost.timestamp).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            <span>{selectedPost.wordCount}w</span>
            {selectedPost.surprise > 0 && (
              <span>{selectedPost.surprise.toFixed(1)} bits</span>
            )}
          </div>
        </div>
      )}

      {/* Loading screen */}
      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            background: '#020208',
          }}
        >
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 13,
              color: 'rgba(255,255,255,0.35)',
              letterSpacing: '0.2em',
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            {error ? `ERROR: ${error}` : 'SUMMONING FIREFLIES...'}
          </div>
          {!error && (
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                color: 'rgba(255,255,255,0.15)',
                letterSpacing: '0.1em',
              }}
            >
              loading 40K particles for spatial computing
            </div>
          )}
        </div>
      )}
    </div>
  );
}
