import type { ShadertoyProps } from './types'
import { useShadertoy } from './useShadertoy'

export function Shadertoy({
  fragmentShader,
  passes,
  textures,
  id,
  apiKey,
  showLicense,
  style,
  className,
  paused,
  speed,
  pixelRatio,
  mouse,
  keyboard,
  audio,
  onError,
  onLoad,
  uniforms,
  onFrame,
}: ShadertoyProps) {
  const { canvasRef, meta } = useShadertoy({
    fragmentShader,
    passes,
    textures,
    id,
    apiKey,
    paused,
    speed,
    pixelRatio,
    mouse,
    keyboard,
    audio,
    onError,
    onLoad,
    uniforms,
    onFrame,
  })

  const shouldShowLicense = showLicense ?? !!id
  const hasMeta = shouldShowLicense && meta

  if (hasMeta) {
    return (
      <div style={{ position: 'relative', ...style }} className={className}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
        <div style={{
          position: 'absolute', bottom: 8, right: 8,
          background: 'rgba(0,0,0,0.6)', color: '#fff',
          padding: '4px 10px', borderRadius: 4,
          fontSize: 12, fontFamily: 'system-ui, sans-serif',
          pointerEvents: 'none',
        }}>
          <strong>{meta.name}</strong> by {meta.author}
        </div>
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: '100%', display: 'block', ...style }}
    />
  )
}
