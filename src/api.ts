import type {
  MultipassConfig,
  PassConfig,
  PassName,
  ShaderMeta,
  ShadertoyApiResponse,
  ShadertoyApiRenderPass,
  ShadertoyApiShader,
  TextureInputs,
  TextureOptions,
  TextureWrap,
  TextureFilter,
} from './types'

const SHADERTOY_BASE = 'https://www.shadertoy.com'
const API_URL = `${SHADERTOY_BASE}/api/v1/shaders`

// Buffer output ID → PassName mapping
const OUTPUT_ID_TO_PASS: Record<number, PassName> = {
  257: 'BufferA',
  258: 'BufferB',
  259: 'BufferC',
  260: 'BufferD',
}

// In-memory cache
const cache = new Map<string, ShadertoyApiShader>()

/**
 * Fetch a shader from the Shadertoy API.
 */
export async function fetchShader(id: string, apiKey: string): Promise<ShadertoyApiShader> {
  const cached = cache.get(id)
  if (cached) return cached

  const res = await fetch(`${API_URL}/${id}?key=${apiKey}`)
  if (!res.ok) throw new Error(`Shadertoy API error: ${res.status}`)

  const data: ShadertoyApiResponse = await res.json()
  if (data.Error) throw new Error(`Shadertoy API: ${data.Error}`)

  cache.set(id, data.Shader)
  return data.Shader
}

function mapWrap(wrap: string): TextureWrap {
  if (wrap === 'repeat') return 'repeat'
  return 'clamp'
}

function mapFilter(filter: string): TextureFilter {
  if (filter === 'nearest') return 'nearest'
  if (filter === 'linear') return 'linear'
  return 'mipmap'
}

function resolveTextureSrc(src: string): string {
  if (src.startsWith('http')) return src
  return SHADERTOY_BASE + src
}

/**
 * Convert a Shadertoy API shader to our MultipassConfig + TextureInputs + meta.
 */
export function apiToConfig(shader: ShadertoyApiShader): {
  passes: MultipassConfig
  textures: TextureInputs
  meta: ShaderMeta
} {
  const passes: MultipassConfig = {}
  const textures: TextureInputs = {}

  // Find common code (prepended to all passes)
  const commonPass = shader.renderpass.find(p => p.type === 'common')
  const commonCode = commonPass ? commonPass.code + '\n' : ''

  // Process each render pass
  for (const rp of shader.renderpass) {
    if (rp.type === 'common' || rp.type === 'sound') continue

    const passName = getPassName(rp)
    if (!passName) continue

    const passConfig: PassConfig = {
      code: commonCode + rp.code,
    }

    // Process inputs
    for (const input of rp.inputs) {
      const channelKey = `iChannel${input.channel}` as keyof PassConfig
      if (channelKey === 'code') continue

      if (input.ctype === 'buffer') {
        // Reference to another buffer
        const refPass = OUTPUT_ID_TO_PASS[input.id]
        if (refPass) {
          ;(passConfig as any)[channelKey] = refPass
        }
      } else if (input.ctype === 'texture' || input.ctype === 'cubemap') {
        const texOpts: TextureOptions = {
          src: resolveTextureSrc(input.src),
          wrap: mapWrap(input.sampler.wrap),
          filter: mapFilter(input.sampler.filter),
          vflip: input.sampler.vflip === 'true',
        }
        ;(passConfig as any)[channelKey] = texOpts

        // Also store in flat textures for single-pass fallback
        const texKey = `iChannel${input.channel}` as keyof TextureInputs
        textures[texKey] = texOpts
      }
      // keyboard, video, music etc. — skip for now
    }

    passes[passName] = passConfig
  }

  const meta: ShaderMeta = {
    name: shader.info.name,
    author: shader.info.username,
    description: shader.info.description,
    tags: shader.info.tags,
  }

  return { passes, textures, meta }
}

function getPassName(rp: ShadertoyApiRenderPass): PassName | null {
  if (rp.type === 'image') return 'Image'
  if (rp.type === 'buffer') {
    // Determine buffer name from output ID
    for (const out of rp.outputs) {
      const name = OUTPUT_ID_TO_PASS[out.id]
      if (name) return name
    }
    return null
  }
  return null
}

/**
 * Check if a shader config is single-pass (only Image, no buffers).
 */
export function isSinglePass(passes: MultipassConfig): boolean {
  const keys = Object.keys(passes) as PassName[]
  return keys.length === 1 && keys[0] === 'Image'
}
