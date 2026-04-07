import type { CustomUniforms, MouseState, RendererState, UniformLocations } from './types'

/**
 * Set all Shadertoy standard uniforms for a given set of parameters.
 * Used by both single-pass and multipass renderers.
 */
export function setUniforms(
  gl: WebGL2RenderingContext,
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
    gl.uniform4f(locations.iDate, now.getFullYear(), now.getMonth() + 1, now.getDate(), seconds)
  }

  if (locations.iChannelTime) {
    gl.uniform1fv(locations.iChannelTime, [time, time, time, time])
  }
  if (locations.iSampleRate) {
    gl.uniform1f(locations.iSampleRate, 44100.0)
  }
}

/**
 * Set custom uniforms on a program. Caches uniform locations to avoid per-frame lookups.
 */
export function setCustomUniforms(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  uniforms: CustomUniforms,
  locationCache?: Map<string, WebGLUniformLocation | null>,
): void {
  for (const [name, value] of Object.entries(uniforms)) {
    let loc: WebGLUniformLocation | null
    if (locationCache) {
      if (locationCache.has(name)) {
        loc = locationCache.get(name)!
      } else {
        loc = gl.getUniformLocation(program, name)
        locationCache.set(name, loc)
      }
    } else {
      loc = gl.getUniformLocation(program, name)
    }
    if (!loc) continue
    if (value instanceof Float32Array) {
      gl.uniform1fv(loc, value)
    } else if (typeof value === 'number') {
      gl.uniform1f(loc, value)
    } else if (Array.isArray(value)) {
      switch (value.length) {
        case 2: gl.uniform2f(loc, value[0], value[1]); break
        case 3: gl.uniform3f(loc, value[0], value[1], value[2]); break
        case 4: gl.uniform4f(loc, value[0], value[1], value[2], value[3]); break
      }
    }
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

  // Build channel resolution array (reuse buffer)
  const res = state.channelResBuffer
  res.fill(0)
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
