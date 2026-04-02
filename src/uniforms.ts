import type { MouseState, RendererState } from './types'

/**
 * Update all Shadertoy standard uniforms for one frame.
 */
export function updateUniforms(
  state: RendererState,
  delta: number,
  speed: number,
  mouse: MouseState,
): void {
  const { gl, locations } = state

  // iTime
  state.time += delta * speed
  if (locations.iTime) {
    gl.uniform1f(locations.iTime, state.time)
  }

  // iTimeDelta
  if (locations.iTimeDelta) {
    gl.uniform1f(locations.iTimeDelta, delta)
  }

  // iFrame
  state.frame++
  if (locations.iFrame) {
    gl.uniform1i(locations.iFrame, state.frame)
  }

  // iResolution
  if (locations.iResolution) {
    gl.uniform3f(
      locations.iResolution,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      1.0,
    )
  }

  // iMouse — Shadertoy convention:
  //   xy: current position (if pressed)
  //   zw: click position (positive when pressed, negative when released)
  if (locations.iMouse) {
    const mz = mouse.pressed ? mouse.clickX : -Math.abs(mouse.clickX)
    const mw = mouse.pressed ? mouse.clickY : -Math.abs(mouse.clickY)
    gl.uniform4f(locations.iMouse, mouse.x, mouse.y, mz, mw)
  }

  // iChannelResolution — vec3[4] (width, height, 1.0) for each texture channel
  if (locations.iChannelResolution) {
    const res = new Float32Array(12) // 4 channels × 3 floats
    for (let i = 0; i < 4; i++) {
      const tex = state.textures[i]
      if (tex) {
        res[i * 3] = tex.width
        res[i * 3 + 1] = tex.height
        res[i * 3 + 2] = 1.0
      }
    }
    gl.uniform3fv(locations.iChannelResolution, res)
  }

  // iDate — vec4(year, month, day, seconds_since_midnight)
  if (locations.iDate) {
    const now = new Date()
    const seconds =
      now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000
    gl.uniform4f(
      locations.iDate,
      now.getFullYear(),
      now.getMonth(), // 0-based, matches Shadertoy
      now.getDate(),
      seconds,
    )
  }
}
