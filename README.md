# react-shadertoy

Run [Shadertoy](https://www.shadertoy.com/) GLSL shaders in React. Copy-paste and it works.

- Zero dependencies (just React)
- All Shadertoy uniforms supported (`iTime`, `iResolution`, `iMouse`, `iDate`, etc.)
- Mouse & touch interaction built-in
- TypeScript-first
- < 4KB gzipped

## Install

```bash
npm install react-shadertoy
```

## Usage

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

## Hooks API

```tsx
import { useShadertoy } from 'react-shadertoy'

function MyShader() {
  const { canvasRef, isReady, error, pause, resume } = useShadertoy({
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
| `fragmentShader` | `string` | required | Shadertoy GLSL code |
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

## License

MIT
