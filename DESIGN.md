# react-shadertoy — Design Document

## Overview

A library that lets you run Shadertoy GLSL shaders as React components. Copy-paste and it works.

```tsx
import { Shadertoy } from 'react-shadertoy'

<Shadertoy fragmentShader={`
  void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    fragColor = vec4(uv, 0.5 + 0.5 * sin(iTime), 1.0);
  }
`} />
```

## Core Principles

- **Shadertoy code works as-is** — no uniform renaming needed
- **3 lines for React developers** — no WebGL/Three.js knowledge required
- **Lightweight** — zero dependencies, raw WebGL

## Shadertoy-Compatible Uniforms

Maps all standard Shadertoy uniforms:

| Uniform | Type | Description | Status |
|---|---|---|---|
| `iResolution` | `vec3` | Viewport size (px) | v0.5.0 |
| `iTime` | `float` | Elapsed time (seconds) | v0.5.0 |
| `iTimeDelta` | `float` | Delta since last frame (seconds) | v0.5.0 |
| `iFrame` | `int` | Frame counter | v0.5.0 |
| `iMouse` | `vec4` | Mouse position (xy: current, zw: click) | v0.5.0 |
| `iDate` | `vec4` | Year, month, day, seconds since midnight | v0.5.0 (month fix v0.10.0) |
| `iSampleRate` | `float` | Audio sample rate (44100.0) | v0.10.0 |
| `iChannelTime[4]` | `float[]` | Per-channel playback time | v0.10.0 |
| `iChannelResolution[4]` | `vec3[]` | Texture resolutions | v0.5.0 |
| `iChannel0-3` | `sampler2D` / `samplerCube` | Texture inputs | v0.5.0 / cube v0.11.0 |

## API Design

### Basic (Pattern A: Copy-Paste)

```tsx
<Shadertoy
  fragmentShader={glslString}    // Required: Shadertoy GLSL code
  style={{ width: '100%', height: '400px' }}
/>
```

### Optional Props

```tsx
<Shadertoy
  fragmentShader={glslString}
  
  // Textures
  textures={{
    iChannel0: '/texture.png',       // Image URL
    iChannel1: videoElement,          // HTMLVideoElement
    iChannel2: canvasElement,         // HTMLCanvasElement
  }}
  
  // Controls
  paused={false}                     // Pause rendering
  speed={1.0}                        // Time speed multiplier
  pixelRatio={window.devicePixelRatio}
  
  // Callbacks
  onError={(error) => {}}            // GLSL compile error
  onLoad={() => {}}                  // WebGL ready
  
  // Styling
  className="my-shader"
  style={{ width: '100%', height: '100vh' }}
/>
```

### API Integration (Pattern B: ID Lookup)

```tsx
<Shadertoy id="MdX3zr" apiKey="your-key" />
```

Fetches from Shadertoy API, auto-converts to multipass config, shows author overlay.

### Hooks API

```tsx
import { useShadertoy } from 'react-shadertoy'

const { canvasRef, isReady, error, pause, resume } = useShadertoy({
  fragmentShader: glslString,
  textures: { iChannel0: '/noise.png' },
})

return <canvas ref={canvasRef} />
```

## Rendering Engine

### Option 1: Raw WebGL (chosen)
- **Pros**: Zero dependencies, minimal bundle, lightweight install
- **Cons**: Manual WebGL context management
- **Fit**: Shadertoy is just a full-screen quad + fragment shader — WebGL is sufficient

### Option 2: Three.js / R3F
- **Pros**: Large ecosystem, shared foundation with shabon-fx
- **Cons**: Three.js (150KB+) as dependency, heavy
- **Fit**: Scene graph, camera, lights are all unnecessary — overkill

### Decision: **Raw WebGL**
Shadertoy rendering is a full-screen quad + fragment shader. Nothing more.
Three.js scene graph, camera, and lights are unnecessary.
Lightness is a core value of this library.

## Project Structure

```
react-shadertoy/
├── src/
│   ├── index.ts              # Barrel exports
│   ├── Shadertoy.tsx          # Main component (+ license overlay)
│   ├── useShadertoy.ts        # Hooks API (single-pass, multipass, API mode)
│   ├── renderer.ts            # WebGL2 renderer (GLSL ES 3.0 preamble, quad)
│   ├── uniforms.ts            # Shadertoy uniform per-frame updates
│   ├── textures.ts            # Texture loading (URL, video, canvas, options)
│   ├── multipass.ts           # FBO + ping-pong multipass pipeline
│   ├── api.ts                 # Shadertoy API fetch + config conversion
│   └── types.ts               # TypeScript type definitions
├── examples/
│   └── basic/                 # Multi-shader example (Vite)
├── test/                      # Real Shadertoy GLSL test shaders
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE                    # MIT
└── DESIGN.md                  # This file
```

## package.json

```json
{
  "name": "react-shadertoy",
  "description": "Run Shadertoy GLSL shaders in React. Copy-paste and it works.",
  "keywords": [
    "react", "shadertoy", "glsl", "webgl", "shader",
    "fragment-shader", "creative-coding", "generative-art"
  ],
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  },
  "dependencies": {}
}
```

**Zero external dependencies.** React only as peerDependency.

## Implementation Phases

### Phase 1: MVP ✅
- [x] Full-screen quad WebGL renderer
- [x] All Shadertoy standard uniforms (iResolution, iTime, iMouse, etc.)
- [x] `<Shadertoy>` component
- [x] `useShadertoy` hook
- [x] GLSL compile error handling
- [x] npm publish

### Phase 2: Textures ✅
- [x] iChannel0-3 image texture support (URL string)
- [x] Dynamic textures (HTMLVideoElement, HTMLCanvasElement, HTMLImageElement)
- [x] Texture options (wrap, filter, vflip) with NPOT fallback
- [x] iChannelResolution auto-detection
- [x] `texture()` → `texture2D()` compatibility shim

### Phase 3: Advanced ✅
- [x] Multipass (Buffer A-D → Image) with FBO + ping-pong
- [x] WebGL2 migration (GLSL ES 3.0 — bitwise ops, int min/max, flexible loops)
- [x] Alpha force 1.0 (Shadertoy opaque rendering compat)
- [x] Shadertoy API integration (ID lookup + build-time cache)
- [x] License info overlay

### Phase 4: Ecosystem ✅
- [x] README full rewrite with all features documented
- [x] Example app with 7+ shaders (texture, multipass, raymarching)
- [ ] Next.js / Vite / Remix templates (future)
- [ ] Storybook integration (future)

### Phase 5: Shadertoy Compatibility Deep Dive (v0.9.0–v0.12.0) ✅

Full investigation of Shadertoy internals by a 6-agent research team. Compatibility improved from ~80% to ~97%.

- [x] **v0.9.0** — RGBA32F multipass (EXT_color_buffer_float + OES_texture_float_linear fallback chain)
- [x] **v0.9.0** — Auto self-feedback (buffer passes auto-bind previous frame to iChannel0)
- [x] **v0.9.0** — Performance (uniform location cache, Float32Array reuse)
- [x] **v0.9.0** — HW_PERFORMANCE define (required for IQ's shaders to compile)
- [x] **v0.10.0** — `iChannelTime[4]` + `iSampleRate` uniforms
- [x] **v0.10.0** — `iDate` month fix (JS 0-based → Shadertoy 1-based)
- [x] **v0.10.0** — GLSL compat shims (`texture2DLod/Grad/EXT`, `textureCube`)
- [x] **v0.10.0** — Mirror texture wrap mode (`gl.MIRRORED_REPEAT`)
- [x] **v0.11.0** — Keyboard input (256×3 R8 texture: keyDown/keyPressed/toggle)
- [x] **v0.11.0** — Cubemap texture input (6-face URL loading + dynamic `samplerCube` declaration)
- [x] **v0.11.0** — Dynamic preamble (`buildPreamble()` for per-channel sampler type)
- [x] **v0.12.0** — Audio input (512×2 R8 texture: FFT + waveform via WebAudio AnalyserNode)
- [x] **v0.12.0** — Microphone / MediaStream support (`audio={true}` or `audio={stream}`)

## Shadertoy Compatibility: Remaining Gaps (~3%)

### Researched but Not Yet Implemented

All findings from the 6-agent research team. Implementation approach is known for each.

#### Sound Pass (`mainSound()`) — Impact: ~2%

Shadertoy's Sound tab. Generates audio waveforms from GLSL.

```glsl
void mainSound(out vec4 fragColor, in float time) {
  float freq = 440.0;
  float wave = sin(2.0 * 3.14159 * freq * time);
  fragColor = vec4(wave, wave, 0.0, 1.0);  // L, R stereo
}
```

**Spec:**
- No texture access, no iChannelTime
- Audio buffer is pre-computed (can run in parallel with Image render)
- Output: L/R stereo → WebAudio AudioBuffer

**Implementation approach:**
- Detect `mainSound()` → render to offscreen FBO with dedicated shader pass
- `readPixels()` FBO output → Float32Array → `AudioBufferSourceNode` for playback
- Runs independently from Image/Buffer passes

#### Cubemap Buffer Pass (`mainCubemap()`) — Impact: ~1%

Generates a 6-face cubemap from GLSL.

```glsl
void mainCubemap(out vec4 fragColor, in vec2 fragCoord, in vec3 fragRayOri, in vec3 fragRayDir) {
  vec3 color = fragRayDir * 0.5 + 0.5;
  fragColor = vec4(color, 1.0);
}
```

**Spec:**
- 6 × 1024×1024 RGBA16F buffers
- `fragRayDir`: normalized direction vector for each cube face (auto-injected)
- Readable from Image pass via `samplerCube`

**Implementation approach:**
- Execute `mainCubemap()` 6 times, rendering to each face's FBO
- Ray direction calculation: fragCoord → cube face → normalized direction vector
- Add `'CubemapA'` to `PASS_ORDER` in multipass.ts

#### Webcam Input — Impact: <1%

`navigator.mediaDevices.getUserMedia({ video: true })` → Canvas → Texture.
Video texture pipeline already exists (HTMLVideoElement supported). Only UI integration needed.

#### sRGB Textures — Impact: <1%

Shadertoy API returns `sampler.srgb` but we currently ignore it.
Fix: use `gl.SRGB8_ALPHA8` as internalFormat when `srgb === 'true'`.

### Intentional Differences from Shadertoy

Differences identified during research that are deliberate design choices, not bugs:

| Item | Shadertoy | react-shadertoy | Rationale |
|------|-----------|----------------|-----------|
| Precision | `mediump float` | `highp float` | **Keep highp** — ensures accuracy on desktop GPUs |
| iFrame type | Unknown (works as int) | `int` | **Keep int** — `iFrame < 1` compiles in GLSL ES 3.0 |
| Chrome RGBA16F auto-promote | Implicit dependency | Explicit RGBA32F | **Current is correct** — stable across browsers |
| Buffer format | RGBA32F (Chrome-assumed) | RGBA32F→16F→8 fallback | **Fallback chain is more robust** |

### Browser Compatibility Notes

- **Chrome**: Internally promotes RGBA16F to RGBA32F. Most Shadertoy authors tune for Chrome.
- **Firefox**: Strictly implements FP16 for RGBA16F → shaders tuned on Chrome may overflow.
- **Safari**: GPU/driver dependent, needs testing.
- react-shadertoy uses explicit RGBA32F → RGBA16F → RGBA8 fallback chain for cross-browser support.

## Competitive Comparison

| | react-shadertoy | shadertoy-react (dead) | react-shaders |
|---|---|---|---|
| Maintained | **Active** | Abandoned 2021 | Abandoned 2023 |
| Dependencies | **Zero** | Three.js | Unknown |
| Shadertoy compat | **All uniforms + textures + multipass** | Basic only | Partial |
| Textures | **image/video/canvas + options** | None | Unknown |
| Multipass | **Buffer A-D + ping-pong** | None | None |
| TypeScript | **Full support** | None | Yes |

## Relationship with shabon-fx

```
react-shadertoy  = Generic bridge (any Shadertoy GLSL → React)
shabon-fx        = Curated effects (hand-crafted, optimized, production-quality)
```

They are independent. shabon-fx uses Three.js/R3F, react-shadertoy uses raw WebGL.
In the future, shabon-fx may use react-shadertoy internally.

---

*Started 2026-04-02 — v0.5.0 shipped (Phase 1-3 complete)*
*2026-04-07 — v0.12.0 shipped (Phase 5 complete, ~97% Shadertoy compatibility)*
