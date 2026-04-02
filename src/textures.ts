import type { TextureState } from './types'

/**
 * Load an image URL into a WebGL texture.
 * Creates a 1x1 placeholder immediately so the shader can render while loading.
 */
export function loadImageTexture(
  gl: WebGLRenderingContext,
  url: string,
  unit: number,
): { state: TextureState; promise: Promise<void> } {
  const texture = gl.createTexture()!
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, texture)

  // 1x1 placeholder (magenta — visible indicator that texture is loading)
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array([255, 0, 255, 255]),
  )

  // Default parameters (safe for NPOT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

  const state: TextureState = { texture, width: 1, height: 1, unit, loaded: false }

  const promise = new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      // Guard: GL context may be lost if component unmounted during load
      if (gl.isContextLost()) { resolve(); return }

      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)

      // Generate mipmaps for POT textures
      if (isPOT(img.width) && isPOT(img.height)) {
        gl.generateMipmap(gl.TEXTURE_2D)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      }

      state.width = img.width
      state.height = img.height
      state.loaded = true
      resolve()
    }
    img.onerror = () => reject(new Error(`Failed to load texture: ${url}`))
    img.src = url
  })

  return { state, promise }
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

function isPOT(v: number): boolean {
  return (v & (v - 1)) === 0 && v > 0
}
