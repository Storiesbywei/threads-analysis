# visionOS Native App Design: Threads Spatial Data Visualization

**Project:** fire-my-lawyer (threads-analysis)
**Target:** Apple Vision Pro, visionOS 2.x+ (native Swift app, not WebXR)
**Dataset:** ~46K Threads posts, 20 tags, 35 sub-tags, knowledge graph (1,638 nodes / 11,155 edges)
**API:** http://100.71.141.45:4322 (16 endpoints over Tailscale)
**Researched:** April 2026

---

## Table of Contents

1. [Why Go Native](#1-why-go-native)
2. [Visualization Concepts](#2-visualization-concepts-7-proposals)
3. [App Architecture](#3-app-architecture)
4. [Data Pipeline: API to RealityKit](#4-data-pipeline-api-to-realitykit)
5. [USDZ and Procedural Asset Generation](#5-usdz-and-procedural-asset-generation)
6. [Performance Strategy for 46K Items](#6-performance-strategy-for-46k-items)
7. [Interaction Design](#7-interaction-design)
8. [Spatial Audio and Sonification](#8-spatial-audio-and-sonification)
9. [Generative Artifacts](#9-generative-artifacts)
10. [Framework Reference](#10-framework-reference)
11. [Implementation Roadmap](#11-implementation-roadmap)
12. [Sources](#12-sources)

---

## 1. Why Go Native

The existing `FirefliesXR.tsx` (WebXR via Three.js in Safari) works but hits hard walls:

| Capability | WebXR (current) | Native visionOS |
|---|---|---|
| Passthrough (mixed reality) | No (`immersive-ar` unsupported) | Yes (`MixedImmersionStyle`, Digital Crown blending) |
| Eye tracking / gaze | Only during pinch (privacy-gated) | Continuous via `SpatialEventRecognizer` for hover |
| Hand tracking fidelity | 25 joints, no squeeze events | Full ARKit hand skeleton + custom gestures |
| Performance ceiling | WebGL in Safari, ~40K points max | Metal-native, LowLevelMesh, compute shaders |
| Spatial Personas | No | Yes (SharePlay / Group Activities) |
| Spatial Audio | Web Audio PannerNode only | PHASE engine, room-aware ray tracing |
| UI integration | DOM overlay only | SwiftUI windows + volumes + immersive spaces |
| App Store distribution | URL only | Distributed via TestFlight / App Store |

**Verdict:** A native app unlocks passthrough, eye-hover, Spatial Audio, and 5-10x rendering headroom. The WebXR version remains useful as a zero-install demo.

---

## 2. Visualization Concepts (7 Proposals)

All concepts exploit capabilities that are impossible or impractical on flat screens. They share a common data layer and can coexist as switchable "scenes" within the same app.

### 2.1 Thought Archaeology (Recommended Lead Concept)

**Spatial-native feature:** Volumetric layers you physically look down into, passthrough ground plane

Posts arranged as geological strata — newest on top, oldest buried deep. The user stands at the edge of a virtual excavation pit that opens in their real floor (passthrough cut-out via `MixedImmersionStyle`).

- **Y-axis:** Time (July 2024 at bottom, present at surface)
- **X/Z plane:** Tag clusters (philosophy on one side, tech on another, etc.)
- **Strata colors:** Each week/month is a distinct sediment band, color-coded by dominant tag that period
- **Surprise as fossils:** High-surprise posts glow as embedded "artifacts" — brighter = more unexpected
- **Interaction:** Pinch and pull upward to "excavate" — peels away recent layers to expose older strata. Two-hand spread to widen the excavation area.
- **Detail:** Look at a glowing artifact + tap to extract it — the post floats up as a translucent card with full text, metrics, and connected graph nodes

**Why this works in visionOS but not flat screen:**
- The pit is anchored to the real floor — you look DOWN, creating a natural depth metaphor impossible on a monitor
- Passthrough framing grounds the abstraction in physical space
- Hand gestures map naturally to excavation (pull, brush, extract)

```
Architecture:
- ImmersiveSpace(.mixed) for passthrough floor cut-out
- RealityKit terrain mesh (LowLevelMesh) for strata
- ParticleEmitterComponent for dust/glow on artifact exposure
- ShaderGraph material with time-based opacity for layer peeling
```

### 2.2 Knowledge Constellation

**Spatial-native feature:** Walk-through 3D graph, physical scale

The knowledge graph (1,638 nodes, 11,155 edges) rendered at room scale. Tag nodes are luminous orbs (30-50cm diameter), concept nodes are smaller stars, edges are faintly glowing filaments.

- **Layout:** Force-directed in 3D (spring + electrostatic, computed on load)
- **Scale:** The graph fills a 4m sphere around the user — they stand INSIDE the graph
- **Clusters:** Tags with strong NPMI co-occurrence pull together, forming visible neighborhoods
- **Edge luminosity:** Proportional to NPMI weight — strong connections are bright threads, weak ones barely visible
- **Navigation:** Look at a cluster + pinch to teleport closer. Two-hand pinch to scale the entire graph.
- **Detail:** Tap a node to expand it — shows the sub-tag breakdown as orbiting satellites, top posts as floating cards

**Why this works in visionOS:**
- Parallax from head movement reveals the 3D structure that a flat force-directed graph cannot convey
- Walking around a cluster gives genuine new perspective
- Eye gaze highlights nearby nodes without requiring a click

### 2.3 Mood Weather System

**Spatial-native feature:** Environmental immersion, peripheral atmosphere

The room itself becomes a weather system driven by posting patterns:

- **Calm / philosophical periods:** Clear sky, soft ambient light, gentle particle drift (like dust motes)
- **High-activity / political periods:** Storm clouds form overhead, lightning flashes on burst-posts
- **Surprise spikes:** Aurora-like ribbons ripple across the ceiling
- **Engagement surges:** Rain of tiny luminous particles (each drop = a like/view)
- **Timeline:** The user controls a time scrubber (SwiftUI window) — scrubbing forward/back changes the weather in real time

The environment responds to a 7-day rolling window of corpus statistics. This is ambient data art, not an analytical tool.

```
Architecture:
- ImmersiveSpace(.full) with custom skybox
- ParticleEmitterComponent for rain/dust/aurora
- ShaderGraph animated sky material
- SpatialAudioSession for thunder, rain, wind mapped to data
```

### 2.4 Living Library

**Spatial-native feature:** Physical interaction metaphor, volumetric window content

A circular library surrounds the user — shelves curve around the room at arm's reach. Each shelf holds a topic tag. Posts appear as slim volumes (like paperbacks), spine-out, color-coded by sub-tag.

- **Shelf arrangement:** 20 shelves (one per tag), arranged radially. Shelf height encodes post count (taller shelves = more posts).
- **Book thickness:** Word count. Thick books are long posts, thin ones are one-liners.
- **Spine glow:** Surprise score. High-surprise posts have luminous spines.
- **Interaction:** Reach toward a shelf (hand tracking proximity) to zoom in. Pinch a book to pull it out — it opens as a floating window showing the full post text, metrics, reply thread.
- **Search:** Voice command "find philosophy posts about Deleuze" filters to matching books, which slide forward and glow.

### 2.5 Neural Garden

**Spatial-native feature:** Organic 3D growth, volumetric density

Topics grow as branching tree-like structures from a shared root (the corpus). Already prototyped in 2D as `ThreadsGarden.tsx` / `threads-lsystem.ts` — this is the 3D native evolution.

- **Trunk:** Main tag — thickness proportional to post count
- **Branches:** Sub-tags — branch angle encodes surprise deviation from parent
- **Leaves:** Individual posts — leaf size = engagement, color = sub-tag
- **Growth animation:** Scrubbing the timeline grows the tree from seed (first post) to current state
- **Interaction:** Pinch a branch to isolate that sub-tag — other branches fade. Pinch a leaf to read the post.

The L-system rules from `threads-lsystem.ts` port directly — just replace 2D turtle graphics with 3D bezier tube meshes.

### 2.6 Time Spiral

**Spatial-native feature:** Helix you can look through from above or walk alongside

A double-helix structure (DNA-like) where each rung is a day, and posts are beads on the strand.

- **Helix axis:** Vertical (time flows upward, oldest at bottom)
- **Bead position on circumference:** Tag (each tag occupies a fixed arc)
- **Bead size:** Engagement
- **Bead brightness:** Surprise
- **Cross-links:** Reply chains and quote-posts create luminous bridges between helix positions
- **Interaction:** Pinch the helix to "unwind" it into a flat timeline for analytical comparison

### 2.7 Discourse Theater

**Spatial-native feature:** Spatial arrangement creates argumentative topology

Posts arranged in an amphitheater. The user sits in the center. Posts that argue or respond to each other face each other across the stage.

- **Stage arrangement:** Conversation threads form arcs. The original post is center-stage, replies fan outward.
- **Height:** Time (earlier at bottom, later at top)
- **Volume (loudness):** Spatial audio — popular posts literally sound louder
- **Interaction:** Look at a post to hear it read aloud (text-to-speech, spatially positioned). Tap to see the full thread.

---

## 3. App Architecture

### Scene Graph / Module Structure

```
ThreadsSpatial/
  App.swift                          # @main, WindowGroup + ImmersiveSpace
  Models/
    ThreadsPost.swift                # Codable model matching API response
    KnowledgeGraphModel.swift        # Nodes + edges
    CorpusStats.swift                # Tag distribution, entropy, etc.
  Services/
    ThreadsAPIClient.swift           # URLSession async/await client
    DataCache.swift                  # On-disk JSON cache (FileManager)
    SpatialLayoutEngine.swift        # 3D positioning algorithms
  Views/
    ContentView.swift                # SwiftUI window — controls, filters, scene picker
    ArchaeologyView.swift            # ImmersiveSpace scene: Thought Archaeology
    ConstellationView.swift          # ImmersiveSpace scene: Knowledge Constellation
    WeatherView.swift                # ImmersiveSpace scene: Mood Weather
    LibraryView.swift                # ImmersiveSpace scene: Living Library
    PostDetailView.swift             # SwiftUI attachment for post inspection
  Components/                        # RealityKit ECS Components
    PostDataComponent.swift          # Stores post ID, tag, surprise, metrics
    GlowComponent.swift              # Surprise-driven emissive intensity
    LODComponent.swift               # Level-of-detail state
    InteractableComponent.swift      # Marks entity as tappable
  Systems/                           # RealityKit ECS Systems
    LODSystem.swift                  # Distance-based detail switching
    GlowAnimationSystem.swift        # Pulsing glow based on surprise
    DriftSystem.swift                # Gentle positional drift (breathing)
    ProximityRevealSystem.swift      # Show labels when user approaches
  Shaders/                           # Reality Composer Pro package
    StrataTerrainMaterial.usda       # ShaderGraph for layered excavation
    GlowOrbMaterial.usda             # Emissive data-point material
    EdgeFilamentMaterial.usda        # Translucent graph edge material
  Resources/
    RealityKitContent/               # Reality Composer Pro bundle
```

### SwiftUI Scene Declaration

```swift
@main
struct ThreadsSpatialApp: App {
    @State private var activeScene: VisualizationScene = .archaeology

    var body: some Scene {
        // 2D control window
        WindowGroup {
            ContentView(activeScene: $activeScene)
        }
        .defaultSize(width: 600, height: 400)

        // Volumetric preview
        WindowGroup(id: "preview") {
            PostPreviewVolume()
        }
        .windowStyle(.volumetric)
        .defaultSize(width: 0.3, height: 0.4, depth: 0.1, in: .meters)

        // Immersive visualization
        ImmersiveSpace(id: "visualization") {
            switch activeScene {
            case .archaeology: ArchaeologyView()
            case .constellation: ConstellationView()
            case .weather: WeatherView()
            case .library: LibraryView()
            }
        }
        .immersionStyle(selection: .constant(.mixed), in: .mixed, .full)
    }
}
```

### ECS Pattern

RealityKit on visionOS uses Entity-Component-System architecture. For 46K posts, this is essential — you never create 46K SwiftUI views. Instead:

```swift
// Component: lightweight data attached to each entity
struct PostDataComponent: Component {
    let postID: String
    let primaryTag: String
    let surprise: Float        // bits/word
    let engagement: Int        // views
    let wordCount: Int
    let timestamp: Date
    let textPreview: String
}

// System: runs every frame, operates on all entities with the component
struct GlowAnimationSystem: System {
    static let query = EntityQuery(where: .has(PostDataComponent.self) && .has(ModelComponent.self))

    init(scene: RealityKit.Scene) {}

    func update(context: SceneUpdateContext) {
        let time = Float(context.deltaTime)
        for entity in context.entities(matching: Self.query, updatingSystemWhen: .rendering) {
            guard let post = entity.components[PostDataComponent.self] else { continue }
            // Pulse emissive intensity based on surprise score
            var model = entity.components[ModelComponent.self]!
            // ... update material parameter
        }
    }
}
```

---

## 4. Data Pipeline: API to RealityKit

### Available Endpoints (at http://100.71.141.45:4322)

| Endpoint | Data | Use in App |
|---|---|---|
| `/api/posts?limit=100&page=1&tag=philosophy&sort=surprise&order=desc` | Paginated posts with full metadata | Primary data source |
| `/api/tags` | 20 tags with counts | Shelf/cluster generation |
| `/api/tags?parent=philosophy` | Sub-tags for a parent | Branch/satellite generation |
| `/api/graph?types=tag,sub_tag&min_weight=0.1` | Knowledge graph nodes + edges | Constellation layout |
| `/api/surprise-engagement?metric=views&limit=5000` | Scatter data: surprise vs engagement | Glow/size mapping |
| `/api/engagement-heatmap` | Hourly engagement patterns | Weather system driver |
| `/api/metrics` | Aggregate engagement stats | Dashboard window |
| `/api/search?q=deleuze` | Full-text search | Voice command results |
| `/api/kl-divergence` | Topic drift over time | Strata boundary detection |

### API Client

```swift
actor ThreadsAPIClient {
    private let baseURL = URL(string: "http://100.71.141.45:4322")!
    private let session: URLSession
    private let decoder = JSONDecoder()

    init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.waitsForConnectivity = true  // Tailscale may need to connect
        self.session = URLSession(configuration: config)
    }

    // Paginated post fetching — streams pages without blocking
    func fetchAllPosts(batchSize: Int = 100) -> AsyncStream<[ThreadsPost]> {
        AsyncStream { continuation in
            Task {
                var page = 1
                var hasMore = true
                while hasMore {
                    let batch = try await fetchPosts(page: page, limit: batchSize)
                    continuation.yield(batch.posts)
                    hasMore = batch.posts.count == batchSize
                    page += 1
                }
                continuation.finish()
            }
        }
    }

    func fetchPosts(page: Int = 1, limit: Int = 100, tag: String? = nil,
                    sort: String = "timestamp", order: String = "desc") async throws -> PostsResponse {
        var components = URLComponents(url: baseURL.appendingPathComponent("api/posts"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "page", value: "\(page)"),
            URLQueryItem(name: "limit", value: "\(limit)"),
            URLQueryItem(name: "sort", value: sort),
            URLQueryItem(name: "order", value: order),
        ]
        if let tag { components.queryItems?.append(URLQueryItem(name: "tag", value: tag)) }

        let (data, _) = try await session.data(from: components.url!)
        return try decoder.decode(PostsResponse.self, from: data)
    }

    func fetchGraph(types: [String] = ["tag", "sub_tag"], minWeight: Float = 0.1) async throws -> GraphResponse {
        var components = URLComponents(url: baseURL.appendingPathComponent("api/graph"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "types", value: types.joined(separator: ",")),
            URLQueryItem(name: "min_weight", value: "\(minWeight)"),
        ]
        let (data, _) = try await session.data(from: components.url!)
        return try decoder.decode(GraphResponse.self, from: data)
    }

    func search(query: String) async throws -> PostsResponse {
        var components = URLComponents(url: baseURL.appendingPathComponent("api/search"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "q", value: query)]
        let (data, _) = try await session.data(from: components.url!)
        return try decoder.decode(PostsResponse.self, from: data)
    }
}
```

### Data Models (Codable)

```swift
struct ThreadsPost: Codable, Identifiable {
    let id: String
    let text: String?
    let mediaType: String?
    let permalink: String?
    let timestamp: String
    let variety: String
    let wordCount: Int?
    let charCount: Int?
    let surprise: Float?
    let avgSurprise: Float?
    let views: Int?
    let likes: Int?
    let replyCount: Int?
    let reposts: Int?
    let quotes: Int?
    let tags: [String]
    let subTags: [String]
    let primaryTag: String?

    enum CodingKeys: String, CodingKey {
        case id, text, permalink, timestamp, variety, tags, surprise, views, likes, reposts, quotes
        case mediaType = "media_type"
        case wordCount = "word_count"
        case charCount = "char_count"
        case avgSurprise = "avg_surprise"
        case replyCount = "reply_count"
        case subTags = "sub_tags"
        case primaryTag = "primary_tag"
    }
}

struct PostsResponse: Codable {
    let posts: [ThreadsPost]
    let total: Int
    let page: Int
    let limit: Int
}

struct GraphNode: Codable, Identifiable {
    let id: String
    let label: String
    let nodeType: String
    let postCount: Int
    let size: Float
    let color: String

    enum CodingKeys: String, CodingKey {
        case id, label, size, color
        case nodeType = "node_type"
        case postCount = "post_count"
    }
}

struct GraphEdge: Codable {
    let source: String
    let target: String
    let edgeType: String
    let weight: Float
    let count: Int

    enum CodingKeys: String, CodingKey {
        case source, target, weight, count
        case edgeType = "edge_type"
    }
}
```

### Loading Strategy: Hybrid Pre-baked + Dynamic

For startup speed, pre-bake the two largest static datasets as local JSON files bundled with the app. Fetch fresh data on launch in the background.

| Dataset | Size | Strategy |
|---|---|---|
| `post-tags.json` (37,912 posts) | ~8MB | Bundle in app, refresh on launch |
| `knowledge-graph.json` (1,638/11,155) | ~2MB | Bundle in app, refresh weekly |
| Post detail (text, metrics) | Paginated | Fetch on demand via `/api/posts` |
| Search results | Dynamic | Fetch on voice command via `/api/search` |
| Engagement heatmap | ~50KB | Fetch on scene load |

```swift
// Progressive loading: show bundled data immediately, refresh in background
@Observable
class DataStore {
    var posts: [ThreadsPost] = []
    var graph: GraphResponse?
    var isRefreshing = false

    func loadInitial() async {
        // 1. Load bundled JSON (instant)
        if let bundled = Bundle.main.url(forResource: "post-tags", withExtension: "json") {
            let data = try? Data(contentsOf: bundled)
            self.posts = (try? JSONDecoder().decode(PostTagsFile.self, from: data!))?.posts ?? []
        }

        // 2. Refresh from API in background
        isRefreshing = true
        let client = ThreadsAPIClient()
        for await batch in client.fetchAllPosts(batchSize: 100) {
            posts.append(contentsOf: batch)
        }
        isRefreshing = false
    }
}
```

---

## 5. USDZ and Procedural Asset Generation

### Approach 1: LowLevelMesh (Recommended for 46K Points)

`LowLevelMesh` (visionOS 2.0+ / RealityKit 4) is the key API. It lets you define custom vertex layouts, populate them from Swift or a Metal compute shader, and update every frame without recreating the mesh.

This is how you render 46K post-particles as a single draw call:

```swift
// Define vertex layout for post particles
struct PostParticleVertex {
    var position: SIMD3<Float>   // 3D position in scene
    var color: SIMD4<Float>      // tag color + alpha
    var size: Float              // engagement-driven size
    var glow: Float              // surprise-driven emissive
    var phase: Float             // animation phase offset
}

func buildPostCloud(posts: [ThreadsPost]) throws -> LowLevelMesh {
    // 4 vertices per particle (camera-facing quad)
    let vertexCount = posts.count * 4
    let indexCount = posts.count * 6  // 2 triangles per quad

    var descriptor = LowLevelMesh.Descriptor()
    descriptor.vertexCapacity = vertexCount
    descriptor.indexCapacity = indexCount
    descriptor.vertexAttributes = [
        .init(semantic: .position, format: .float3, layoutIndex: 0, offset: 0),
        .init(semantic: .color, format: .float4, layoutIndex: 0, offset: 12),
        .init(semantic: .uv0, format: .float2, layoutIndex: 0, offset: 28),  // pack size + glow
    ]
    descriptor.vertexLayouts = [
        .init(bufferStride: 36)  // 12 + 16 + 8 bytes
    ]

    let mesh = try LowLevelMesh(descriptor: descriptor)

    // Populate on CPU (or dispatch to Metal compute shader for animation)
    mesh.withUnsafeMutableBytes(bufferIndex: 0) { buffer in
        let vertices = buffer.bindMemory(to: PostParticleVertex.self)
        for (i, post) in posts.enumerated() {
            let pos = layoutPosition(for: post)  // from SpatialLayoutEngine
            let color = tagColorSIMD(post.primaryTag ?? "uncategorized")
            let size = engagementToSize(post.views ?? 0)
            let glow = (post.avgSurprise ?? 0) / 10.0  // normalize to 0-1

            // Build quad (billboard in geometry shader or manual facing)
            let baseIdx = i * 4
            for corner in 0..<4 {
                vertices[baseIdx + corner] = PostParticleVertex(
                    position: pos,  // all 4 corners at same pos, offset in shader
                    color: color,
                    size: size,
                    glow: glow,
                    phase: Float(i) * 0.01
                )
            }
        }
    }

    return mesh
}
```

### Approach 2: GPU-Driven Animation via Metal Compute

For 46K particles animated every frame, offload to a Metal compute shader:

```swift
// In your System's update():
func updateParticles(mesh: LowLevelMesh, commandBuffer: MTLCommandBuffer, time: Float) {
    let encoder = commandBuffer.makeComputeCommandEncoder()!
    encoder.setComputePipelineState(particleUpdatePipeline)

    // Bind the LowLevelMesh vertex buffer directly
    encoder.setBuffer(mesh.replace(bufferIndex: 0, using: commandBuffer), offset: 0, index: 0)

    // Uniforms: time, camera position (for billboarding)
    var uniforms = ParticleUniforms(time: time, cameraPos: cameraPosition)
    encoder.setBytes(&uniforms, length: MemoryLayout<ParticleUniforms>.size, index: 1)

    let threadCount = posts.count
    let threadsPerGroup = particleUpdatePipeline.maxTotalThreadsPerThreadgroup
    encoder.dispatchThreads(
        MTLSize(width: threadCount, height: 1, depth: 1),
        threadsPerThreadgroup: MTLSize(width: min(threadsPerGroup, threadCount), height: 1, depth: 1)
    )
    encoder.endEncoding()
}
```

### Approach 3: Instanced Rendering via MeshInstancesComponent

For the Knowledge Constellation (1,638 nodes as orbs), use `MeshInstancesComponent` (new in visionOS 2.x):

```swift
// Create one sphere mesh, instance it 1,638 times
let sphereMesh = MeshResource.generateSphere(radius: 0.05)
let material = ShaderGraphMaterial(named: "GlowOrb", from: "RealityKitContent")

var instances: [MeshInstancesComponent.Instance] = []
for node in graphNodes {
    var transform = Transform(
        scale: .one * node.size,
        translation: node.position3D
    )
    instances.append(.init(transform: transform))
}

let entity = Entity()
entity.components.set(ModelComponent(mesh: sphereMesh, materials: [material]))
entity.components.set(MeshInstancesComponent(instances: instances))
```

### Approach 4: Pre-baked USDZ via Python USD Tools

For static decorative elements (library shelves, amphitheater structure, terrain base mesh), generate USDZ offline using Python:

```python
from pxr import Usd, UsdGeom, UsdShade, Gf

# Generate strata terrain from temporal data
stage = Usd.Stage.CreateNew("strata_terrain.usda")
xform = UsdGeom.Xform.Define(stage, "/Terrain")

for month_idx, month_data in enumerate(monthly_buckets):
    layer = UsdGeom.Mesh.Define(stage, f"/Terrain/Layer_{month_idx}")
    # Generate a disc mesh at y = month_idx * layer_height
    # Color by dominant tag that month
    layer.CreatePointsAttr([...])
    layer.CreateFaceVertexCountsAttr([...])
    layer.CreateFaceVertexIndicesAttr([...])

    # Apply material based on dominant tag color
    mat = UsdShade.Material.Define(stage, f"/Materials/Month_{month_idx}")
    shader = UsdShade.Shader.Define(stage, f"/Materials/Month_{month_idx}/Shader")
    shader.CreateIdAttr("UsdPreviewSurface")
    shader.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(
        Gf.Vec3f(*hex_to_rgb(TAG_COLORS[month_data['dominant_tag']]))
    )

stage.Export("strata_terrain.usda")
# Then: usdzconvert strata_terrain.usda strata_terrain.usdz
```

### ShaderGraph Materials

Create these in Reality Composer Pro (part of the Xcode project's `RealityKitContent` package):

| Material | Inputs | Effect |
|---|---|---|
| `GlowOrb` | `glow_intensity: Float`, `base_color: Color` | Emissive orb with pulsing bloom, driven by surprise score |
| `StrataLayer` | `opacity: Float`, `layer_index: Float`, `excavation_depth: Float` | Terrain layer that fades as user digs deeper |
| `EdgeFilament` | `weight: Float`, `pulse_phase: Float` | Translucent connecting line that pulses along its length |
| `BookSpine` | `surprise: Float`, `tag_color: Color` | Leather-like material with glowing spine edge |

ShaderGraph materials in visionOS are based on MaterialX and support up to 8 UV channels for passing per-instance data. You can animate parameters from Swift:

```swift
// Animate a ShaderGraph material parameter
if var material = entity.components[ModelComponent.self]?.materials.first as? ShaderGraphMaterial {
    try material.setParameter(name: "glow_intensity", value: .float(newGlow))
    entity.components[ModelComponent.self]?.materials = [material]
}
```

### ShaderGraphCoder (Write Shaders in Swift)

For procedural materials that depend on data, use [ShaderGraphCoder](https://github.com/praeclarum/ShaderGraphCoder) to avoid Reality Composer Pro entirely:

```swift
import ShaderGraphCoder

let surprise = ShaderGraphCoder.Parameter("surprise", type: .float)
let tagColor = ShaderGraphCoder.Parameter("tag_color", type: .color3f)

let glow = surprise * 2.0  // brighter for higher surprise
let emissive = tagColor * glow
let surface = PhysicallyBasedSurface(
    baseColor: tagColor,
    emissiveColor: emissive,
    roughness: 0.3,
    metallic: 0.0
)
```

---

## 6. Performance Strategy for 46K Items

### Budget

Apple recommends a maximum of 500,000 triangles for an immersive visionOS experience. At 2 triangles per billboard quad, 46K particles = 92K triangles — well within budget. The bottleneck is draw calls and entity count.

### Strategy: Tiered Rendering

| Tier | Distance | Representation | Entity Count |
|---|---|---|---|
| **Far** (>5m) | Full corpus | Single `LowLevelMesh` point cloud, 46K particles as one draw call | 1 entity |
| **Mid** (2-5m) | Visible cluster | Instanced billboard quads via `MeshInstancesComponent`, ~2K per cluster | 20 entities (one per tag) |
| **Near** (<2m) | Focused posts | Individual entities with full geometry, text labels, detail cards | 50-200 entities |

### LOD System

```swift
struct LODComponent: Component {
    enum Level: Int, Comparable {
        case particle = 0    // dot in point cloud
        case billboard = 1   // textured quad
        case detailed = 2    // 3D object with label
        static func < (lhs: Level, rhs: Level) -> Bool { lhs.rawValue < rhs.rawValue }
    }
    var current: Level = .particle
}

struct LODSystem: System {
    static let query = EntityQuery(where: .has(LODComponent.self) && .has(PostDataComponent.self))

    func update(context: SceneUpdateContext) {
        guard let camera = context.scene.performQuery(CameraQuery.self).first else { return }
        let cameraPos = camera.position(relativeTo: nil)

        for entity in context.entities(matching: Self.query, updatingSystemWhen: .rendering) {
            let distance = simd_distance(entity.position(relativeTo: nil), cameraPos)
            var lod = entity.components[LODComponent.self]!

            let newLevel: LODComponent.Level
            switch distance {
            case ..<2: newLevel = .detailed
            case 2..<5: newLevel = .billboard
            default: newLevel = .particle
            }

            if newLevel != lod.current {
                lod.current = newLevel
                entity.components[LODComponent.self] = lod
                transitionLOD(entity: entity, to: newLevel)
            }
        }
    }

    func transitionLOD(entity: Entity, to level: LODComponent.Level) {
        switch level {
        case .particle:
            // Hide individual entity, it's represented in the point cloud
            entity.isEnabled = false
        case .billboard:
            entity.isEnabled = true
            // Swap to billboard quad
        case .detailed:
            entity.isEnabled = true
            // Show full model + text attachment
        }
    }
}
```

### Spatial Hashing for Culling

Only process entities near the user's view frustum:

```swift
struct SpatialHash {
    let cellSize: Float
    private var cells: [SIMD3<Int>: [Entity]] = [:]

    mutating func insert(_ entity: Entity) {
        let pos = entity.position(relativeTo: nil)
        let key = SIMD3<Int>(Int(pos.x / cellSize), Int(pos.y / cellSize), Int(pos.z / cellSize))
        cells[key, default: []].append(entity)
    }

    func query(near position: SIMD3<Float>, radius: Float) -> [Entity] {
        let minCell = SIMD3<Int>(
            Int((position.x - radius) / cellSize),
            Int((position.y - radius) / cellSize),
            Int((position.z - radius) / cellSize)
        )
        let maxCell = SIMD3<Int>(
            Int((position.x + radius) / cellSize),
            Int((position.y + radius) / cellSize),
            Int((position.z + radius) / cellSize)
        )

        var result: [Entity] = []
        for x in minCell.x...maxCell.x {
            for y in minCell.y...maxCell.y {
                for z in minCell.z...maxCell.z {
                    if let entities = cells[SIMD3(x, y, z)] {
                        result.append(contentsOf: entities)
                    }
                }
            }
        }
        return result
    }
}
```

### Memory Budget

| Item | Estimate |
|---|---|
| 46K PostParticleVertex structs (36 bytes each) | 1.6 MB |
| 46K PostDataComponent structs (~200 bytes each) | 9.2 MB |
| Knowledge graph (1,638 nodes + 11,155 edges) | ~1 MB |
| ShaderGraph materials (5-10) | ~5 MB |
| Particle textures / atlases | ~10 MB |
| **Total scene data** | **~27 MB** |

Vision Pro has 16 GB unified memory. This is comfortable.

---

## 7. Interaction Design

### Hand Gestures

| Gesture | Detection | Action |
|---|---|---|
| **Look + Tap** (gaze + single pinch) | `SpatialTapGesture` on RealityView | Select post / node |
| **Look + Long Press** | `SpatialLongPressGesture` | Show preview tooltip |
| **Pinch + Drag** (one hand) | `DragGesture` | Pan / orbit the visualization |
| **Two-hand pinch + spread/close** | Custom via ARKit `HandTrackingProvider` | Scale the scene |
| **Open palm facing up** | Custom palm detection | Show control panel |
| **Point at cluster** | Custom index-finger ray | Highlight cluster |

```swift
// In RealityView
RealityView { content, attachments in
    // ... setup
}
.gesture(
    SpatialTapGesture()
        .targetedToAnyEntity()
        .onEnded { event in
            if let post = event.entity.components[PostDataComponent.self] {
                selectedPost = post
                // Open detail window
                openWindow(id: "preview")
            }
        }
)
.gesture(
    DragGesture()
        .targetedToAnyEntity()
        .onChanged { event in
            // Orbit: rotate root entity based on drag delta
            let delta = event.translation3D
            rootEntity.orientation *= simd_quatf(angle: Float(delta.x) * 0.001, axis: [0, 1, 0])
        }
)
```

### Eye Tracking (Hover-to-Preview)

visionOS provides system-level hover via `HoverEffectComponent`. For custom hover behavior:

```swift
// System-provided hover highlight (glass-like)
entity.components.set(HoverEffectComponent(.highlight))

// Custom hover: use InputTargetComponent + CollisionComponent
entity.components.set(InputTargetComponent())
entity.components.set(CollisionComponent(shapes: [.generateSphere(radius: 0.05)]))

// In SwiftUI:
RealityView { ... }
    .onContinuousHover(coordinateSpace: .named("scene")) { phase in
        switch phase {
        case .active(let location):
            // Perform hit test, show nearby post preview
        case .ended:
            // Hide preview
        }
    }
```

### Voice Commands

Use `SFSpeechRecognizer` or the system dictation API for natural language queries:

```swift
// Simple approach: SwiftUI .searchable with dictation
TextField("Search posts...", text: $searchQuery)
    .onSubmit {
        Task {
            let results = try await apiClient.search(query: searchQuery)
            highlightPosts(results.posts)
        }
    }
```

For always-listening commands, integrate with `SiriKit` intents or use `SFSpeechRecognizer` with custom grammar:
- "Show me philosophy posts"
- "Filter to January 2025"
- "Sort by surprise"
- "Compare tech and political"

### Spatial Anchoring

Users can pin a post card to their physical space:

```swift
// Pin a post detail window at its current position in the room
func pinPost(_ post: ThreadsPost, at worldPosition: SIMD3<Float>) {
    let anchor = AnchorEntity(.head)  // or WorldAnchor for persistence
    anchor.position = worldPosition
    let card = makePostCardEntity(post)
    anchor.addChild(card)
    scene.addAnchor(anchor)
}
```

---

## 8. Spatial Audio and Sonification

### PHASE Engine for Data-Driven Sound

visionOS uses the PHASE (Physical Audio Spatialization Engine) framework. Each tag cluster can have its own ambient sound, spatially positioned:

```swift
import PHASE

func setupAudioForCluster(tag: String, position: SIMD3<Float>, postCount: Int) {
    let engine = PHASEEngine(updateMode: .automatic)
    try engine.start()

    // Create a spatial audio source at the cluster position
    let source = PHASESource(engine: engine)
    source.transform = simd_float4x4(translation: position)

    // Listener tracks the user's head
    let listener = PHASEListener(engine: engine)
    listener.transform = /* head transform from ARKit */

    // Volume and character map to data
    // - Philosophy: low drone, calm
    // - Political: sharper, higher frequency
    // - Shitpost: playful, staccato
    // Volume proportional to sqrt(postCount)
}
```

### Sonification Mappings

| Data Dimension | Audio Parameter | Range |
|---|---|---|
| Surprise score | Pitch (higher = more surprising) | 200-800 Hz |
| Engagement (views) | Volume | 0.1 - 1.0 |
| Tag category | Timbre (instrument choice) | 20 distinct tones |
| Temporal density | Tempo (faster = more posts/day) | 60-180 BPM |
| Sentiment | Consonance/dissonance | Major vs minor intervals |

### Ambient Audio for Weather System

```swift
// Storm intensity mapped to political + controversy posting density
let stormIntensity = Float(politicalPostsThisWeek) / Float(totalPostsThisWeek)
thunderSource.gain = stormIntensity * 0.8
rainSource.gain = stormIntensity * 0.6
windSource.gain = max(0.1, stormIntensity * 0.3)  // always some wind
```

---

## 9. Generative Artifacts

### Procedural Geometry from Post Metrics

Map post data to mesh parameters:

| Data | Geometry Parameter | Effect |
|---|---|---|
| Surprise (bits/word) | Vertex displacement noise amplitude | Spiky = surprising, smooth = expected |
| Word count | Mesh vertex count / resolution | Dense mesh for long posts, simple for short |
| Engagement (views) | Scale | Bigger = more viewed |
| Tag | Base shape | Philosophy = icosahedron, tech = cube, shitpost = torus knot |
| Is quote post | Torus vs sphere | Quotes have a "ring" linking to the original |
| Is reply | Tentacle/branch extending toward parent | Reply chains form organic structures |

```swift
// Procedural mesh: surprise-driven displacement
func generatePostGeometry(post: ThreadsPost) -> MeshResource {
    let baseRadius: Float = 0.02 + Float(post.views ?? 0) / 100000.0 * 0.08
    let surprise = post.avgSurprise ?? 0
    let subdivisions = min(32, max(8, (post.wordCount ?? 10) / 5))

    // Start with icosphere
    var mesh = MeshResource.generateSphere(radius: baseRadius)

    // For high-surprise posts, apply noise displacement
    if surprise > 3.0 {
        // Use LowLevelMesh to displace vertices
        // Perlin noise amplitude proportional to surprise
    }

    return mesh
}
```

### AI-Generated Textures (Local)

For unique per-tag atmospheric textures (skyboxes, terrain materials), generate offline:

1. **Stable Diffusion (local via Draw Things or mlx-swift):** Generate 20 tag-specific textures
   - `philosophy`: marble, ancient stone, starfield
   - `tech`: circuit board, holographic grid
   - `shitpost`: glitch art, vaporwave
   - `political`: newsprint, protest imagery

2. **Convert to ShaderGraph textures** in Reality Composer Pro

3. **Apply as environment maps** per scene/cluster

### Procedural USDZ Pipeline

```bash
# Generate terrain strata from post-tags.json
python3 scripts/generate_strata.py --input public/data/post-tags.json --output assets/strata.usda

# Generate library shelves from tag distribution
python3 scripts/generate_shelves.py --input public/data/post-tags.json --output assets/shelves.usda

# Convert to USDZ
usdzconvert assets/strata.usda assets/strata.usdz
usdzconvert assets/shelves.usda assets/shelves.usdz
```

---

## 10. Framework Reference

### Core Frameworks

| Framework | Use | Import |
|---|---|---|
| **RealityKit** | 3D rendering, ECS, particle systems | `import RealityKit` |
| **SwiftUI** | Windows, volumes, controls | `import SwiftUI` |
| **ARKit** | Hand tracking, world anchors | `import ARKit` |
| **PHASE** | Spatial audio | `import PHASE` |
| **Metal** | Compute shaders for particle animation | `import Metal` |
| **GroupActivities** | SharePlay for collaborative viewing | `import GroupActivities` |
| **NaturalLanguage** | On-device text processing for search | `import NaturalLanguage` |
| **Speech** | Voice commands | `import Speech` |

### Key APIs

| API | What It Does |
|---|---|
| `ImmersiveSpace` | Full/mixed immersion scene container |
| `RealityView` | SwiftUI view that hosts RealityKit content |
| `LowLevelMesh` | Custom vertex buffer for 46K particles (single draw call) |
| `MeshInstancesComponent` | GPU instancing for repeated geometry |
| `ParticleEmitterComponent` | Built-in particle system for effects |
| `ShaderGraphMaterial` | MaterialX-based custom materials |
| `HoverEffectComponent` | Eye-gaze hover feedback |
| `InputTargetComponent` + `CollisionComponent` | Make entity tappable |
| `SpatialTapGesture` / `DragGesture` | SwiftUI gesture recognizers for RealityView |
| `HandTrackingProvider` | ARKit hand skeleton data |
| `WorldTrackingProvider` | Device pose, room anchors |
| `SpatialAudioSession` | Configure app audio behavior |

### visionOS-Specific Scene Types

```swift
// Window: standard 2D SwiftUI UI (filters, search, stats)
WindowGroup { ContentView() }

// Volume: 3D content in a bounded box (preview, miniature)
WindowGroup(id: "preview") { PostPreview() }
    .windowStyle(.volumetric)
    .defaultSize(width: 0.4, height: 0.4, depth: 0.4, in: .meters)

// Immersive Space: mixed (passthrough) or full (VR)
ImmersiveSpace(id: "archaeology") { ArchaeologyView() }
    .immersionStyle(selection: $immersion, in: .mixed, .full)
```

### Particle Systems in RealityKit

```swift
// Built-in particle emitter for ambient effects (dust, glow, fireflies)
var emitter = ParticleEmitterComponent()
emitter.emitterShape = .sphere
emitter.birthRate = 100
emitter.speed = 0.02
emitter.speedVariation = 0.01
emitter.lifeSpan = 3.0
emitter.mainEmitter.color = .evolving(
    start: .single(.init(red: 0.8, green: 0.7, blue: 0.3, alpha: 0.8)),
    end: .single(.init(red: 0.3, green: 0.2, blue: 0.1, alpha: 0.0))
)
emitter.mainEmitter.size = 0.003
emitter.mainEmitter.blendMode = .additive

let particleEntity = Entity()
particleEntity.components.set(emitter)
```

---

## 11. Implementation Roadmap

### Phase 1: Foundation (2-3 weeks)

- [ ] Create Xcode project targeting visionOS 2.0+
- [ ] Implement `ThreadsAPIClient` with async/await
- [ ] Define Codable models matching API response shapes
- [ ] Bundle `post-tags.json` and `knowledge-graph.json`
- [ ] Build SwiftUI control window (tag filters, time range, scene picker)
- [ ] Set up `RealityKitContent` package in Reality Composer Pro

### Phase 2: First Visualization — Knowledge Constellation (2 weeks)

- [ ] Implement 3D force-directed layout for knowledge graph (1,638 nodes)
- [ ] Render nodes as instanced spheres via `MeshInstancesComponent`
- [ ] Render edges as line segments
- [ ] Create `GlowOrb` ShaderGraph material
- [ ] Add `SpatialTapGesture` for node selection
- [ ] Add `DragGesture` for orbit
- [ ] Display post detail in a volumetric window

### Phase 3: Post Cloud — Thought Archaeology (3 weeks)

- [ ] Build `LowLevelMesh` for 46K post particles
- [ ] Implement Metal compute shader for particle animation
- [ ] Create strata terrain (Python USDZ generation + import)
- [ ] Implement excavation gesture (pinch + pull)
- [ ] Create `StrataLayer` ShaderGraph material with excavation depth
- [ ] Add `ParticleEmitterComponent` for dust effects
- [ ] LOD system for near/mid/far rendering tiers

### Phase 4: Polish and Interaction (2 weeks)

- [ ] Eye-gaze hover preview via `HoverEffectComponent`
- [ ] Voice search integration (`SFSpeechRecognizer`)
- [ ] Two-hand zoom gesture
- [ ] Spatial audio (ambient per-cluster sounds)
- [ ] Progressive loading indicator in SwiftUI window
- [ ] Smooth transitions between visualization scenes

### Phase 5: Social and Sharing (1 week)

- [ ] SharePlay via `GroupActivities` for collaborative exploration
- [ ] Spatial Personas integration
- [ ] Screenshot / spatial photo capture
- [ ] Export selected posts as shareable cards

---

## 12. Sources

### Apple Official Documentation
- [visionOS Overview](https://developer.apple.com/visionos/)
- [Creating Immersive Spaces in visionOS](https://developer.apple.com/documentation/visionOS/creating-immersive-spaces-in-visionos-with-swiftui)
- [Construct an Immersive Environment for visionOS](https://developer.apple.com/documentation/RealityKit/construct-an-immersive-environment-for-visionOS)
- [Simulating Particles in Your visionOS App](https://developer.apple.com/documentation/RealityKit/simulating-particles-in-your-visionos-app)
- [LowLevelMesh API Documentation](https://developer.apple.com/documentation/realitykit/lowlevelmesh)
- [Playing Spatial Audio in visionOS](https://developer.apple.com/documentation/visionos/playing-spatial-audio-in-visionos)
- [Modifying RealityKit Rendering Using Custom Materials](https://developer.apple.com/documentation/realitykit/modifying-realitykit-rendering-using-custom-materials)
- [Explore USD Tools and Rendering - WWDC22](https://developer.apple.com/videos/play/wwdc2022/10141/)
- [Build a Spatial Drawing App with RealityKit - WWDC24](https://developer.apple.com/videos/play/wwdc2024/10104/)
- [What's New in RealityKit - WWDC25](https://developer.apple.com/videos/play/wwdc2025/287/)
- [What's New in visionOS 26 - WWDC25](https://developer.apple.com/videos/play/wwdc2025/317/)
- [What's New - visionOS](https://developer.apple.com/visionos/whats-new/)
- [Designing for visionOS (Human Interface Guidelines)](https://developer.apple.com/design/human-interface-guidelines/designing-for-visionos)

### WWDC Sessions
- [Build Immersive Web Experiences with WebXR - WWDC24](https://developer.apple.com/videos/play/wwdc2024/10066/)
- [Discover RealityKit APIs for iOS, macOS and visionOS - WWDC24](https://wwdcnotes.com/documentation/wwdcnotes/wwdc24-10103-discover-realitykit-apis-for-ios-macos-and-visionos/)
- [Explore Immersive Sound Design - WWDC23](https://developer.apple.com/videos/play/wwdc2023/10271/)

### Third-Party Tutorials and References
- [Unlocking the Power of visionOS Particles - XRealityZone](https://medium.com/@xreality.zone/unlocking-the-power-of-visionos-particles-a-detailed-tutorial-211d323f8cf8)
- [Creating Custom Particle Emitters with RealityKit](https://www.createwithswift.com/creating-custom-particle-emitters-with-realitykit/)
- [Build Realistic Particle Effects for visionOS - GetStream](https://getstream.io/blog/visionos-particle-effects/)
- [How to Build an Immersive RealityKit Scene Using ECS](https://swiftorbit.io/realitykit-ecs-floating-brick/)
- [Optimizing RealityKit Apps for visionOS](https://www.gabrieluribe.me/blog/optimizing-realitykit-apps-games-visionos)
- [Getting Started with Node-Based Shaders for visionOS](https://medium.com/@mrdeerwhale/getting-started-with-node-based-shaders-for-visionos-materials-7f901177567c)
- [ShaderGraphByExamples (GitHub)](https://github.com/ynagatomo/ShaderGraphByExamples)
- [ShaderGraphCoder - Write RealityKit Shaders in Swift (GitHub)](https://github.com/praeclarum/ShaderGraphCoder)
- [RealityGeometries - Additional Geometries for RealityKit (GitHub)](https://github.com/maxxfrazer/RealityGeometries)
- [metal-spatial-dynamic-mesh - LowLevelMesh Demo (GitHub)](https://github.com/metal-by-example/metal-spatial-dynamic-mesh)
- [RealityKit ECS Example (GitHub)](https://github.com/belkhadir/RealityKit-ECS-Example)
- [Particle Systems via RealityKit with NativeScript](https://blog.nativescript.org/particles-and-multiple-scenes-vision-pro-development/)
- [RealityKit Instanced Rendering Discussion](https://developer.apple.com/forums/thread/748601)

### USD / USDZ Tools
- [USD Python Tutorials - OpenUSD Documentation](https://openusd.org/release/tut_usd_tutorials.html)
- [Apple's usdzconvert Python Tools (GitHub)](https://github.com/KarpelesLab/usdpython)
- [USD Python Tools README](https://github.com/tappi287/usdzconvert_windows/blob/master/README_USD-Python-Tools.md)
- [USDZ Files and USD Python Tools - Kodeco](https://www.kodeco.com/books/apple-augmented-reality-by-tutorials/v1.0/chapters/4-usdz-files-usd-python-tools)

### Spatial Audio
- [Advanced Guide to Implementing Spatial Audio in VisionPro](https://medium.com/@wesleymatlock/advanced-guide-to-implementing-spatial-audio-in-visionpro-applications-abe9f66281a1)
- [visionOS Spatial Audio Performance Improvements (9to5Mac)](https://9to5mac.com/2026/03/25/apple-vision-pro-boosts-spatial-audio-performance-with-impressive-engineering-trick/)
