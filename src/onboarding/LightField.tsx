import { useEffect, useRef } from 'react'

const vertexSource = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`

// A slowly folding sheet of light. The discrete cells are part of the material,
// rather than an image filter, so its grain stays crisp at every window size.
const fragmentSource = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_quiet;
uniform float u_stage;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x),
             mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), f.x), f.y);
}
float field(vec2 p) {
  float n=0.; float a=.5;
  for(int i=0;i<4;i++) { n+=a*noise(p); p=mat2(1.6,1.2,-1.2,1.6)*p+3.7; a*=.5; }
  return n;
}
void main() {
  vec2 uv=gl_FragCoord.xy/u_resolution;
  float aspect=u_resolution.x/u_resolution.y;
  vec2 cells=vec2(u_resolution.x/3.6, u_resolution.y/8.5);
  vec2 cell=floor(uv*cells);
  vec2 p=(cell+.5)/cells;
  float t=u_time*.19;
  p.y += .012*u_stage;
  p.x += .008*u_stage;
  float drift=field(vec2(p.x*3.7-t*.35,p.y*3.1+t*.22));
  float warp=field(vec2(p.x*6.+drift*2.1+t*.12+u_stage*.17,p.y*4.-t*.18));
  // A broad diagonal fabric, with a negative-space fold through its centre.
  float centre=.40+.22*sin(p.x*4.8-1.1+t*.16)+.08*(drift-.5)+.035*sin(p.x*7.-t*.6);
  float spread=.105+.105*smoothstep(.18,.8,p.x);
  float distance=(p.y-centre)/(spread+.03*sin(p.x*7.+t));
  float envelope=exp(-distance*distance*1.35);
  float folds=sin(p.x*15.5+p.y*7.2+warp*10.-t*.8);
  float ridges=pow(max(0.,folds*.5+.5), 3.6);
  float fine=pow(max(0.,sin(p.x*33.-p.y*17.+drift*8.+t)*.5+.5),6.);
  float energy=envelope*(.20+ridges*1.48+fine*.28);
  energy*=smoothstep(.04,.34,p.x)*(1.-smoothstep(.94,1.32,p.x));
  float crossFold=1.-.85*exp(-pow((p.y-centre+.055+.025*sin(p.x*8.))/(.021+.012*warp),2.));
  energy*=crossFold;
  float grain=.73+.45*hash(cell);
  energy*=grain;
  vec3 deep=vec3(.21,.021,.003);
  vec3 copper=vec3(1.,.24,.045);
  vec3 amber=vec3(1.,.59,.22);
  vec3 ivory=vec3(1.,.91,.67);
  vec3 color=mix(deep,copper,smoothstep(.015,.47,energy));
  color=mix(color,amber,smoothstep(.40,1.05,energy));
  color=mix(color,ivory,smoothstep(.90,1.65,energy));
  float greenBand = exp(-pow((p.x-.73-.06*sin(t*.22))/.10,2.))*smoothstep(.35,.9,energy);
  greenBand *= .55+.45*sin(p.y*9.+t*.12);
  color=mix(color,vec3(.43,.78,.57)*(.55+energy*.45),greenBand*.70);
  color*=smoothstep(.006,.17,energy);
  vec2 cellUV=fract(uv*cells);
  float seams=smoothstep(.035,.11,cellUV.x)*(1.-smoothstep(.86,.97,cellUV.x));
  seams*=smoothstep(.018,.055,cellUV.y)*(1.-smoothstep(.92,.99,cellUV.y));
  color*=.47+.53*seams;
  // A restrained atmospheric bloom connects the luminous cells without blurring them.
  float bloom=exp(-distance*distance*.58)*smoothstep(.13,.65,p.x);
  color+=vec3(.16,.037,.009)*bloom;
  color+=vec3(.012,.007,.008);
  color*=1.-.12*u_quiet;
  float vignette=1.-.40*pow(length((uv-.5)*vec2(.9,1.2)),1.5);
  color*=vignette;
  color+=(hash(gl_FragCoord.xy)-.5)*.026;
  gl_FragColor=vec4(color,1.);
}
`

/** Entirely local ambient artwork; no network, media download, or model call. */
export function LightField({ quiet = false, stage = 0 }: { quiet?: boolean; stage?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallbackRef = useRef<HTMLCanvasElement>(null)
  const quietRef = useRef(quiet)
  quietRef.current = quiet
  const stageRef = useRef(stage)
  stageRef.current = stage

  useEffect(() => {
    const canvas = canvasRef.current, fallback = fallbackRef.current
    if (!canvas || !fallback) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0, previous = 0, elapsed = 0, disposed = false, lost = false
    let currentStage = stageRef.current, currentQuiet = quietRef.current ? 1 : 0
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' })
    const ctx = fallback.getContext('2d')
    const paintFallback = (width: number, height: number) => {
      if (!ctx) return
      fallback.width = width; fallback.height = height
      ctx.fillStyle = '#090605'; ctx.fillRect(0, 0, width, height)
      const stepX = 5, stepY = 10
      for (let x = 0; x < width; x += stepX) {
        const u = x / width, middle = height * (.60 - .22 * Math.sin(u * 4.8 - 1.1))
        for (let y = 0; y < height; y += stepY) {
          const d = (y - middle) / (height * (.105 + .105 * u))
          const fold = Math.pow(Math.max(0, Math.sin(u * 17 + y / height * 8) * .5 + .5), 3)
          const energy = Math.exp(-d * d * 1.35) * (.18 + fold) * Math.min(1, Math.max(0, (u - .08) * 4))
          if (energy < .02) continue
          ctx.fillStyle = `rgba(255,${Math.round(60 + energy * 175)},${Math.round(12 + energy * 120)},${Math.min(.98, energy)})`
          ctx.fillRect(x, y, stepX - 1, stepY - 1)
        }
      }
    }
    let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null
    const shaders: WebGLShader[] = []
    const compile = (kind: number, source: string) => {
      if (!gl) return null
      const shader = gl.createShader(kind)
      if (!shader) return null
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader)
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null
    }
    if (gl) {
      const vertex = compile(gl.VERTEX_SHADER, vertexSource)
      const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource)
      if (vertex && fragment) {
        program = gl.createProgram()
        if (program) {
          gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program)
          if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); program = null }
        }
      }
      if (program) {
        gl.useProgram(program)
        buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW)
        const position = gl.getAttribLocation(program, 'a_position')
        gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
      }
    }
    canvas.style.opacity = program ? '1' : '0'
    const resolution = gl && program ? gl.getUniformLocation(program, 'u_resolution') : null
    const time = gl && program ? gl.getUniformLocation(program, 'u_time') : null
    const quietUniform = gl && program ? gl.getUniformLocation(program, 'u_quiet') : null
    const stageUniform = gl && program ? gl.getUniformLocation(program, 'u_stage') : null
    const draw = () => {
      if (!gl || !program || lost || disposed) return
      gl.uniform2f(resolution, canvas.width, canvas.height)
      gl.uniform1f(time, elapsed / 1000)
      gl.uniform1f(quietUniform, currentQuiet)
      gl.uniform1f(stageUniform, currentStage)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 1.25, 1800 / Math.max(1, bounds.width))
      canvas.width = Math.max(1, Math.round(bounds.width * ratio))
      canvas.height = Math.max(1, Math.round(bounds.height * ratio))
      gl?.viewport(0, 0, canvas.width, canvas.height)
      paintFallback(Math.max(1, Math.round(bounds.width)), Math.max(1, Math.round(bounds.height)))
      draw()
    }
    const tick = (now: number) => {
      if (disposed || lost || document.hidden || motion.matches || !program) return
      if (!previous) previous = now
      if (now - previous >= 1000 / 30) {
        const dt = Math.min(now - previous, 100)
        elapsed += dt
        // Keep the canvas and its clock alive; gently retarget the same field.
        const ease = 1 - Math.exp(-dt / 950)
        currentStage += (stageRef.current - currentStage) * ease
        currentQuiet += ((quietRef.current ? 1 : 0) - currentQuiet) * ease
        previous = now; draw()
      }
      frame = requestAnimationFrame(tick)
    }
    const resume = () => {
      cancelAnimationFrame(frame); previous = 0
      if (!document.hidden && !motion.matches && program && !lost) frame = requestAnimationFrame(tick)
      else draw()
    }
    const contextLost = (event: Event) => {
      event.preventDefault(); lost = true; cancelAnimationFrame(frame); canvas.style.opacity = '0'
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    canvas.addEventListener('webglcontextlost', contextLost)
    document.addEventListener('visibilitychange', resume)
    motion.addEventListener('change', resume)
    resize(); resume()
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect()
      canvas.removeEventListener('webglcontextlost', contextLost)
      document.removeEventListener('visibilitychange', resume); motion.removeEventListener('change', resume)
      if (gl) { if (buffer) gl.deleteBuffer(buffer); if (program) gl.deleteProgram(program); shaders.forEach(shader => gl.deleteShader(shader)) }
    }
  }, [])

  return <div className="onboard-light" aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
    <canvas ref={fallbackRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
  </div>
}
