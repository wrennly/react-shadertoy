import type { CSSProperties, RefObject } from 'react'

/** Texture source: URL string, or an HTML element for dynamic textures */
export type TextureSource =
  | string
  | HTMLImageElement
  | HTMLVideoElement
  | HTMLCanvasElement

export type TextureWrap = 'clamp' | 'repeat' | 'mirror'
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

// ── Multipass types ──

export type PassName = 'BufferA' | 'BufferB' | 'BufferC' | 'BufferD' | 'Image'

/** A channel input for a multipass pass: external texture or another pass name */
export type PassInput = TextureInput | PassName

/** Configuration for a single render pass */
export interface PassConfig {
  code: string
  iChannel0?: PassInput
  iChannel1?: PassInput
  iChannel2?: PassInput
  iChannel3?: PassInput
}

/** Multipass configuration: Buffer A-D + Image */
export type MultipassConfig = {
  [K in PassName]?: PassConfig
}

/** Internal state for a single render pass */
export interface PassState {
  name: PassName
  program: WebGLProgram
  locations: UniformLocations
  fbo: WebGLFramebuffer | null       // null for Image (renders to screen)
  pingPong: [WebGLTexture, WebGLTexture] | null  // null for Image
  currentIdx: number                  // which ping-pong texture is current output
  width: number
  height: number
  channelBindings: (TextureState | { passRef: PassName } | null)[]  // resolved per-channel
  bufferFormat: { internalFormat: number; type: number } | null
  channelResBuffer: Float32Array
}

// ── Shadertoy API response types ──

export interface ShadertoyApiSampler {
  filter: string
  wrap: string
  vflip: string
  srgb: string
  internal: string
}

export interface ShadertoyApiInput {
  id: number
  src: string
  ctype: string
  channel: number
  sampler: ShadertoyApiSampler
  published: number
}

export interface ShadertoyApiOutput {
  id: number
  channel: number
}

export interface ShadertoyApiRenderPass {
  inputs: ShadertoyApiInput[]
  outputs: ShadertoyApiOutput[]
  code: string
  name: string
  description: string
  type: string
}

export interface ShadertoyApiInfo {
  id: string
  date: string
  viewed: number
  name: string
  username: string
  description: string
  likes: number
  published: number
  flags: number
  tags: string[]
  hasliked: number
}

export interface ShadertoyApiShader {
  ver: string
  info: ShadertoyApiInfo
  renderpass: ShadertoyApiRenderPass[]
}

export interface ShadertoyApiResponse {
  Shader: ShadertoyApiShader
  Error?: string
}

export interface ShaderMeta {
  name: string
  author: string
  description: string
  tags: string[]
  license?: string
}

// ── Custom uniforms ──

/** Supported custom uniform value types */
export type CustomUniformValue =
  | number                                // → uniform float
  | [number, number]                      // → uniform vec2
  | [number, number, number]              // → uniform vec3
  | [number, number, number, number]      // → uniform vec4
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | Float32Array<any>                     // → uniform float[N]

/** Map of custom uniform names to values */
export type CustomUniforms = Record<string, CustomUniformValue>

/** Context passed to onFrame callback */
export interface FrameContext {
  time: number
  frame: number
  delta: number
  /** Mutable — modify values to update uniforms this frame */
  uniforms: CustomUniforms
  resolution: [number, number]
  mouse: MouseState
}

export interface ShadertoyProps {
  /** Shadertoy-compatible GLSL fragment shader (must contain mainImage) */
  fragmentShader?: string
  /** Multipass configuration (Buffer A-D + Image) */
  passes?: MultipassConfig
  /** Texture inputs for iChannel0-3 (single-pass mode) */
  textures?: TextureInputs
  /** Shadertoy shader ID — fetches shader from API */
  id?: string
  /** Shadertoy API key (required when using id) */
  apiKey?: string
  /** Show license/author overlay (default: true when using id) */
  showLicense?: boolean
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
  /** Custom uniforms (auto-declared in GLSL preamble) */
  uniforms?: CustomUniforms
  /** Per-frame callback — mutate ctx.uniforms to update values */
  onFrame?: (ctx: FrameContext) => void
}

export interface UseShadertoyOptions {
  fragmentShader?: string
  passes?: MultipassConfig
  textures?: TextureInputs
  id?: string
  apiKey?: string
  paused?: boolean
  speed?: number
  pixelRatio?: number
  mouse?: boolean
  onError?: (error: string) => void
  onLoad?: () => void
  uniforms?: CustomUniforms
  onFrame?: (ctx: FrameContext) => void
}

export interface UseShadertoyReturn {
  canvasRef: RefObject<HTMLCanvasElement | null>
  isReady: boolean
  error: string | null
  pause: () => void
  resume: () => void
  meta: ShaderMeta | null
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
  iChannelTime: WebGLUniformLocation | null
  iSampleRate: WebGLUniformLocation | null
}

export interface RendererState {
  gl: WebGL2RenderingContext
  program: WebGLProgram
  locations: UniformLocations
  textures: (TextureState | null)[]
  time: number
  frame: number
  lastTime: number
  channelResBuffer: Float32Array
  customUniformCache: Map<string, WebGLUniformLocation | null>
}
