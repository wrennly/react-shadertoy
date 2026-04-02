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

| Uniform | Type | Description |
|---|---|---|
| `iResolution` | `vec3` | Viewport size (px) |
| `iTime` | `float` | Elapsed time (seconds) |
| `iTimeDelta` | `float` | Delta since last frame (seconds) |
| `iFrame` | `int` | Frame counter |
| `iMouse` | `vec4` | Mouse position (xy: current, zw: click) |
| `iDate` | `vec4` | Year, month, day, seconds since midnight |
| `iSampleRate` | `float` | Audio sample rate |
| `iChannelResolution[4]` | `vec3[]` | Texture resolutions |
| `iChannel0-3` | `sampler2D` | Texture inputs |

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

### API Integration (Pattern B: ID Lookup — Future)

```tsx
// Fetches GLSL from Shadertoy API at build time + caches locally
<Shadertoy id="MdX3zr" />
```

Note: Shadertoy API is limited to 1,500 requests/month. Build-time fetch + local cache mitigates this.
License display is required (default: CC BY-NC-SA 3.0).

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
│   ├── Shadertoy.tsx          # Main component
│   ├── useShadertoy.ts        # Hooks API
│   ├── renderer.ts            # WebGL renderer (uniform mapping, render loop)
│   ├── uniforms.ts            # Shadertoy uniform definitions + per-frame updates
│   └── types.ts               # TypeScript type definitions
├── examples/
│   └── basic/                 # Minimal example (Vite)
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

### Phase 3: Advanced (in progress)
- [x] Multipass (Buffer A-D → Image) with FBO + ping-pong
- [ ] Shadertoy API integration (ID lookup + build-time cache)
- [ ] License info display

### Phase 4: Ecosystem
- [ ] Next.js / Vite / Remix templates
- [ ] Storybook integration
- [ ] Shadertoy import guide

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

*Started 2026-04-02 — Phase 1 shipped*
