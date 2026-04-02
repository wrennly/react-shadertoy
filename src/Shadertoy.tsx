import type { ShadertoyProps } from './types'
import { useShadertoy } from './useShadertoy'

export function Shadertoy({
  fragmentShader,
  textures,
  style,
  className,
  paused,
  speed,
  pixelRatio,
  mouse,
  onError,
  onLoad,
}: ShadertoyProps) {
  const { canvasRef } = useShadertoy({
    fragmentShader,
    textures,
    paused,
    speed,
    pixelRatio,
    mouse,
    onError,
    onLoad,
  })

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: '100%', display: 'block', ...style }}
    />
  )
}
