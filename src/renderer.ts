import type { RendererState, UniformLocations } from './types'

// Full-screen quad: two triangles covering clip space
const QUAD_VERTICES = new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
  -1,  1,
   1, -1,
   1,  1,
])

const VERTEX_SHADER = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

/**
 * Wrap Shadertoy GLSL: prepend uniform declarations + main() bridge.
 */
function wrapFragmentShader(shader: string): string {
  return `precision highp float;

uniform vec3  iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int   iFrame;
uniform vec4  iMouse;
uniform vec4  iDate;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
uniform vec3  iChannelResolution[4];

// Shadertoy compatibility: texture() is GLSL 300 es, WebGL1 uses texture2D()
#define texture texture2D

${shader}

void main() {
  mainImage(gl_FragColor, gl_FragCoord.xy);
}
`
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | string {
  const shader = gl.createShader(type)
  if (!shader) return 'Failed to create shader'

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || 'Unknown compile error'
    gl.deleteShader(shader)
    return log
  }

  return shader
}

/**
 * Initialize WebGL: compile shaders, link program, setup quad.
 * Returns RendererState on success or error string on failure.
 */
export function createRenderer(
  canvas: HTMLCanvasElement,
  fragmentShader: string,
): RendererState | string {
  const gl = canvas.getContext('webgl', {
    antialias: false,
    alpha: true,
    premultipliedAlpha: false,
  })
  if (!gl) return 'WebGL not supported'

  // Compile vertex shader
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  if (typeof vert === 'string') return vert

  // Compile fragment shader (wrapped)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, wrapFragmentShader(fragmentShader))
  if (typeof frag === 'string') return frag

  // Link program
  const program = gl.createProgram()
  if (!program) return 'Failed to create program'

  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || 'Unknown link error'
    gl.deleteProgram(program)
    return log
  }

  // Clean up individual shaders (attached to program)
  gl.deleteShader(vert)
  gl.deleteShader(frag)

  // Setup quad geometry
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW)

  const positionLoc = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(positionLoc)
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)

  // Get uniform locations
  const locations: UniformLocations = {
    iResolution: gl.getUniformLocation(program, 'iResolution'),
    iTime: gl.getUniformLocation(program, 'iTime'),
    iTimeDelta: gl.getUniformLocation(program, 'iTimeDelta'),
    iFrame: gl.getUniformLocation(program, 'iFrame'),
    iMouse: gl.getUniformLocation(program, 'iMouse'),
    iDate: gl.getUniformLocation(program, 'iDate'),
    iChannel: [
      gl.getUniformLocation(program, 'iChannel0'),
      gl.getUniformLocation(program, 'iChannel1'),
      gl.getUniformLocation(program, 'iChannel2'),
      gl.getUniformLocation(program, 'iChannel3'),
    ],
    iChannelResolution: gl.getUniformLocation(program, 'iChannelResolution'),
  }

  gl.useProgram(program)

  return {
    gl,
    program,
    locations,
    textures: [null, null, null, null],
    time: 0,
    frame: 0,
    lastTime: 0,
  }
}

/**
 * Render one frame.
 */
export function render(state: RendererState): void {
  const { gl } = state
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.drawArrays(gl.TRIANGLES, 0, 6)
}

/**
 * Clean up WebGL resources.
 */
export function dispose(state: RendererState): void {
  const { gl, program } = state
  gl.deleteProgram(program)
  gl.getExtension('WEBGL_lose_context')?.loseContext()
}
