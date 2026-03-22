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
const FOG_DENSITY = 0.0015;
const MOVE_SPEED_BASE = 2.0;
const MOUSE_SENSITIVITY = 0.002;
const DRIFT_AMPLITUDE = 0.5;
const DRIFT_SPEED = 0.5;
const BLINK_AMPLITUDE = 0.1;
const BLINK_SPEED = 0.7;

// Tag ordering for Z-axis placement
const TAG_ORDER = [
  'reaction', 'one-liner', 'question', 'shitpost', 'meta-social',
  'philosophy', 'tech', 'political', 'race', 'sex-gender',
  'commentary', 'personal', 'daily-life', 'food', 'work',
  'creative', 'language', 'media', 'finance', 'url-share',
];

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
    float core = 1.0 - smoothstep(0.0, 0.15, d);
    float glow = 1.0 - smoothstep(0.0, 0.5, d);
    float brightness = core * 0.6 + glow * 0.4;
    gl_FragColor = vec4(vColor * brightness, brightness * vAlpha);
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

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 2000);
    camera.position.set(0, 0, 200);

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
    let basePositionsY: Float32Array | null = null;
    let baseAlphas: Float32Array | null = null;
    let nodeCount = 0;

    // ── Event handlers ───────────────────────────────────────────────────

    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
      // Prevent default for game keys
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
        e.preventDefault();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isPointerLocked) {
        yaw -= e.movementX * MOUSE_SENSITIVITY;
        pitch -= e.movementY * MOUSE_SENSITIVITY;
        pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
      }

      // Update mouse for raycasting (even when not locked)
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerLockChange = () => {
      isPointerLocked = document.pointerLockElement === renderer.domElement;
    };

    const onCanvasClick = () => {
      if (!isPointerLocked) {
        renderer.domElement.requestPointerLock();
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 0) {
        moveSpeed = Math.max(0.3, moveSpeed * 0.9);
      } else {
        moveSpeed = Math.min(20, moveSpeed * 1.1);
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
    document.addEventListener('pointerlockchange', onPointerLockChange);
    renderer.domElement.addEventListener('click', onCanvasClick);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDownEscape);

    // ── Data fetching ────────────────────────────────────────────────────

    async function loadData() {
      try {
        // Fetch ALL posts (no limit)
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

        // ── Build particle arrays ──────────────────────────────────────

        const positions = new Float32Array(nodeCount * 3);
        const colors = new Float32Array(nodeCount * 3);
        const sizes = new Float32Array(nodeCount);
        const alphas = new Float32Array(nodeCount);
        phases = new Float32Array(nodeCount);
        basePositionsY = new Float32Array(nodeCount);
        baseAlphas = new Float32Array(nodeCount);

        for (let i = 0; i < nodeCount; i++) {
          const node = nodes[i];

          // X = time (-500 to +500)
          const timeFrac = (node.timestamp - minTs) / tsRange;
          positions[i * 3] = (timeFrac - 0.5) * 1000;

          // Y = surprise (-100 to +100) with jitter
          const surprise = node.surprise || 0;
          const yBase = ((surprise - 5) / 13 - 0.5) * 200 + (Math.random() - 0.5) * 20;
          positions[i * 3 + 1] = yBase;
          basePositionsY[i] = yBase;

          // Z = tag cluster with jitter
          const tagIndex = TAG_ORDER.indexOf(node.tag);
          const tagZ = tagIndex >= 0 ? tagIndex : Math.floor(Math.random() * 20);
          positions[i * 3 + 2] = (tagZ / 20 - 0.5) * 400 + (Math.random() - 0.5) * 30;

          // Color from tag
          const hexColor = TAG_COLORS[node.tag] || '#8b949e';
          const color = new THREE.Color(hexColor);
          colors[i * 3] = color.r;
          colors[i * 3 + 1] = color.g;
          colors[i * 3 + 2] = color.b;

          // Size from word count
          sizes[i] = 2 + Math.sqrt(node.wordCount || 1) * 0.8;

          // Alpha/brightness from surprise
          const alphaVal = 0.3 + Math.max(0, (surprise - 5) / 13) * 0.7;
          alphas[i] = Math.min(1, alphaVal);
          baseAlphas[i] = alphas[i];

          // Random phase for animation
          phases[i] = Math.random() * Math.PI * 2;
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
      const delta = (now - lastTime) / 1000; // seconds
      lastTime = now;
      const time = now * 0.001; // seconds since epoch

      // ── FPS counter ──────────────────────────────────────────────────

      frameCount++;
      if (now - lastFpsTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastFpsTime = now;
      }

      // ── Camera movement (WASD + Space/Shift) ─────────────────────────

      // Build direction from yaw/pitch
      const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
      camera.quaternion.setFromEuler(euler);

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0);

      const speed = moveSpeed * delta * 60; // normalize to ~60fps

      if (keys['KeyW']) camera.position.addScaledVector(forward, speed);
      if (keys['KeyS']) camera.position.addScaledVector(forward, -speed);
      if (keys['KeyA']) camera.position.addScaledVector(right, -speed);
      if (keys['KeyD']) camera.position.addScaledVector(right, speed);
      if (keys['Space']) camera.position.addScaledVector(up, speed);
      if (keys['ShiftLeft'] || keys['ShiftRight']) camera.position.addScaledVector(up, -speed);

      // ── Animate particles ────────────────────────────────────────────

      if (geometry && phases && basePositionsY && baseAlphas) {
        const posArray = geometry.attributes.position.array as Float32Array;
        const alphaArray = geometry.attributes.alpha.array as Float32Array;

        for (let i = 0; i < nodeCount; i++) {
          // Gentle Y drift (sine wave)
          posArray[i * 3 + 1] = basePositionsY[i] +
            Math.sin(time * DRIFT_SPEED + phases[i]) * DRIFT_AMPLITUDE;

          // Brightness pulse (firefly blinking)
          alphaArray[i] = baseAlphas[i] +
            Math.sin(time * BLINK_SPEED + phases[i] * 3) * BLINK_AMPLITUDE;
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
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      renderer.domElement.removeEventListener('click', onCanvasClick);
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
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>CLICK</span> to
            lock mouse
            <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>WASD</span> fly
            <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>SPACE</span> up
            <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>SHIFT</span> down
            <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>SCROLL</span>{' '}
            speed
            <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>ESC</span> unlock
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
