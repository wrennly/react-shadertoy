import type { TextureFilter, TextureInput, TextureOptions, TextureSource, TextureState, TextureWrap } from './types'

function isPOT(v: number): boolean {
  return (v & (v - 1)) === 0 && v > 0
}

/** Normalize shorthand TextureInput → { src, wrap, filter, vflip } */
export function normalizeTextureInput(input: TextureInput): TextureOptions {
  if (typeof input === 'object' && input !== null && 'src' in input) {
    return input
  }
  return { src: input as TextureSource }
}

/** Resolve defaults for texture options */
function resolveOptions(opts: TextureOptions): { src: TextureSource; wrap: TextureWrap; filter: TextureFilter; vflip: boolean } {
  return {
    src: opts.src,
    wrap: opts.wrap ?? 'clamp',
    filter: opts.filter ?? 'mipmap',
    vflip: opts.vflip ?? true,
  }
}

function initTexture(gl: WebGLRenderingContext, unit: number): WebGLTexture {
  const texture = gl.createTexture()!
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  // Defaults — overridden by applyTextureParameters after image load
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  return texture
}

/** Apply wrap/filter/vflip parameters. NPOT textures fall back to clamp/linear with warning. */
function applyTextureParameters(
  gl: WebGLRenderingContext,
  w: number, h: number,
  wrap: TextureWrap, filter: TextureFilter, vflip: boolean,
): void {
  const pot = isPOT(w) && isPOT(h)

  // vflip
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, vflip ? 1 : 0)

  // Wrap
  if (wrap === 'repeat' && pot) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
  } else {
    if (wrap === 'repeat' && !pot) {
      console.warn('[react-shadertoy] NPOT texture: repeat wrap requires power-of-two dimensions, falling back to clamp')
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  // Filter
  if (filter === 'mipmap' && pot) {
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  } else if (filter === 'nearest') {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  } else {
    if (filter === 'mipmap' && !pot) {
      console.warn('[react-shadertoy] NPOT texture: mipmap requires power-of-two dimensions, falling back to linear')
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  }

  // Reset flip state
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
}

function uploadElement(
  gl: WebGLRenderingContext,
  texture: WebGLTexture,
  unit: number,
  el: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
): void {
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el)
}

/**
 * Create a texture from any supported source.
 * - string (URL): returns async promise, shows magenta placeholder while loading
 * - HTMLImageElement: uploads immediately if complete, else waits for load
 * - HTMLVideoElement: uploads current frame, marks needsUpdate for per-frame re-upload
 * - HTMLCanvasElement: uploads current content, marks needsUpdate for per-frame re-upload
 */
export function createTexture(
  gl: WebGLRenderingContext,
  input: TextureInput,
  unit: number,
): { state: TextureState; promise: Promise<void> | null } {
  const opts = resolveOptions(normalizeTextureInput(input))
  const source = opts.src
  const texture = initTexture(gl, unit)

  // URL string — async load
  if (typeof source === 'string') {
    // Magenta placeholder
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([255, 0, 255, 255]),
    )

    const state: TextureState = {
      texture, width: 1, height: 1, unit,
      loaded: false, needsUpdate: false, source,
    }

    const promise = new Promise<void>((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (gl.isContextLost()) { resolve(); return }
        uploadElement(gl, texture, unit, img)
        applyTextureParameters(gl, img.width, img.height, opts.wrap, opts.filter, opts.vflip)
        state.width = img.width
        state.height = img.height
        state.loaded = true
        resolve()
      }
      img.onerror = () => reject(new Error(`Failed to load texture: ${source}`))
      img.src = source
    })

    return { state, promise }
  }

  // HTMLImageElement — sync if already loaded, async if still loading
  if (source instanceof HTMLImageElement) {
    const state: TextureState = {
      texture, width: source.naturalWidth || 1, height: source.naturalHeight || 1, unit,
      loaded: source.complete, needsUpdate: false, source,
    }

    if (source.complete && source.naturalWidth > 0) {
      uploadElement(gl, texture, unit, source)
      applyTextureParameters(gl, source.naturalWidth, source.naturalHeight, opts.wrap, opts.filter, opts.vflip)
      state.width = source.naturalWidth
      state.height = source.naturalHeight
      return { state, promise: null }
    }

    const promise = new Promise<void>((resolve, reject) => {
      source.onload = () => {
        if (gl.isContextLost()) { resolve(); return }
        uploadElement(gl, texture, unit, source)
        applyTextureParameters(gl, source.naturalWidth, source.naturalHeight, opts.wrap, opts.filter, opts.vflip)
        state.width = source.naturalWidth
        state.height = source.naturalHeight
        state.loaded = true
        resolve()
      }
      source.onerror = () => reject(new Error('Failed to load image element'))
    })

    return { state, promise }
  }

  // HTMLVideoElement — upload current frame, re-upload every frame
  if (source instanceof HTMLVideoElement) {
    const w = source.videoWidth || 1
    const h = source.videoHeight || 1
    if (source.readyState >= 2) {
      uploadElement(gl, texture, unit, source)
      applyTextureParameters(gl, w, h, opts.wrap, opts.filter === 'mipmap' ? 'linear' : opts.filter, opts.vflip)
    } else {
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 255]),
      )
    }

    const state: TextureState = {
      texture, width: w, height: h, unit,
      loaded: source.readyState >= 2, needsUpdate: true, source,
    }
    return { state, promise: null }
  }

  // HTMLCanvasElement — upload current content, re-upload every frame
  uploadElement(gl, texture, unit, source)
  applyTextureParameters(gl, source.width, source.height, opts.wrap, opts.filter === 'mipmap' ? 'linear' : opts.filter, opts.vflip)
  const state: TextureState = {
    texture, width: source.width, height: source.height, unit,
    loaded: true, needsUpdate: true, source,
  }
  return { state, promise: null }
}

/**
 * Re-upload dynamic textures (video/canvas) each frame.
 */
export function updateDynamicTextures(
  gl: WebGLRenderingContext,
  textures: (TextureState | null)[],
): void {
  for (const tex of textures) {
    if (!tex || !tex.needsUpdate || !tex.source) continue

    if (tex.source instanceof HTMLVideoElement) {
      const v = tex.source
      if (v.readyState < 2) continue
      uploadElement(gl, tex.texture, tex.unit, v)
      tex.width = v.videoWidth
      tex.height = v.videoHeight
      tex.loaded = true
    } else if (tex.source instanceof HTMLCanvasElement) {
      uploadElement(gl, tex.texture, tex.unit, tex.source)
      tex.width = tex.source.width
      tex.height = tex.source.height
    }
  }
}

/**
 * Bind all active textures and set sampler uniforms.
 */
export function bindTextures(
  gl: WebGLRenderingContext,
  locations: (WebGLUniformLocation | null)[],
  textures: (TextureState | null)[],
): void {
  for (let i = 0; i < 4; i++) {
    const tex = textures[i]
    if (!tex) continue
    gl.activeTexture(gl.TEXTURE0 + tex.unit)
    gl.bindTexture(gl.TEXTURE_2D, tex.texture)
    if (locations[i]) {
      gl.uniform1i(locations[i], tex.unit)
    }
  }
}

/**
 * Delete all WebGL textures.
 */
export function disposeTextures(
  gl: WebGLRenderingContext,
  textures: (TextureState | null)[],
): void {
  for (const tex of textures) {
    if (tex) gl.deleteTexture(tex.texture)
  }
}
