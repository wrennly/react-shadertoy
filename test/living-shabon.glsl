// Living Shabon — Physical Thin-Film Interference Soap Bubbles
// by Ken (@wrennly) — https://wrennly.com
//
// Physics:
//   8-wavelength thin-film interference (400–700 nm)
//   Zucconi 6-lobe spectral colour fit
//   Fresnel reflection + chromatic aberration (IOR 1.33 ± 0.018)
//   Gravity-based film thickness with noise sloshing
//
// Rendering:
//   SDF ray marching — 5 bubbles, 128 steps
//   Environment: sky gradient + horizon glow + sun disc
//   Dual specular highlights + Reinhard tone mapping
//
// Interaction:
//   Click + drag to indent the membrane
//
// License: MIT

// ── Tweakable ────────────────────────────────────────
#define WOBBLE             1.0   // Organic deformation intensity
#define FILM_THICKNESS     1.0   // Shifts iridescent colour range
#define BUBBLE_COUNT       5

// ── Interaction (derived from iMouse in mainImage) ───
vec2  gMouse;
float gPressure;

// ══════════════════════════════════════════════════════
// 3-D Simplex Noise  (Ashima / Stefan Gustavson)
// ══════════════════════════════════════════════════════
vec3 mod289(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec4 mod289(vec4 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+10.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314*r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g  = step(x0.yzx, x0.xyz);
  vec3 l  = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0,i1.z,i2.z,1.0))
    + i.y + vec4(0.0,i1.y,i2.y,1.0))
    + i.x + vec4(0.0,i1.x,i2.x,1.0));
  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4  j  = p - 49.0*floor(p*ns.z*ns.z);
  vec4  x_ = floor(j*ns.z);
  vec4  y_ = floor(j - 7.0*x_);
  vec4  x  = x_*ns.x + vec4(ns.y);
  vec4  y  = y_*ns.x + vec4(ns.y);
  vec4  h  = 1.0 - abs(x) - abs(y);
  vec4 b0  = vec4(x.xy, y.xy);
  vec4 b1  = vec4(x.zw, y.zw);
  vec4 s0  = floor(b0)*2.0 + 1.0;
  vec4 s1  = floor(b1)*2.0 + 1.0;
  vec4 sh  = -step(h, vec4(0.0));
  vec4 a0  = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1  = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0  = vec3(a0.xy, h.x);
  vec3 p1  = vec3(a0.zw, h.y);
  vec3 p2  = vec3(a1.xy, h.z);
  vec3 p3  = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
  m = m*m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

// ══════════════════════════════════════════════════════
// Spectral colour  (Zucconi 6-lobe fit)
// ══════════════════════════════════════════════════════
vec3 bump3y(vec3 x, vec3 yo){ return clamp(1.0 - x*x - yo, 0.0, 1.0); }

vec3 spectral(float w) {
  float x = clamp((w - 400.0)/300.0, 0.0, 1.0);
  const vec3 c1 = vec3(3.54585104,2.93225262,2.41593945);
  const vec3 x1 = vec3(0.69549072,0.49228336,0.27699880);
  const vec3 y1 = vec3(0.02312639,0.15225084,0.52607955);
  const vec3 c2 = vec3(3.90307140,3.21182957,3.96587128);
  const vec3 x2 = vec3(0.11748627,0.86755042,0.66077860);
  const vec3 y2 = vec3(0.84897130,0.88445281,0.73949448);
  return bump3y(c1*(x-x1),y1) + bump3y(c2*(x-x2),y2);
}

// ══════════════════════════════════════════════════════
// Thin-film interference — 8 hero wavelengths
// Physical: 2-beam model with π phase shift at air→film boundary
// ══════════════════════════════════════════════════════
vec3 thinFilm(float d_nm, float cosTheta) {
  const float n = 1.33;                          // soap-film IOR ≈ water
  float sinT2 = (1.0 - cosTheta*cosTheta)/(n*n);
  float cosT  = sqrt(max(0.0, 1.0 - sinT2));
  vec3 col = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float lambda = 400.0 + float(i)*42.857;      // 400→700 nm, 8 samples
    float opd    = 2.0*n*d_nm*cosT;
    float phase  = 6.28318530718*opd/lambda + 3.14159265359; // +π hard refl.
    float R      = 0.5*(1.0 - cos(phase));
    col += spectral(lambda) * R;
  }
  return col * 0.5;
}

// ══════════════════════════════════════════════════════
// Environment  (gradient sky + horizon glow + sun disc)
// ══════════════════════════════════════════════════════
vec3 envColor(vec3 dir) {
  float t = dir.y*0.5 + 0.5;
  vec3  sky = mix(vec3(0.04,0.07,0.22), vec3(0.72,0.87,1.00), t*t);
  sky += vec3(1.00,0.70,0.35) * exp(-abs(dir.y)*5.0) * 0.25; // horizon
  float sun = max(0.0, dot(dir, normalize(vec3(0.8,1.2,1.5))));
  sky += vec3(1.00,0.97,0.90) * pow(sun, 80.0) * 4.5;         // sun disc
  return sky;
}

// Chromatic-aberration refraction: R / G / B see slightly different IORs
vec3 refractedEnv(vec3 rd, vec3 n, float ior) {
  vec3 r  = refract(rd, n, 1.0/ior);        if (dot(r, r)<0.01) r  = reflect(rd,n);
  vec3 rR = refract(rd, n, 1.0/(ior-0.018)); if (dot(rR,rR)<0.01) rR = r;
  vec3 rB = refract(rd, n, 1.0/(ior+0.018)); if (dot(rB,rB)<0.01) rB = r;
  return vec3(envColor(rR).r, envColor(r).g, envColor(rB).b);
}

// ══════════════════════════════════════════════════════
// Multi-bubble system — 5 bubbles, varying sizes, drifting
// ══════════════════════════════════════════════════════

vec3 bubbleCenter(int i) {
  float fi = float(i);
  float s  = fi*2.618 + 0.5;
  float t  = iTime;
  float drift = 0.05 + fi*0.012;
  float y = mod(t*drift + s*1.7, 4.5) - 2.25;
  float x = sin(t*(0.07+fi*0.012) + s*3.14) * (0.6+fi*0.18);
  float z = cos(t*(0.05+fi*0.009) + s*2.71) * 0.15;
  y += sin(t*0.19 + s) * 0.06;
  x += cos(t*0.14 + s*1.5) * 0.04;
  return vec3(x, y, z);
}

float bubbleRadius(int i) {
  float fi = float(i);
  float s  = fi*2.618 + 0.5;
  return 0.18 + fract(sin(s*43.7)*98765.0)*0.22;
}

// Organic deformation — pure sinusoids (jelly-like wobble)
float bubbleDeform(vec3 lp, float phase) {
  float t = iTime;
  return (sin(lp.x*2.0 + t*0.50 + phase)  * cos(lp.y*1.8 + t*0.37 + phase*1.3) * 0.012
        + cos(lp.z*2.2 + t*0.43 + phase*0.7) * sin(lp.x*1.5 - t*0.29 + phase*0.5) * 0.008
        + sin(t*0.6 + phase*2.0) * 0.004) * WOBBLE;
}

// Scene SDF: union of all bubbles + mouse indent
float sdScene(vec3 p) {
  float d = 1e9;
  for (int i = 0; i < BUBBLE_COUNT; i++) {
    vec3  c = bubbleCenter(i);
    float r = bubbleRadius(i);
    vec3  lp = p - c;
    float deform = bubbleDeform(lp, float(i)*2.618);
    float sd = length(lp) - (r + deform);
    d = min(d, sd);
  }
  // Mouse indent
  vec3  mw = vec3(gMouse*1.5, 0.6);
  d += gPressure * 0.10 * exp(-length(p - mw)*5.0);
  return d;
}

// ══════════════════════════════════════════════════════
// Film thickness — gravity-based, relative to each bubble
// ══════════════════════════════════════════════════════
float filmThickness(vec3 p, vec3 center, float radius) {
  float localY = (p.y - center.y) / radius;
  float g      = clamp((-localY + 1.0)*0.5, 0.0, 1.0);
  float base   = mix(150.0, 700.0, pow(g, 1.5)) * FILM_THICKNESS;
  float slosh  = snoise(p*3.5 + iTime*0.7)*55.0
               + snoise(p*7.0 - iTime*1.1)*22.0;
  vec3  mw     = vec3(gMouse*1.5, 0.6);
  float thin   = gPressure * 160.0 * exp(-length(p - mw)*3.5);
  return clamp(base + slosh - thin, 60.0, 950.0);
}

// ══════════════════════════════════════════════════════
// Normal (tetrahedron gradient)
// ══════════════════════════════════════════════════════
vec3 calcNormal(vec3 p) {
  const float h = 0.0005;
  const vec2  k = vec2(1.0,-1.0);
  return normalize(
    k.xyy*sdScene(p+k.xyy*h) +
    k.yyx*sdScene(p+k.yyx*h) +
    k.yxy*sdScene(p+k.yxy*h) +
    k.xxx*sdScene(p+k.xxx*h)
  );
}

// Find which bubble a surface point belongs to
void closestBubble(vec3 p, out vec3 center, out float radius) {
  float best = 1e9;
  center = vec3(0.0); radius = 0.3;
  for (int i = 0; i < BUBBLE_COUNT; i++) {
    vec3  c = bubbleCenter(i);
    float r = bubbleRadius(i);
    float dd = abs(length(p - c) - r);
    if (dd < best) { best = dd; center = c; radius = r; }
  }
}

// ══════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  // Derive interaction from iMouse
  gMouse    = iMouse.xy / iResolution.xy * 2.0 - 1.0;
  gPressure = iMouse.z > 0.0 ? 1.0 : 0.0;

  vec2 uv = (fragCoord / iResolution.xy - 0.5) * 2.0;
  uv.x *= iResolution.x / iResolution.y;

  vec3 ro = vec3(0.0, 0.0, 3.0);
  vec3 rd = normalize(vec3(uv, -1.5));
  vec3 bg = envColor(rd);

  // ── Ray march ──
  float t   = 0.001;
  bool  hit = false;
  for (int i = 0; i < 128; i++) {
    float d = sdScene(ro + rd*t);
    if (d < 0.0004) { hit = true; break; }
    if (t > 10.0) break;
    t += max(d*0.85, 0.001);
  }

  vec3 color = bg;

  if (hit) {
    vec3  p    = ro + rd*t;
    vec3  n    = calcNormal(p);
    vec3  vd   = normalize(ro - p);
    float cos0 = max(dot(n, vd), 0.0);

    // Identify which bubble we hit
    vec3  bCenter; float bRadius;
    closestBubble(p, bCenter, bRadius);

    // Thin-film iridescence
    float thick = filmThickness(p, bCenter, bRadius);
    vec3  irid    = thinFilm(thick, cos0);
    float fresnel = pow(1.0 - cos0, 3.0);

    // Reflection + refraction
    vec3 reflCol = envColor(reflect(-vd, n));
    vec3 refrCol = refractedEnv(rd, n, 1.33);

    // Dual specular highlights
    vec3  lA    = normalize(vec3( 0.8, 1.2,  1.5));
    vec3  lB    = normalize(vec3(-0.7, 0.8, -0.5));
    float specA = pow(max(dot(n, normalize(lA+vd)), 0.0), 512.0)*5.0;
    float specB = pow(max(dot(n, normalize(lB+vd)), 0.0), 256.0)*1.8;

    // Composite
    vec3 surface = refrCol*(1.0-fresnel)
                 + reflCol*fresnel
                 + irid*0.55
                 + vec3(1.0,0.98,0.95)*specA
                 + vec3(0.85,0.91,1.0)*specB;

    float opacity = clamp(
      fresnel*0.75 + length(irid)*0.12 + specA*0.4 + specB*0.2,
      0.03, 0.90);

    color = mix(bg, surface, opacity);
  }

  // Tone mapping + gamma
  color = color/(color+0.5)*1.4;
  color = pow(max(color,0.0), vec3(0.92));
  fragColor = vec4(color, 1.0);
}
