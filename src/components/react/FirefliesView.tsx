import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
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

interface TooltipInfo {
  x: number;
  y: number;
  tag: string;
  surprise: number;
  textPreview: string;
  timestamp: number;
  wordCount: number;
  variety: string;
}

interface TagInfo {
  tag: string;
  count: number;
  color: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BG = 0x020208;
const FOG_DENSITY = 0.0008;
const MOVE_SPEED_BASE = 2.0;
const MOUSE_SENSITIVITY = 0.002;
const DRIFT_AMPLITUDE = 0.5;
const DRIFT_SPEED = 0.5;
const BLINK_AMPLITUDE = 0.1;
const BLINK_SPEED = 0.7;

// Galaxy layout constants
const SPHERE_RADIUS = 300;        // tag centers distributed on this sphere
const BASE_NEBULA = 80;           // base nebula size (scaled by post count)
const ORBIT_RADIUS_INIT = 600;    // initial camera distance
const ORBIT_SENSITIVITY = 0.003;
const ORBIT_AUTO_ROTATE = 0.0003; // radians per frame for ambient spin
const ORBIT_ZOOM_SPEED = 30;      // scroll wheel zoom increment
const ORBIT_RADIUS_MIN = 100;
const ORBIT_RADIUS_MAX = 1500;
const PHI_GOLDEN = (1 + Math.sqrt(5)) / 2;

// Tag ordering for legend / nebula placement
const TAG_ORDER = [
  'reaction', 'one-liner', 'question', 'shitpost', 'meta-social',
  'philosophy', 'tech', 'political', 'race', 'sex-gender',
  'commentary', 'personal', 'daily-life', 'food', 'work',
  'creative', 'language', 'media', 'finance', 'url-share',
];

// ─── Seeded PRNG ─────────────────────────────────────────────────────────────

/** Simple seeded PRNG (mulberry32) — deterministic positions per post ID */
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

// ─── Shaders ─────────────────────────────────────────────────────────────────

const VERTEX_SHADER = `
  attribute float size;
  attribute float alpha;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_PointSize = clamp(gl_PointSize, 1.0, 64.0);
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function FirefliesView() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postCount, setPostCount] = useState(0);
  const [fps, setFps] = useState(60);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [tagInfos, setTagInfos] = useState<TagInfo[]>([]);
  const [highlightedTag, setHighlightedTag] = useState<string | null>(null);

  // Refs for animation loop access
  const nodesRef = useRef<PostNode[]>([]);
  const highlightRef = useRef<string | null>(null);

  useEffect(() => {
    highlightRef.current = highlightedTag;
  }, [highlightedTag]);

  const handleTagClick = useCallback((tag: string | null) => {
    setHighlightedTag(tag);
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    let disposed = false;
    const container = mountRef.current;

    // ── Scene setup ──────────────────────────────────────────────────────

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.FogExp2(BG, FOG_DENSITY);

    const width = window.innerWidth;
    const height = window.innerHeight;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 3000);
    camera.position.set(0, 0, ORBIT_RADIUS_INIT);

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // ── Camera control state ─────────────────────────────────────────────

    const keys: Record<string, boolean> = {};
    let moveSpeed = MOVE_SPEED_BASE;
    let yaw = 0;
    let pitch = 0;
    let isPointerLocked = false;

    // Orbit camera state (default mode)
    let orbitRadius = ORBIT_RADIUS_INIT;
    let orbitAzimuth = 0;
    let orbitElevation = 0.3;
    let isOrbiting = false;   // mouse is dragged in orbit mode
    let orbitStartX = 0;
    let orbitStartY = 0;

    // Raycaster for hover detection
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 5 };
    const mouse = new THREE.Vector2();

    // FPS tracking
    let frameCount = 0;
    let lastFpsTime = performance.now();

    // Particle system refs (set after data loads)
    let points: THREE.Points | null = null;
    let geometry: THREE.BufferGeometry | null = null;
    let phases: Float32Array | null = null;
    let basePositions: Float32Array | null = null;
    let baseAlphas: Float32Array | null = null;
    let nodeCount = 0;

    // ── Event handlers ───────────────────────────────────────────────────

    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
        e.preventDefault();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!isPointerLocked && e.button === 0) {
        isOrbiting = true;
        orbitStartX = e.clientX;
        orbitStartY = e.clientY;
      }
    };

    const onMouseUp = () => {
      isOrbiting = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isPointerLocked) {
        // Fly mode: free-look
        yaw -= e.movementX * MOUSE_SENSITIVITY;
        pitch -= e.movementY * MOUSE_SENSITIVITY;
        pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
      } else if (isOrbiting) {
        // Orbit mode: drag to rotate around origin
        const dx = e.clientX - orbitStartX;
        const dy = e.clientY - orbitStartY;
        orbitAzimuth += dx * ORBIT_SENSITIVITY;
        orbitElevation += dy * ORBIT_SENSITIVITY;
        // Clamp elevation to avoid gimbal lock
        orbitElevation = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, orbitElevation));
        orbitStartX = e.clientX;
        orbitStartY = e.clientY;
      }

      // Update mouse for raycasting (always)
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerLockChange = () => {
      isPointerLocked = document.pointerLockElement === renderer.domElement;
      if (!isPointerLocked) {
        // Returning to orbit mode — sync orbit angles from camera position
        const pos = camera.position;
        orbitRadius = pos.length();
        orbitElevation = Math.asin(Math.max(-1, Math.min(1, pos.y / orbitRadius)));
        orbitAzimuth = Math.atan2(pos.x, pos.z);
      }
    };

    const onCanvasClick = () => {
      // Single click: don't lock pointer — let raycaster handle post selection
    };

    const onCanvasDblClick = () => {
      if (!isPointerLocked) {
        // Sync fly mode angles from current orbit position
        yaw = orbitAzimuth + Math.PI; // facing center
        pitch = -orbitElevation;
        renderer.domElement.requestPointerLock();
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (isPointerLocked) {
        // In fly mode: adjust speed
        if (e.deltaY > 0) {
          moveSpeed = Math.max(0.3, moveSpeed * 0.9);
        } else {
          moveSpeed = Math.min(20, moveSpeed * 1.1);
        }
      } else {
        // In orbit mode: zoom in/out
        orbitRadius += e.deltaY > 0 ? ORBIT_ZOOM_SPEED : -ORBIT_ZOOM_SPEED;
        orbitRadius = Math.max(ORBIT_RADIUS_MIN, Math.min(ORBIT_RADIUS_MAX, orbitRadius));
      }
    };

    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const onKeyDownEscape = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && isPointerLocked) {
        document.exitPointerLock();
      }
    };

    // Bind events
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    renderer.domElement.addEventListener('click', onCanvasClick);
    renderer.domElement.addEventListener('dblclick', onCanvasDblClick);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDownEscape);

    // ── Data fetching ────────────────────────────────────────────────────

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

        // Find max tag count for nebula scaling
        let maxTagCount = 0;
        for (const [, count] of tagCounts) {
          if (count > maxTagCount) maxTagCount = count;
        }

        // ── Compute tag centers on a Fibonacci sphere ──────────────────

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

        // ── Build particle arrays (spherical galaxy clusters) ────────

        const positions = new Float32Array(nodeCount * 3);
        const colors = new Float32Array(nodeCount * 3);
        const sizes = new Float32Array(nodeCount);
        const alphas = new Float32Array(nodeCount);
        phases = new Float32Array(nodeCount);
        basePositions = new Float32Array(nodeCount * 3);
        baseAlphas = new Float32Array(nodeCount);

        for (let i = 0; i < nodeCount; i++) {
          const node = nodes[i];

          // Seeded random for deterministic layout
          const seed = hashString(node.id);
          const rng = mulberry32(seed);

          // Find tag center
          const tag = node.tag || 'reaction';
          const center = tagCenters[tag] || { x: 0, y: 0, z: 0 };

          // Nebula radius scales with sqrt of tag's post count
          const thisTagCount = tagCounts.get(tag) || 1;
          const nebulaRadius = BASE_NEBULA * Math.sqrt(thisTagCount / maxTagCount);

          // Time fraction drives angular position (spiral within nebula)
          const timeFrac = (node.timestamp - minTs) / tsRange;
          const timeAngle = timeFrac * 4 * Math.PI; // wraps around twice

          // Spherical random position within the nebula (cube root for uniform volume)
          const r = nebulaRadius * Math.cbrt(rng());
          const theta = timeAngle + rng() * 0.8; // time-based angle with small jitter
          const phi = Math.acos(2 * rng() - 1);

          // Surprise pushes posts outward from nebula center
          const surprise = node.surprise || 0;
          const surpriseOffset = ((surprise - 8) / 10) * nebulaRadius * 0.5;

          const px = center.x + (r + surpriseOffset) * Math.sin(phi) * Math.cos(theta);
          const py = center.y + (r + surpriseOffset) * Math.sin(phi) * Math.sin(theta);
          const pz = center.z + (r + surpriseOffset) * Math.cos(phi);

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

          // Size: base + word count contribution + high-surprise bonus
          let sz = 3 + Math.sqrt(node.wordCount || 1) * 0.5;
          if (surprise > 11) sz += 2; // high-surprise bonus
          sizes[i] = sz;

          // Alpha/brightness from surprise
          const alphaVal = 0.6 + Math.max(0, (surprise - 5) / 13) * 0.4;
          alphas[i] = Math.min(1, alphaVal);
          baseAlphas[i] = alphas[i];

          // Random phase for animation (seeded)
          phases[i] = rng() * Math.PI * 2;
        }

        // ── Create geometry ────────────────────────────────────────────

        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

        // ── Custom shader material ─────────────────────────────────────

        const material = new THREE.ShaderMaterial({
          vertexShader: VERTEX_SHADER,
          fragmentShader: FRAGMENT_SHADER,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          vertexColors: true,
        });

        points = new THREE.Points(geometry, material);
        scene.add(points);

        setLoading(false);
      } catch (err: any) {
        if (!disposed) {
          console.error('Fireflies fetch error:', err);
          setError(err.message);
          setLoading(false);
        }
      }
    }

    loadData();

    // ── Animation loop ───────────────────────────────────────────────────

    let lastTime = performance.now();

    function animate() {
      if (disposed) return;
      requestAnimationFrame(animate);

      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      const time = now * 0.001;

      // ── FPS counter ──────────────────────────────────────────────────

      frameCount++;
      if (now - lastFpsTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastFpsTime = now;
      }

      // ── Camera: orbit mode vs fly mode ─────────────────────────────

      if (isPointerLocked) {
        // Fly mode: WASD + free-look
        const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
        camera.quaternion.setFromEuler(euler);

        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0);

        const speed = moveSpeed * delta * 60;

        if (keys['KeyW']) camera.position.addScaledVector(forward, speed);
        if (keys['KeyS']) camera.position.addScaledVector(forward, -speed);
        if (keys['KeyA']) camera.position.addScaledVector(right, -speed);
        if (keys['KeyD']) camera.position.addScaledVector(right, speed);
        if (keys['Space']) camera.position.addScaledVector(up, speed);
        if (keys['ShiftLeft'] || keys['ShiftRight']) camera.position.addScaledVector(up, -speed);

        // Clamp camera to universe bounds
        const BOUND = 800;
        camera.position.x = Math.max(-BOUND, Math.min(BOUND, camera.position.x));
        camera.position.y = Math.max(-BOUND, Math.min(BOUND, camera.position.y));
        camera.position.z = Math.max(-BOUND, Math.min(BOUND, camera.position.z));
      } else {
        // Orbit mode: camera revolves around origin
        // Auto-rotate when not dragging
        if (!isOrbiting) {
          orbitAzimuth += ORBIT_AUTO_ROTATE;
        }

        camera.position.x = orbitRadius * Math.cos(orbitElevation) * Math.sin(orbitAzimuth);
        camera.position.y = orbitRadius * Math.sin(orbitElevation);
        camera.position.z = orbitRadius * Math.cos(orbitElevation) * Math.cos(orbitAzimuth);
        camera.lookAt(0, 0, 0);
      }

      // ── Animate particles ────────────────────────────────────────────

      if (geometry && phases && basePositions && baseAlphas) {
        const posArray = geometry.attributes.position.array as Float32Array;
        const alphaArray = geometry.attributes.alpha.array as Float32Array;

        for (let i = 0; i < nodeCount; i++) {
          // Gentle drift on all three axes (spherical layout needs 3D drift)
          const phase = phases[i];
          posArray[i * 3]     = basePositions[i * 3]     +
            Math.sin(time * DRIFT_SPEED + phase) * DRIFT_AMPLITUDE;
          posArray[i * 3 + 1] = basePositions[i * 3 + 1] +
            Math.sin(time * DRIFT_SPEED * 0.7 + phase * 1.3) * DRIFT_AMPLITUDE;
          posArray[i * 3 + 2] = basePositions[i * 3 + 2] +
            Math.cos(time * DRIFT_SPEED * 0.9 + phase * 0.8) * DRIFT_AMPLITUDE;

          // Brightness pulse (firefly blinking)
          alphaArray[i] = baseAlphas[i] +
            Math.sin(time * BLINK_SPEED + phase * 3) * BLINK_AMPLITUDE;
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.alpha.needsUpdate = true;
      }

      // ── Raycaster hover detection (throttled — every 3rd frame) ──────

      if (points && frameCount % 3 === 0 && !isPointerLocked) {
        raycaster.setFromCamera(mouse, camera);
        const intersections = raycaster.intersectObject(points);

        if (intersections.length > 0) {
          const idx = intersections[0].index;
          if (idx !== undefined && idx < nodesRef.current.length) {
            const node = nodesRef.current[idx];
            const screenPos = intersections[0].point.clone().project(camera);
            const halfW = window.innerWidth / 2;
            const halfH = window.innerHeight / 2;

            setTooltip({
              x: screenPos.x * halfW + halfW,
              y: -screenPos.y * halfH + halfH,
              tag: node.tag,
              surprise: node.surprise,
              textPreview: node.textPreview,
              timestamp: node.timestamp,
              wordCount: node.wordCount,
              variety: node.variety,
            });
          }
        } else {
          setTooltip(null);
        }
      }

      renderer.render(scene, camera);
    }

    animate();

    // ── Cleanup ──────────────────────────────────────────────────────────

    return () => {
      disposed = true;

      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      renderer.domElement.removeEventListener('click', onCanvasClick);
      renderer.domElement.removeEventListener('dblclick', onCanvasDblClick);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDownEscape);

      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
      }

      if (geometry) geometry.dispose();
      if (points && points.material) {
        const mat = points.material;
        if (Array.isArray(mat)) {
          mat.forEach(m => m.dispose());
        } else {
          mat.dispose();
        }
      }
      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      ref={mountRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {/* Top-left: stats */}
      {!loading && (
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
            {fps} FPS
          </div>
        </div>
      )}

      {/* Top-right: title */}
      {!loading && (
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
            THREADS FIREFLIES
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

      {/* Bottom-left: controls hint */}
      {!loading && (
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
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>DBL-CLICK</span> fly mode
            <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>WASD</span> fly
            <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>SPACE</span> up
            <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>SHIFT</span> down
            <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>ESC</span> orbit mode
          </div>
        </div>
      )}

      {/* Tag legend */}
      {!loading && tagInfos.length > 0 && (
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
          {/* Clear filter */}
          {highlightedTag && (
            <button
              onClick={() => handleTagClick(null)}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                padding: '2px 8px',
                fontSize: 8,
                fontFamily: 'monospace',
                letterSpacing: '0.05em',
                marginBottom: 2,
              }}
            >
              CLEAR
            </button>
          )}

          {tagInfos.map(({ tag, count, color }) => {
            const isActive = highlightedTag === null || highlightedTag === tag;
            return (
              <button
                key={tag}
                onClick={() =>
                  handleTagClick(highlightedTag === tag ? null : tag)
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  background:
                    highlightedTag === tag
                      ? `${color}22`
                      : 'rgba(2,2,8,0.6)',
                  border:
                    highlightedTag === tag
                      ? `1px solid ${color}55`
                      : '1px solid transparent',
                  borderRadius: 8,
                  color: isActive ? color : 'rgba(255,255,255,0.15)',
                  cursor: 'pointer',
                  padding: '2px 7px 2px 5px',
                  fontSize: 8,
                  fontFamily: 'monospace',
                  letterSpacing: '0.03em',
                  transition: 'all 0.15s',
                  opacity: isActive ? 1 : 0.4,
                  whiteSpace: 'nowrap' as const,
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: color,
                    opacity: isActive ? 1 : 0.3,
                    flexShrink: 0,
                    boxShadow: isActive ? `0 0 4px ${color}` : 'none',
                  }}
                />
                <span>{tag}</span>
                <span
                  style={{
                    color: isActive
                      ? 'rgba(255,255,255,0.25)'
                      : 'rgba(255,255,255,0.08)',
                    fontSize: 7,
                  }}
                >
                  {count.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(tooltip.x + 14, window.innerWidth - 320),
            top: Math.min(tooltip.y - 10, window.innerHeight - 120),
            background: 'rgba(2, 2, 8, 0.92)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            padding: '8px 12px',
            zIndex: 50,
            pointerEvents: 'none',
            maxWidth: 300,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 4,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: TAG_COLORS[tooltip.tag] || '#6e7681',
                boxShadow: `0 0 6px ${TAG_COLORS[tooltip.tag] || '#6e7681'}`,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontFamily: 'monospace',
                color: TAG_COLORS[tooltip.tag] || '#6e7681',
                fontWeight: 600,
              }}
            >
              {tooltip.tag}
            </span>
            <span
              style={{
                fontSize: 9,
                fontFamily: 'monospace',
                color: 'rgba(255,255,255,0.3)',
              }}
            >
              {tooltip.variety}
            </span>
          </div>

          {tooltip.textPreview && (
            <div
              style={{
                fontSize: 10,
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                color: 'rgba(255,255,255,0.65)',
                lineHeight: '1.4',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical' as const,
              }}
            >
              {tooltip.textPreview}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 12,
              marginTop: 4,
              fontSize: 8,
              fontFamily: 'monospace',
              color: 'rgba(255,255,255,0.3)',
            }}
          >
            <span>
              {new Date(tooltip.timestamp).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            <span>{tooltip.wordCount}w</span>
            {tooltip.surprise > 0 && (
              <span>{tooltip.surprise.toFixed(1)} bits</span>
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
              loading 40K particles into GPU
            </div>
          )}
        </div>
      )}
    </div>
  );
}
