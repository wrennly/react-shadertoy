import type { ChannelType, CustomUniformValue, CustomUniforms, RendererState, UniformLocations } from './types'

// Full-screen quad: two triangles covering clip space
const QUAD_VERTICES = new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
  -1,  1,
   1, -1,
   1,  1,
])

export const VERTEX_SHADER = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

/** Build GLSL preamble with per-channel sampler type (sampler2D or samplerCube) */
export function buildPreamble(channelTypes?: ChannelType[]): string {
  const types = channelTypes ?? ['2d', '2d', '2d', '2d']
  const samplerDecls = types.map((t, i) =>
    `uniform ${t === 'cube' ? 'samplerCube' : 'sampler2D'} iChannel${i};`
  ).join('\n')

  return `#version 300 es
precision highp float;

out vec4 _fragColor;

uniform vec3  iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int   iFrame;
uniform vec4  iMouse;
uniform vec4  iDate;
${samplerDecls}
uniform vec3  iChannelResolution[4];
uniform float iChannelTime[4];
uniform float iSampleRate;

// Shadertoy compat: older shaders may use texture2D() etc.
#define texture2D texture
#define texture2DLod textureLod
#define texture2DLodEXT textureLod
#define texture2DGrad textureGrad
#define texture2DGradEXT textureGrad
#define textureCube texture

// Shadertoy built-in defines
#define HW_PERFORMANCE 1

`
}

/** Default preamble with all sampler2D channels */
export const FRAGMENT_PREAMBLE = buildPreamble()

/** Build uniform declarations for custom uniforms */
export function buildCustomDeclarations(uniforms?: CustomUniforms): string {
  if (!uniforms) return ''
  let decls = ''
  for (const [name, value] of Object.entries(uniforms)) {
    if (value instanceof Float32Array) {
      decls += `uniform float ${name}[${value.length}];\n`
    } else if (typeof value === 'number') {
      decls += `uniform float ${name};\n`
    } else if (Array.isArray(value)) {
      const t = value.length === 2 ? 'vec2' : value.length === 3 ? 'vec3' : 'vec4'
      decls += `uniform ${t} ${name};\n`
    }
  }
  return decls
}

/**
 * Wrap Shadertoy GLSL: prepend uniform declarations + main() bridge.
 */
export function wrapFragmentShader(shader: string, customUniforms?: CustomUniforms, channelTypes?: ChannelType[]): string {
  const preamble = channelTypes ? buildPreamble(channelTypes) : FRAGMENT_PREAMBLE
  return preamble + buildCustomDeclarations(customUniforms) + shader + `

void main() {
  mainImage(_fragColor, gl_FragCoord.xy);
  _fragColor.a = 1.0;
}
`
}

export function compileShader(
  gl: WebGL2RenderingContext,
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
 * Compile + link a shader program. Returns program or error string.
 */
export function createProgram(
  gl: WebGL2RenderingContext,
  fragmentShader: string,
  customUniforms?: CustomUniforms,
  channelTypes?: ChannelType[],
): WebGLProgram | string {
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  if (typeof vert === 'string') return vert

  const frag = compileShader(gl, gl.FRAGMENT_SHADER, wrapFragmentShader(fragmentShader, customUniforms, channelTypes))
  if (typeof frag === 'string') return frag

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

  gl.deleteShader(vert)
  gl.deleteShader(frag)
  return program
}

/**
 * Get all standard Shadertoy uniform locations from a program.
 */
export function getUniformLocations(gl: WebGL2RenderingContext, program: WebGLProgram): UniformLocations {
  return {
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
    iChannelTime: gl.getUniformLocation(program, 'iChannelTime'),
    iSampleRate: gl.getUniformLocation(program, 'iSampleRate'),
  }
}

/**
 * Setup the shared full-screen quad buffer.
 */
export function setupQuad(gl: WebGL2RenderingContext, program: WebGLProgram): void {
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW)
  const positionLoc = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(positionLoc)
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)
}

/**
 * Initialize WebGL: compile shaders, link program, setup quad.
 * Returns RendererState on success or error string on failure.
 */
export function createRenderer(
  canvas: HTMLCanvasElement,
  fragmentShader: string,
  customUniforms?: CustomUniforms,
): RendererState | string {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: true,
    premultipliedAlpha: false,
  })
  if (!gl) return 'WebGL2 not supported'

  const program = createProgram(gl, fragmentShader, customUniforms)
  if (typeof program === 'string') return program

  setupQuad(gl, program)
  const locations = getUniformLocations(gl, program)
  gl.useProgram(program)

  return {
    gl,
    program,
    locations,
    textures: [null, null, null, null],
    time: 0,
    frame: 0,
    lastTime: 0,
    channelResBuffer: new Float32Array(12),
    customUniformCache: new Map(),
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
