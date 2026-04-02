import { useCallback, useEffect, useRef, useState } from 'react'
import { createMultipassRenderer, disposeMultipass, renderMultipass, resizeFBOs } from './multipass'
import { createRenderer, dispose, render } from './renderer'
import { bindTextures, createTexture, disposeTextures, updateDynamicTextures } from './textures'
import type { MouseState, PassState, RendererState, TextureInputs, UseShadertoyOptions, UseShadertoyReturn } from './types'
import { updateUniforms } from './uniforms'

const CHANNEL_KEYS: (keyof TextureInputs)[] = ['iChannel0', 'iChannel1', 'iChannel2', 'iChannel3']

export function useShadertoy({
  fragmentShader,
  passes: passesProp,
  textures: texturesProp,
  paused = false,
  speed = 1.0,
  pixelRatio,
  mouse: mouseEnabled = true,
  onError,
  onLoad,
}: UseShadertoyOptions): UseShadertoyReturn {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<RendererState | null>(null)
  const multipassRef = useRef<PassState[] | null>(null)
  const rafRef = useRef<number>(0)
  const pausedRef = useRef(paused)
  const speedRef = useRef(speed)

  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mouseState = useRef<MouseState>({
    x: 0, y: 0,
    clickX: 0, clickY: 0,
    pressed: false,
  })

  // Shared multipass state (time/frame)
  const sharedState = useRef({ time: 0, frame: 0 })

  // Keep refs in sync
  pausedRef.current = paused
  speedRef.current = speed

  const isMultipass = !!passesProp

  // Initialize WebGL
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Reset shared state
    sharedState.current = { time: 0, frame: 0 }

    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: true,
      premultipliedAlpha: false,
    })
    if (!gl) {
      const msg = 'WebGL not supported'
      setError(msg)
      onError?.(msg)
      return
    }

    // Load external textures (for single-pass or multipass external inputs)
    const externalTextures: (import('./types').TextureState | null)[] = [null, null, null, null]
    const texturePromises: Promise<void>[] = []
    if (texturesProp) {
      for (let i = 0; i < 4; i++) {
        const src = texturesProp[CHANNEL_KEYS[i]]
        if (src != null) {
          const { state, promise } = createTexture(gl, src, i)
          externalTextures[i] = state
          if (promise) texturePromises.push(promise)
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
      // ── Multipass mode ──
      const passResult = createMultipassRenderer(gl, passesProp!, externalTextures)
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

      // Render loop
      let lastTimestamp = 0
      const loop = (timestamp: number) => {
        const delta = lastTimestamp ? (timestamp - lastTimestamp) / 1000 : 0
        lastTimestamp = timestamp

        if (!pausedRef.current && multipassRef.current) {
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
      // ── Single-pass mode ──
      const shaderCode = fragmentShader || 'void mainImage(out vec4 c, in vec2 f){ c = vec4(0); }'
      const result = createRenderer(canvas, shaderCode)
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

      // Render loop
      let lastTimestamp = 0
      const loop = (timestamp: number) => {
        const delta = lastTimestamp ? (timestamp - lastTimestamp) / 1000 : 0
        lastTimestamp = timestamp

        if (!pausedRef.current && rendererRef.current) {
          const r = rendererRef.current
          updateDynamicTextures(r.gl, r.textures)
          bindTextures(r.gl, r.locations.iChannel, r.textures)
          updateUniforms(r, delta, speedRef.current, mouseState.current)
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
  }, [fragmentShader, passesProp, texturesProp, onError, onLoad])

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
          const gl = canvas.getContext('webgl')
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

  const pause = useCallback(() => { pausedRef.current = true }, [])
  const resume = useCallback(() => { pausedRef.current = false }, [])

  return { canvasRef, isReady, error, pause, resume }
}
