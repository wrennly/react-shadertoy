import type { CSSProperties, RefObject } from 'react'

/** Texture source: URL string, or an HTML element for dynamic textures */
export type TextureSource =
  | string
  | HTMLImageElement
  | HTMLVideoElement
  | HTMLCanvasElement

export type TextureWrap = 'clamp' | 'repeat'
export type TextureFilter = 'nearest' | 'linear' | 'mipmap'

/** Advanced texture options with wrap/filter/vflip control */
export interface TextureOptions {
  src: TextureSource
  wrap?: TextureWrap
  filter?: TextureFilter
  vflip?: boolean
}

/** A texture input: shorthand source or full options object */
export type TextureInput = TextureSource | TextureOptions

/** Texture inputs mapped to Shadertoy channels */
export type TextureInputs = {
  iChannel0?: TextureInput
  iChannel1?: TextureInput
  iChannel2?: TextureInput
  iChannel3?: TextureInput
}

/** Internal texture state per channel */
export interface TextureState {
  texture: WebGLTexture
  width: number
  height: number
  unit: number
  loaded: boolean
  /** True for video/canvas sources that need per-frame re-upload */
  needsUpdate: boolean
  /** Original source reference (for dynamic re-upload) */
  source: TextureSource | null
}

export interface ShadertoyProps {
  /** Shadertoy-compatible GLSL fragment shader (must contain mainImage) */
  fragmentShader: string
  /** Texture inputs for iChannel0-3 */
  textures?: TextureInputs
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
  textures?: TextureInputs
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
  iChannel: (WebGLUniformLocation | null)[]
  iChannelResolution: WebGLUniformLocation | null
}

export interface RendererState {
  gl: WebGLRenderingContext
  program: WebGLProgram
  locations: UniformLocations
  textures: (TextureState | null)[]
  time: number
  frame: number
  lastTime: number
}
