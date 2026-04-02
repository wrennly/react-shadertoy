import type { MouseState, RendererState, UniformLocations } from './types'

/**
 * Set all Shadertoy standard uniforms for a given set of parameters.
 * Used by both single-pass and multipass renderers.
 */
export function setUniforms(
  gl: WebGLRenderingContext,
  locations: UniformLocations,
  time: number, delta: number,
  frame: number,
  width: number, height: number,
  mouse: MouseState,
  channelRes?: Float32Array,
): void {
  if (locations.iTime) gl.uniform1f(locations.iTime, time)
  if (locations.iTimeDelta) gl.uniform1f(locations.iTimeDelta, delta)
  if (locations.iFrame) gl.uniform1i(locations.iFrame, frame)
  if (locations.iResolution) gl.uniform3f(locations.iResolution, width, height, 1.0)

  if (locations.iMouse) {
    const mz = mouse.pressed ? mouse.clickX : -Math.abs(mouse.clickX)
    const mw = mouse.pressed ? mouse.clickY : -Math.abs(mouse.clickY)
    gl.uniform4f(locations.iMouse, mouse.x, mouse.y, mz, mw)
  }

  if (locations.iChannelResolution && channelRes) {
    gl.uniform3fv(locations.iChannelResolution, channelRes)
  }

  if (locations.iDate) {
    const now = new Date()
    const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000
    gl.uniform4f(locations.iDate, now.getFullYear(), now.getMonth(), now.getDate(), seconds)
  }
}

/**
 * Update all Shadertoy standard uniforms for one frame (single-pass mode).
 * Increments time and frame on the state object.
 */
export function updateUniforms(
  state: RendererState,
  delta: number,
  speed: number,
  mouse: MouseState,
): void {
  state.time += delta * speed
  state.frame++

  // Build channel resolution array
  const res = new Float32Array(12)
  for (let i = 0; i < 4; i++) {
    const tex = state.textures[i]
    if (tex) {
      res[i * 3] = tex.width
      res[i * 3 + 1] = tex.height
      res[i * 3 + 2] = 1.0
    }
  }

  setUniforms(
    state.gl, state.locations,
    state.time, delta, state.frame,
    state.gl.drawingBufferWidth, state.gl.drawingBufferHeight,
    mouse, res,
  )
}
