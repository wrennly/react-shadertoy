# react-shadertoy

Run [Shadertoy](https://www.shadertoy.com/) GLSL shaders in React. Copy-paste and it works.

- Zero dependencies (just React)
- WebGL2 (GLSL ES 3.0) — full Shadertoy compatibility
- All uniforms: `iTime`, `iResolution`, `iMouse`, `iDate`, `iFrame`, etc.
- iChannel0-3 textures (image URL, video, canvas, with wrap/filter/vflip)
- Multipass rendering (Buffer A-D with ping-pong FBO)
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

function App() {
  return (
    <Shadertoy
      style={{ width: '100%', height: '400px' }}
      fragmentShader={`
        void mainImage(out vec4 fragColor, in vec2 fragCoord) {
          vec2 uv = fragCoord / iResolution.xy;
          fragColor = vec4(uv, 0.5 + 0.5 * sin(iTime), 1.0);
        }
      `}
    />
  )
}
```

Find a shader on [Shadertoy](https://www.shadertoy.com/), copy the GLSL code, paste it into `fragmentShader`. Done.

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

Buffer A-D with self-referencing feedback loops:

```tsx
<Shadertoy
  passes={{
    BufferA: {
      code: bufferACode,
      iChannel0: 'BufferA',    // self-reference (previous frame)
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

## License

MIT
