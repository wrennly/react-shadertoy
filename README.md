# react-shadertoy

Run [Shadertoy](https://www.shadertoy.com/) GLSL shaders in React. Drop a `.glsl` file and it just works.

- **File-based** — point to a `.glsl` file, swap shaders by swapping files
- Zero dependencies (just React)
- WebGL2 (GLSL ES 3.0) — full Shadertoy compatibility
- All uniforms: `iTime`, `iResolution`, `iMouse`, `iDate`, `iFrame`, etc.
- iChannel0-3 textures (image URL, video, canvas, with wrap/filter/vflip)
- **RGBA32F** multipass rendering (Buffer A-D with ping-pong FBO, float precision matching Shadertoy)
- Auto self-feedback — buffer passes read their own previous frame by default
- Shadertoy API integration (`<Shadertoy id="MdX3zr" />`)
- Mouse & touch interaction built-in
- TypeScript-first

## Install

```bash
npm install react-shadertoy
```

## Quick Start

```tsx
import { Shadertoy } from 'react-shadertoy'

// Point to a .glsl file — that's it
<Shadertoy fragmentShader="/shaders/myeffect.glsl" style={{ width: '100%', height: '400px' }} />
```

1. Save a shader from [Shadertoy](https://www.shadertoy.com/) as a `.glsl` file in your `public/` folder
2. Point `fragmentShader` to the file path
3. Done. Swap the file to swap the shader.

### Inline GLSL

You can also pass GLSL code directly as a string:

```tsx
<Shadertoy
  style={{ width: '100%', height: '400px' }}
  fragmentShader={`
    void mainImage(out vec4 fragColor, in vec2 fragCoord) {
      vec2 uv = fragCoord / iResolution.xy;
      fragColor = vec4(uv, 0.5 + 0.5 * sin(iTime), 1.0);
    }
  `}
/>
```

## Textures

Pass image URLs, video elements, or canvas elements as textures:

```tsx
<Shadertoy
  fragmentShader={code}
  textures={{
    iChannel0: '/noise.png',
    iChannel1: videoRef.current,
    iChannel2: canvasRef.current,
  }}
/>
```

### Texture Options

Control wrap mode, filtering, and vertical flip:

```tsx
<Shadertoy
  fragmentShader={code}
  textures={{
    iChannel0: {
      src: '/noise.png',
      wrap: 'repeat',     // 'clamp' | 'repeat' (default: 'clamp')
      filter: 'mipmap',   // 'nearest' | 'linear' | 'mipmap' (default: 'mipmap')
      vflip: true,         // vertical flip (default: true)
    },
    iChannel1: '/simple.png',  // shorthand = default options
  }}
/>
```

## Multipass

Buffer A-D with RGBA32F precision and automatic self-feedback:

```tsx
<Shadertoy
  passes={{
    BufferA: {
      code: bufferACode,
      // iChannel0 auto-binds to own previous frame (self-feedback)
      iChannel1: '/noise.png', // external texture
    },
    BufferB: {
      code: bufferBCode,
      iChannel0: 'BufferA',    // read Buffer A output
    },
    Image: {
      code: imageCode,
      iChannel0: 'BufferA',
      iChannel1: 'BufferB',
    },
  }}
/>
```

Buffer passes automatically read their own previous frame via `iChannel0` (Shadertoy default behavior). Override by explicitly setting `iChannel0` to something else.

Multipass uses **RGBA32F** textures (with RGBA16F/RGBA8 fallback), matching Shadertoy's float precision for fluid simulations, reaction-diffusion, and physics shaders.
```

## Shadertoy API

Load shaders directly from Shadertoy by ID:

```tsx
<Shadertoy
  id="MdX3zr"
  apiKey="your-api-key"
/>
```

Shows an author/name overlay by default. Disable with `showLicense={false}`.

API key from [shadertoy.com/myapps](https://www.shadertoy.com/myapps).

### Build-Time Fetch

For production, fetch at build time to avoid runtime API calls:

```ts
import { fetchShader, apiToConfig } from 'react-shadertoy'

const shader = await fetchShader('MdX3zr', process.env.SHADERTOY_API_KEY)
const config = apiToConfig(shader)
// Save config to JSON, use passes prop at runtime
```

## Hooks API

```tsx
import { useShadertoy } from 'react-shadertoy'

function MyShader() {
  const { canvasRef, isReady, error, pause, resume, meta } = useShadertoy({
    fragmentShader: `
      void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        vec2 uv = fragCoord / iResolution.xy;
        fragColor = vec4(uv, 0.5 + 0.5 * sin(iTime), 1.0);
      }
    `,
  })

  return <canvas ref={canvasRef} style={{ width: '100%', height: '400px' }} />
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `fragmentShader` | `string` | — | Shadertoy GLSL code |
| `textures` | `TextureInputs` | — | iChannel0-3 texture sources |
| `passes` | `MultipassConfig` | — | Multipass Buffer A-D + Image |
| `id` | `string` | — | Shadertoy shader ID (API mode) |
| `apiKey` | `string` | — | Shadertoy API key |
| `showLicense` | `boolean` | `true` (API) | Show author overlay |
| `style` | `CSSProperties` | — | Container style |
| `className` | `string` | — | Container className |
| `paused` | `boolean` | `false` | Pause rendering |
| `speed` | `number` | `1.0` | `iTime` speed multiplier |
| `pixelRatio` | `number` | `devicePixelRatio` | Canvas pixel ratio |
| `mouse` | `boolean` | `true` | Enable mouse/touch tracking |
| `uniforms` | `CustomUniforms` | — | Custom uniform values |
| `onFrame` | `(ctx: FrameContext) => void` | — | Per-frame callback |
| `onError` | `(error: string) => void` | — | GLSL compile error callback |
| `onLoad` | `() => void` | — | WebGL ready callback |

## Supported Uniforms

| Uniform | Type | Description |
|---------|------|-------------|
| `iResolution` | `vec3` | Viewport size in pixels |
| `iTime` | `float` | Elapsed time in seconds |
| `iTimeDelta` | `float` | Time since last frame |
| `iFrame` | `int` | Frame counter |
| `iMouse` | `vec4` | Mouse position & click state |
| `iDate` | `vec4` | Year, month, day, seconds |
| `iChannel0-3` | `sampler2D` | Texture inputs |
| `iChannelResolution` | `vec3[4]` | Texture dimensions |

## Why Raw GLSL?

AI coding assistants generate raw GLSL far more reliably than framework-specific shader APIs. GLSL is a standard with massive training data — no abstraction layers to get wrong. Ask any AI to "write a Shadertoy shader that does X" and paste the result directly into `fragmentShader`. It just works.

## License

MIT
