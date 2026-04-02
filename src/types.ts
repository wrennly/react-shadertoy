import type { CSSProperties, RefObject } from 'react'

export interface ShadertoyProps {
  /** Shadertoy-compatible GLSL fragment shader (must contain mainImage) */
  fragmentShader: string
  /** Container style */
  style?: CSSProperties
  /** Container className */
  className?: string
  /** Pause rendering (default: false) */
  paused?: boolean
  /** iTime speed multiplier (default: 1.0) */
  speed?: number
  /** Device pixel ratio (default: window.devicePixelRatio) */
  pixelRatio?: number
  /** Enable mouse/touch tracking (default: true) */
  mouse?: boolean
  /** Called when GLSL compilation fails */
  onError?: (error: string) => void
  /** Called when WebGL is ready */
  onLoad?: () => void
}

export interface UseShadertoyOptions {
  fragmentShader: string
  paused?: boolean
  speed?: number
  pixelRatio?: number
  mouse?: boolean
  onError?: (error: string) => void
  onLoad?: () => void
}

export interface UseShadertoyReturn {
  canvasRef: RefObject<HTMLCanvasElement | null>
  isReady: boolean
  error: string | null
  pause: () => void
  resume: () => void
}

export interface MouseState {
  x: number
  y: number
  clickX: number
  clickY: number
  pressed: boolean
}

export interface UniformLocations {
  iResolution: WebGLUniformLocation | null
  iTime: WebGLUniformLocation | null
  iTimeDelta: WebGLUniformLocation | null
  iFrame: WebGLUniformLocation | null
  iMouse: WebGLUniformLocation | null
  iDate: WebGLUniformLocation | null
}

export interface RendererState {
  gl: WebGLRenderingContext
  program: WebGLProgram
  locations: UniformLocations
  time: number
  frame: number
  lastTime: number
}
