import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Shadertoy } from 'react-shadertoy'

// Simple texture test: display iChannel0 with time-based distortion
const TEXTURE_TEST = `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  uv.x += 0.02 * sin(uv.y * 10.0 + iTime * 2.0);
  uv.y += 0.02 * cos(uv.x * 10.0 + iTime * 1.5);
  vec4 tex = texture2D(iChannel0, uv);
  vec3 tint = 0.5 + 0.5 * cos(iTime + vec3(0.0, 2.0, 4.0));
  fragColor = vec4(tex.rgb * (0.5 + 0.5 * tint), 1.0);
}
`

const CYBERSPACE = await fetch('/test/cyberspace.glsl').then(r => r.text()).catch(() => '')
const LIVING_SHABON = await fetch('/test/living-shabon.glsl').then(r => r.text()).catch(() => '')
const BUTTERFLY = await fetch('/test/butterfly.glsl').then(r => r.text()).catch(() => '')
const SPACE_JOCKEY = await fetch('/test/space_jocky.glsl').then(r => r.text()).catch(() => '')
const TUNNEL = await fetch('/test/tunnel.glsl').then(r => r.text()).catch(() => '')

const shaders: Record<string, { code: string; textures?: Record<string, string> }> = {
  'Texture Test': { code: TEXTURE_TEST, textures: { iChannel0: '/gray-noise-256.png' } },
  ...(TUNNEL ? { 'Tunnel': { code: TUNNEL, textures: { iChannel0: '/gray-noise-256.png', iChannel1: '/gray-noise-256.png' } } } : {}),
  ...(BUTTERFLY ? { 'Butterfly': { code: BUTTERFLY, textures: { iChannel0: '/gray-noise-256.png', iChannel1: '/sky-256.png' } } } : {}),
  ...(SPACE_JOCKEY ? { 'Space Jockey': { code: SPACE_JOCKEY } } : {}),
  ...(CYBERSPACE ? { 'Cyberspace': { code: CYBERSPACE } } : {}),
  ...(LIVING_SHABON ? { 'Living Shabon': { code: LIVING_SHABON } } : {}),
}

function App() {
  const names = Object.keys(shaders)
  const [active, setActive] = useState(names[0])
  const shader = shaders[active]

  return (
    <>
      <div style={{
        position: 'fixed', top: 12, left: 12, zIndex: 10,
        display: 'flex', gap: 8,
      }}>
        {names.map(name => (
          <button
            key={name}
            onClick={() => setActive(name)}
            style={{
              padding: '6px 14px',
              background: name === active ? '#fff' : 'rgba(255,255,255,0.15)',
              color: name === active ? '#000' : '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <Shadertoy
        key={active}
        fragmentShader={shader.code}
        textures={shader.textures as any}
        style={{ width: '100vw', height: '100vh' }}
        onError={(err) => console.error('GLSL ERROR:', err)}
      />
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
