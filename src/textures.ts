import type { KeyboardState, TextureFilter, TextureInput, TextureOptions, TextureSource, TextureState, TextureWrap } from './types'

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

function initTexture(gl: WebGL2RenderingContext, unit: number): WebGLTexture {
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

/** Apply wrap/filter/vflip parameters. WebGL2 supports NPOT textures fully. */
function applyTextureParameters(
  gl: WebGL2RenderingContext,
  w: number, h: number,
  wrap: TextureWrap, filter: TextureFilter, vflip: boolean,
): void {
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, vflip ? 1 : 0)

  // Wrap
  const wrapMode = wrap === 'repeat' ? gl.REPEAT : wrap === 'mirror' ? gl.MIRRORED_REPEAT : gl.CLAMP_TO_EDGE
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode)

  // Filter
  if (filter === 'mipmap') {
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  } else if (filter === 'nearest') {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  }

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
}

function uploadElement(
  gl: WebGL2RenderingContext,
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
  gl: WebGL2RenderingContext,
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
  gl: WebGL2RenderingContext,
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
  gl: WebGL2RenderingContext,
  locations: (WebGLUniformLocation | null)[],
  textures: (TextureState | null)[],
): void {
  for (let i = 0; i < 4; i++) {
    const tex = textures[i]
    if (!tex) continue
    gl.activeTexture(gl.TEXTURE0 + tex.unit)
    const target = tex.isCube ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D
    gl.bindTexture(target, tex.texture)
    if (locations[i]) {
      gl.uniform1i(locations[i], tex.unit)
    }
  }
}

/**
 * Delete all WebGL textures.
 */
export function disposeTextures(
  gl: WebGL2RenderingContext,
  textures: (TextureState | null)[],
): void {
  for (const tex of textures) {
    if (tex) gl.deleteTexture(tex.texture)
  }
}

// ── Keyboard texture ──

/**
 * Create a 256×3 R8 texture for Shadertoy keyboard input.
 * Row 0: keyDown, Row 1: keyPressed (single frame), Row 2: toggle.
 */
export function createKeyboardTexture(
  gl: WebGL2RenderingContext,
  unit: number,
): TextureState {
  const texture = gl.createTexture()!
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 3, 0, gl.RED, gl.UNSIGNED_BYTE, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  return { texture, width: 256, height: 3, unit, loaded: true, needsUpdate: true, source: null }
}

/**
 * Upload keyboard state to texture. Skips upload if no keys changed.
 */
export function updateKeyboardTexture(
  gl: WebGL2RenderingContext,
  tex: TextureState,
  keyboard: KeyboardState,
): void {
  if (!keyboard.dirty) return
  gl.activeTexture(gl.TEXTURE0 + tex.unit)
  gl.bindTexture(gl.TEXTURE_2D, tex.texture)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 3, gl.RED, gl.UNSIGNED_BYTE, keyboard.data)
  keyboard.dirty = false
}

// ── Cubemap texture ──

const CUBE_FACES = [
  0x8515, // TEXTURE_CUBE_MAP_POSITIVE_X
  0x8516, // TEXTURE_CUBE_MAP_NEGATIVE_X
  0x8517, // TEXTURE_CUBE_MAP_POSITIVE_Y
  0x8518, // TEXTURE_CUBE_MAP_NEGATIVE_Y
  0x8519, // TEXTURE_CUBE_MAP_POSITIVE_Z
  0x851A, // TEXTURE_CUBE_MAP_NEGATIVE_Z
]

/**
 * Create a cubemap texture from 6 face URLs.
 */
export function createCubemapTexture(
  gl: WebGL2RenderingContext,
  faces: string[],
  unit: number,
): { state: TextureState; promise: Promise<void> } {
  const texture = gl.createTexture()!
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture)

  // Magenta placeholder for all 6 faces
  for (const target of CUBE_FACES) {
    gl.texImage2D(target, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([255, 0, 255, 255]))
  }

  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  const state: TextureState = {
    texture, width: 1, height: 1, unit,
    loaded: false, needsUpdate: false, source: null,
    isCube: true,
  }

  const promise = Promise.all(
    faces.map((url, i) => new Promise<void>((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (gl.isContextLost()) { resolve(); return }
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture)
        gl.texImage2D(CUBE_FACES[i], 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
        if (i === 0) { state.width = img.width; state.height = img.height }
        resolve()
      }
      img.onerror = () => reject(new Error(`Failed to load cubemap face: ${url}`))
      img.src = url
    }))
  ).then(() => {
    if (gl.isContextLost()) return
    state.loaded = true
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture)
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP)
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  })

  return { state, promise }
}
