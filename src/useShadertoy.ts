import { useCallback, useEffect, useRef, useState } from 'react'
import { apiToConfig, fetchShader, isSinglePass } from './api'
import { createMultipassRenderer, disposeMultipass, renderMultipass, resizeFBOs } from './multipass'
import { createRenderer, dispose, render } from './renderer'
import { bindTextures, createAudioTexture, createKeyboardTexture, createTexture, disposeTextures, updateAudioTexture, updateDynamicTextures, updateKeyboardTexture } from './textures'
import type { AudioState, CustomUniforms, FrameContext, KeyboardState, MouseState, MultipassConfig, PassState, RendererState, ShaderMeta, TextureInputs, TextureState, UseShadertoyOptions, UseShadertoyReturn } from './types'
import { setCustomUniforms, updateUniforms } from './uniforms'

const CHANNEL_KEYS: (keyof TextureInputs)[] = ['iChannel0', 'iChannel1', 'iChannel2', 'iChannel3']

function isGlslUrl(s?: string): boolean {
  if (!s) return false
  return /\.(glsl|frag|fs|vert|vs)(\?.*)?$/i.test(s) || (/^https?:\/\//.test(s) && !s.includes('mainImage'))
}

export function useShadertoy({
  fragmentShader,
  passes: passesProp,
  textures: texturesProp,
  id,
  apiKey,
  paused = false,
  speed = 1.0,
  pixelRatio,
  mouse: mouseEnabled = true,
  keyboard: keyboardEnabled = false,
  audio: audioEnabled = false,
  onError,
  onLoad,
  uniforms: uniformsProp,
  onFrame,
}: UseShadertoyOptions): UseShadertoyReturn & { meta: ShaderMeta | null } {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<RendererState | null>(null)
  const multipassRef = useRef<PassState[] | null>(null)
  const rafRef = useRef<number>(0)
  const pausedRef = useRef(paused)
  const speedRef = useRef(speed)
  const onFrameRef = useRef(onFrame)
  const customUniformsRef = useRef<CustomUniforms>(uniformsProp ? { ...uniformsProp } : {})

  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<ShaderMeta | null>(null)

  // Resolved config from API / URL fetch (or props directly)
  const needsFetch = !!id || isGlslUrl(fragmentShader)
  const [resolved, setResolved] = useState<{
    passes?: MultipassConfig
    textures?: TextureInputs
    fragmentShader?: string
  } | null>(needsFetch ? null : { passes: passesProp, textures: texturesProp, fragmentShader })

  const mouseState = useRef<MouseState>({
    x: 0, y: 0,
    clickX: 0, clickY: 0,
    pressed: false,
  })

  const keyboardState = useRef<KeyboardState>({
    data: new Uint8Array(256 * 3),
    toggles: new Uint8Array(256),
    dirty: false,
  })
  const keyboardTexRef = useRef<TextureState | null>(null)

  const audioState = useRef<AudioState>({
    data: new Uint8Array(512 * 2),
    frequencyData: new Uint8Array(512),
    waveformData: new Uint8Array(512),
    context: null,
    analyser: null,
    sourceNode: null,
  })
  const audioTexRef = useRef<TextureState | null>(null)

  const sharedState = useRef({ time: 0, frame: 0 })

  pausedRef.current = paused
  speedRef.current = speed
  onFrameRef.current = onFrame
  // Merge prop changes into mutable ref (onFrame may have already mutated values)
  if (uniformsProp) {
    for (const [k, v] of Object.entries(uniformsProp)) {
      customUniformsRef.current[k] = v
    }
  }

  // Fetch from Shadertoy API when id is provided
  useEffect(() => {
    if (!id) return
    if (!apiKey) {
      setError('apiKey is required when using id')
      onError?.('apiKey is required when using id')
      return
    }

    let cancelled = false
    fetchShader(id, apiKey)
      .then(shader => {
        if (cancelled) return
        const config = apiToConfig(shader)
        setMeta(config.meta)

        if (isSinglePass(config.passes)) {
          // Single image pass — use fragmentShader mode
          const imagePass = config.passes.Image!
          setResolved({
            fragmentShader: imagePass.code,
            textures: config.textures,
          })
        } else {
          setResolved({ passes: config.passes })
        }
      })
      .catch(err => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'Failed to fetch shader'
        setError(msg)
        onError?.(msg)
      })

    return () => { cancelled = true }
  }, [id, apiKey])

  // Fetch GLSL from URL when fragmentShader looks like a file path
  useEffect(() => {
    if (id || !isGlslUrl(fragmentShader)) return

    let cancelled = false
    fetch(fragmentShader!)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to fetch ${fragmentShader}: ${res.status}`)
        return res.text()
      })
      .then(code => {
        if (cancelled) return
        setResolved({ fragmentShader: code, textures: texturesProp })
      })
      .catch(err => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'Failed to fetch shader'
        setError(msg)
        onError?.(msg)
      })

    return () => { cancelled = true }
  }, [fragmentShader, id])

  const effectivePasses = resolved?.passes
  const effectiveTextures = resolved?.textures ?? texturesProp
  const effectiveShader = resolved?.fragmentShader ?? fragmentShader
  const isMultipass = !!effectivePasses

  // Initialize WebGL
  useEffect(() => {
    if (needsFetch && !resolved) return // Still fetching from API or URL

    const canvas = canvasRef.current
    if (!canvas) return

    sharedState.current = { time: 0, frame: 0 }

    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: true,
      premultipliedAlpha: false,
    })
    if (!gl) {
      const msg = 'WebGL2 not supported'
      setError(msg)
      onError?.(msg)
      return
    }

    const externalTextures: (TextureState | null)[] = [null, null, null, null]
    const texturePromises: Promise<void>[] = []
    if (effectiveTextures) {
      for (let i = 0; i < 4; i++) {
        const src = effectiveTextures[CHANNEL_KEYS[i]]
        if (src != null) {
          const { state, promise } = createTexture(gl, src, i)
          externalTextures[i] = state
          if (promise) texturePromises.push(promise)
        }
      }
    }

    // Create keyboard texture if enabled and a channel is available
    if (keyboardEnabled) {
      for (let i = 0; i < 4; i++) {
        if (!externalTextures[i]) {
          const kbTex = createKeyboardTexture(gl, i)
          externalTextures[i] = kbTex
          keyboardTexRef.current = kbTex
          break
        }
      }
    }

    // Create audio texture if enabled
    if (audioEnabled) {
      for (let i = 0; i < 4; i++) {
        if (!externalTextures[i]) {
          const audioTex = createAudioTexture(gl, i)
          externalTextures[i] = audioTex
          audioTexRef.current = audioTex
          break
        }
      }
    }

    const markReady = () => {
      setIsReady(true)
      setError(null)
      onLoad?.()
    }

    const handleError = (msg: string) => {
      setError(msg)
      onError?.(msg)
    }

    if (isMultipass) {
      const passResult = createMultipassRenderer(gl, effectivePasses!, externalTextures)
      if (typeof passResult === 'string') {
        handleError(passResult)
        return
      }

      multipassRef.current = passResult
      rendererRef.current = null

      if (texturePromises.length > 0) {
        Promise.all(texturePromises)
          .then(() => { if (multipassRef.current) markReady() })
          .catch((err) => handleError(err instanceof Error ? err.message : 'Texture load failed'))
      } else {
        markReady()
      }

      let lastTimestamp = 0
      const loop = (timestamp: number) => {
        const delta = lastTimestamp ? (timestamp - lastTimestamp) / 1000 : 0
        lastTimestamp = timestamp

        if (!pausedRef.current && multipassRef.current) {
          // Clear keyPressed row (row 1) each frame
          if (keyboardTexRef.current) {
            const kb = keyboardState.current
            kb.data.fill(0, 256, 512)
            kb.dirty = true
            updateKeyboardTexture(gl, keyboardTexRef.current, kb)
          }
          if (audioTexRef.current) {
            updateAudioTexture(gl, audioTexRef.current, audioState.current)
          }
          updateDynamicTextures(gl, externalTextures)
          renderMultipass(gl, multipassRef.current, delta, speedRef.current, mouseState.current, sharedState.current)
        }

        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)

      return () => {
        cancelAnimationFrame(rafRef.current)
        if (multipassRef.current) {
          disposeMultipass(gl, multipassRef.current)
          multipassRef.current = null
        }
        disposeTextures(gl, externalTextures)
        gl.getExtension('WEBGL_lose_context')?.loseContext()
        setIsReady(false)
      }
    } else {
      const shaderCode = effectiveShader || 'void mainImage(out vec4 c, in vec2 f){ c = vec4(0); }'
      const result = createRenderer(canvas, shaderCode, uniformsProp)
      if (typeof result === 'string') {
        handleError(result)
        return
      }

      rendererRef.current = result
      multipassRef.current = null
      result.textures = externalTextures

      if (texturePromises.length > 0) {
        Promise.all(texturePromises)
          .then(() => { if (rendererRef.current) markReady() })
          .catch((err) => handleError(err instanceof Error ? err.message : 'Texture load failed'))
      } else {
        markReady()
      }

      let lastTimestamp = 0
      const loop = (timestamp: number) => {
        const delta = lastTimestamp ? (timestamp - lastTimestamp) / 1000 : 0
        lastTimestamp = timestamp

        if (!pausedRef.current && rendererRef.current) {
          const r = rendererRef.current
          // Clear keyPressed row (row 1) each frame
          if (keyboardTexRef.current) {
            const kb = keyboardState.current
            kb.data.fill(0, 256, 512)
            kb.dirty = true
            updateKeyboardTexture(r.gl, keyboardTexRef.current, kb)
          }
          if (audioTexRef.current) {
            updateAudioTexture(r.gl, audioTexRef.current, audioState.current)
          }
          updateDynamicTextures(r.gl, r.textures)
          bindTextures(r.gl, r.locations.iChannel, r.textures)
          updateUniforms(r, delta, speedRef.current, mouseState.current)

          // Custom uniforms + onFrame callback
          if (onFrameRef.current) {
            const ctx: FrameContext = {
              time: r.time,
              frame: r.frame,
              delta,
              uniforms: customUniformsRef.current,
              resolution: [r.gl.drawingBufferWidth, r.gl.drawingBufferHeight],
              mouse: mouseState.current,
            }
            onFrameRef.current(ctx)
          }
          if (Object.keys(customUniformsRef.current).length > 0) {
            setCustomUniforms(r.gl, r.program, customUniformsRef.current, r.customUniformCache)
          }

          render(r)
        }

        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)

      return () => {
        cancelAnimationFrame(rafRef.current)
        if (rendererRef.current) {
          disposeTextures(rendererRef.current.gl, rendererRef.current.textures)
          dispose(rendererRef.current)
          rendererRef.current = null
        }
        setIsReady(false)
      }
    }
  }, [effectiveShader, effectivePasses, effectiveTextures, resolved, onError, onLoad])

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = pixelRatio ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1)

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        const w = Math.round(width * dpr)
        const h = Math.round(height * dpr)
        canvas.width = w
        canvas.height = h

        // Resize multipass FBOs
        if (multipassRef.current) {
          const gl = canvas.getContext('webgl2')
          if (gl) resizeFBOs(gl, multipassRef.current, w, h)
        }
      }
    })

    observer.observe(canvas)
    return () => observer.disconnect()
  }, [pixelRatio])

  // Mouse / touch events
  useEffect(() => {
    if (!mouseEnabled) return
    const canvas = canvasRef.current
    if (!canvas) return

    const toPixel = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect()
      const dpr = pixelRatio ?? window.devicePixelRatio
      return {
        x: (cx - r.left) * dpr,
        y: (r.height - (cy - r.top)) * dpr, // flip Y
      }
    }

    const onMove = (cx: number, cy: number) => {
      if (!mouseState.current.pressed) return
      const { x, y } = toPixel(cx, cy)
      mouseState.current.x = x
      mouseState.current.y = y
    }

    const onDown = (cx: number, cy: number) => {
      const { x, y } = toPixel(cx, cy)
      mouseState.current.x = x
      mouseState.current.y = y
      mouseState.current.clickX = x
      mouseState.current.clickY = y
      mouseState.current.pressed = true
    }

    const onUp = () => {
      mouseState.current.pressed = false
    }

    const mm = (e: MouseEvent) => onMove(e.clientX, e.clientY)
    const md = (e: MouseEvent) => onDown(e.clientX, e.clientY)
    const mu = () => onUp()
    const tm = (e: TouchEvent) => {
      if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY)
    }
    const ts = (e: TouchEvent) => {
      if (e.touches[0]) onDown(e.touches[0].clientX, e.touches[0].clientY)
    }
    const te = () => onUp()

    window.addEventListener('mousemove', mm)
    canvas.addEventListener('mousedown', md)
    window.addEventListener('mouseup', mu)
    window.addEventListener('touchmove', tm, { passive: true })
    canvas.addEventListener('touchstart', ts, { passive: true })
    window.addEventListener('touchend', te)

    return () => {
      window.removeEventListener('mousemove', mm)
      canvas.removeEventListener('mousedown', md)
      window.removeEventListener('mouseup', mu)
      window.removeEventListener('touchmove', tm)
      canvas.removeEventListener('touchstart', ts)
      window.removeEventListener('touchend', te)
    }
  }, [mouseEnabled, pixelRatio])

  // Keyboard events (Shadertoy keyboard texture)
  useEffect(() => {
    if (!keyboardEnabled) return

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode & 0xFF
      const kb = keyboardState.current
      if (!kb.data[code]) {
        kb.data[code] = 255                    // Row 0: keyDown
        kb.data[256 + code] = 255              // Row 1: keyPressed (1 frame)
        kb.toggles[code] ^= 255               // Toggle
        kb.data[512 + code] = kb.toggles[code] // Row 2: toggle
        kb.dirty = true
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.keyCode & 0xFF
      const kb = keyboardState.current
      kb.data[code] = 0  // Row 0: keyDown off
      kb.dirty = true
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [keyboardEnabled])

  // Audio input (microphone or external MediaStream)
  useEffect(() => {
    if (!audioEnabled) return

    let cancelled = false
    const setup = async () => {
      try {
        const stream = audioEnabled instanceof MediaStream
          ? audioEnabled
          : await navigator.mediaDevices.getUserMedia({ audio: true })

        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }

        const ctx = new AudioContext()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        analyser.smoothingTimeConstant = 0.8

        const source = ctx.createMediaStreamSource(stream)
        source.connect(analyser)

        const as = audioState.current
        as.context = ctx
        as.analyser = analyser
        as.sourceNode = source
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Microphone access denied')
      }
    }

    setup()

    return () => {
      cancelled = true
      const as = audioState.current
      as.sourceNode?.disconnect()
      as.context?.close()
      as.context = null
      as.analyser = null
      as.sourceNode = null
    }
  }, [audioEnabled])

  const pause = useCallback(() => { pausedRef.current = true }, [])
  const resume = useCallback(() => { pausedRef.current = false }, [])

  return { canvasRef, isReady, error, pause, resume, meta }
}
