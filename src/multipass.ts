import { createProgram, getUniformLocations, setupQuad } from './renderer'
import { bindTextures } from './textures'
import { setUniforms } from './uniforms'
import type { MouseState, MultipassConfig, PassConfig, PassInput, PassName, PassState, TextureState } from './types'

const PASS_ORDER: PassName[] = ['BufferA', 'BufferB', 'BufferC', 'BufferD', 'Image']
const BUFFER_NAMES: PassName[] = ['BufferA', 'BufferB', 'BufferC', 'BufferD']
const CHANNEL_KEYS = ['iChannel0', 'iChannel1', 'iChannel2', 'iChannel3'] as const

function isPassName(v: PassInput): v is PassName {
  return typeof v === 'string' && PASS_ORDER.includes(v as PassName)
}

function createPingPongTextures(
  gl: WebGL2RenderingContext,
  w: number, h: number,
): [WebGLTexture, WebGLTexture] {
  const textures: WebGLTexture[] = []
  for (let i = 0; i < 2; i++) {
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    textures.push(tex)
  }
  return textures as [WebGLTexture, WebGLTexture]
}

function createFBO(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
): WebGLFramebuffer {
  const fbo = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return fbo
}

/**
 * Initialize multipass renderer. Compiles all pass programs, creates FBOs.
 */
export function createMultipassRenderer(
  gl: WebGL2RenderingContext,
  config: MultipassConfig,
  externalTextures: (TextureState | null)[],
): PassState[] | string {
  const w = gl.drawingBufferWidth || 1
  const h = gl.drawingBufferHeight || 1
  const passes: PassState[] = []

  for (const name of PASS_ORDER) {
    const passConfig = config[name]
    if (!passConfig) continue

    const program = createProgram(gl, passConfig.code)
    if (typeof program === 'string') return `${name}: ${program}`

    setupQuad(gl, program)
    const locations = getUniformLocations(gl, program)

    const isImage = name === 'Image'
    const pingPong = isImage ? null : createPingPongTextures(gl, w, h)
    const fbo = isImage ? null : createFBO(gl, pingPong![0])

    // Resolve channel bindings
    const channelBindings: PassState['channelBindings'] = [null, null, null, null]
    for (let i = 0; i < 4; i++) {
      const input = passConfig[CHANNEL_KEYS[i]]
      if (input == null) continue

      if (isPassName(input)) {
        channelBindings[i] = { passRef: input }
      } else {
        // External texture — find from externalTextures by unit or create placeholder
        channelBindings[i] = externalTextures[i]
      }
    }

    passes.push({
      name, program, locations,
      fbo, pingPong, currentIdx: 0,
      width: w, height: h,
      channelBindings,
    })
  }

  if (passes.length === 0) return 'No passes defined'
  return passes
}

/**
 * Render one multipass frame. Executes passes in order: BufferA → BufferD → Image.
 */
export function renderMultipass(
  gl: WebGL2RenderingContext,
  passes: PassState[],
  delta: number, speed: number, mouse: MouseState,
  sharedState: { time: number; frame: number },
): void {
  sharedState.time += delta * speed
  sharedState.frame++

  // Build a map of pass name → current readable texture
  const passTextures: Partial<Record<PassName, WebGLTexture>> = {}

  for (const pass of passes) {
    const isImage = pass.name === 'Image'

    // Swap ping-pong: write to current, read from previous
    if (pass.pingPong) {
      const writeIdx = pass.currentIdx
      const readIdx = 1 - writeIdx

      // Attach write texture to FBO
      gl.bindFramebuffer(gl.FRAMEBUFFER, pass.fbo)
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,
        pass.pingPong[writeIdx], 0,
      )

      // The readable texture is the previous frame's output
      passTextures[pass.name] = pass.pingPong[readIdx]
    }

    // Bind FBO (null = screen for Image)
    gl.bindFramebuffer(gl.FRAMEBUFFER, isImage ? null : pass.fbo)
    gl.viewport(0, 0, isImage ? gl.drawingBufferWidth : pass.width, isImage ? gl.drawingBufferHeight : pass.height)

    gl.useProgram(pass.program)

    // Bind channel textures
    const tempTextures: (TextureState | null)[] = [null, null, null, null]
    for (let i = 0; i < 4; i++) {
      const binding = pass.channelBindings[i]
      if (!binding) continue

      if ('passRef' in binding) {
        // Reference to another pass's output
        const refTex = passTextures[binding.passRef]
        if (refTex) {
          gl.activeTexture(gl.TEXTURE0 + i)
          gl.bindTexture(gl.TEXTURE_2D, refTex)
          if (pass.locations.iChannel[i]) {
            gl.uniform1i(pass.locations.iChannel[i], i)
          }
        }
      } else {
        // External texture
        tempTextures[i] = binding
      }
    }

    // Bind external textures
    bindTextures(gl, pass.locations.iChannel, tempTextures)

    // Build iChannelResolution
    const channelRes = new Float32Array(12)
    for (let i = 0; i < 4; i++) {
      const binding = pass.channelBindings[i]
      if (!binding) continue
      if ('passRef' in binding) {
        const refPass = passes.find(p => p.name === binding.passRef)
        if (refPass) { channelRes[i * 3] = refPass.width; channelRes[i * 3 + 1] = refPass.height; channelRes[i * 3 + 2] = 1.0 }
      } else {
        channelRes[i * 3] = binding.width; channelRes[i * 3 + 1] = binding.height; channelRes[i * 3 + 2] = 1.0
      }
    }

    const vw = isImage ? gl.drawingBufferWidth : pass.width
    const vh = isImage ? gl.drawingBufferHeight : pass.height
    setUniforms(gl, pass.locations, sharedState.time, delta, sharedState.frame, vw, vh, mouse, channelRes)

    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // Swap ping-pong index for next frame
    if (pass.pingPong) {
      pass.currentIdx = 1 - pass.currentIdx
    }
  }

  // Unbind FBO
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
}

/**
 * Resize all buffer FBOs.
 */
export function resizeFBOs(
  gl: WebGL2RenderingContext,
  passes: PassState[],
  w: number, h: number,
): void {
  for (const pass of passes) {
    if (!pass.pingPong) continue
    pass.width = w
    pass.height = h

    for (let i = 0; i < 2; i++) {
      gl.bindTexture(gl.TEXTURE_2D, pass.pingPong[i])
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    }
  }
}

/**
 * Clean up all multipass resources.
 */
export function disposeMultipass(
  gl: WebGL2RenderingContext,
  passes: PassState[],
): void {
  for (const pass of passes) {
    gl.deleteProgram(pass.program)
    if (pass.fbo) gl.deleteFramebuffer(pass.fbo)
    if (pass.pingPong) {
      gl.deleteTexture(pass.pingPong[0])
      gl.deleteTexture(pass.pingPong[1])
    }
  }
}
