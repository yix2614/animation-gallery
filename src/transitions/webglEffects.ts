import { createWebGLTransition } from './webglTransition';

export const rippleLens = createWebGLTransition(
  'Glass Lens Pulse',
  1120,
  `
void main() {
  vec2 px = v_uv * u_resolution;
  vec2 delta = px - u_origin;
  float d = length(delta);
  vec2 dir = d > 0.001 ? delta / d : vec2(0.0);
  float life = sin(3.14159265 * u_progress);
  float radius = mix(18.0, u_max_distance + 160.0, u_progress);
  float lensWidth = mix(92.0, 34.0, u_progress);
  float signedDistance = d - radius;
  float lensBand = 1.0 - smoothstep(0.0, lensWidth, abs(signedDistance));
  float lensInterior = 1.0 - smoothstep(radius - lensWidth * 0.35, radius + lensWidth * 0.65, d);
  float reveal = smoothstep(-lensWidth * 0.7, lensWidth * 0.8, radius - d);

  // A travelling magnifying lens: content under the bubble bends toward the
  // click origin, while the outer rim bends sharply in the opposite direction.
  float magnify = lensInterior * life;
  vec2 pivot = u_origin / u_resolution;
  vec2 lensUv = pivot + (v_uv - pivot) * (1.0 - 0.105 * magnify);
  vec2 rimPull = dir * lensBand * life * 56.0 / u_resolution;
  float chroma = lensBand * life * 4.4 / min(u_resolution.x, u_resolution.y);

  vec4 fromColor = sampleChromatic(u_from, lensUv + rimPull * 0.78, dir, chroma);
  vec4 toColor = sampleChromatic(u_to, lensUv - rimPull * 0.42, -dir, chroma * 0.72);
  vec4 color = mix(fromColor, toColor, reveal);
  color.rgb += lensBand * life * vec3(0.22, 0.26, 0.30);
  color.rgb -= lensInterior * life * 0.055;
  gl_FragColor = color;
}
`,
);

export const noiseRipple = createWebGLTransition(
  'Flux Ring Ripple',
  1420,
  `
float colorDodge(float base, float blend) {
  return blend >= 0.995 ? 1.0 : min(base / (1.0 - blend), 1.0);
}

void main() {
  vec2 uv = v_uv;
  vec2 center = u_origin / u_resolution;
  vec2 p = uv - center;
  float aspect = u_resolution.x / u_resolution.y;
  p.x *= aspect;

  float dist = length(p);
  float maxDist = length(vec2(max(center.x, 1.0 - center.x) * aspect, max(center.y, 1.0 - center.y)));
  float normDist = clamp(dist / maxDist, 0.0, 1.0);

  float sigma = 0.15;
  float waveFreq = 5.0;
  float pushAmt = 0.145;
  float caStrengthBase = 0.02;
  float glowAmount = 0.73;
  float noiseWarp = 1.0;

  float noiseLarge = fbm(p * 4.0 + vec2(u_progress * 1.0, u_progress * 0.5));
  float noiseSmall = fbm(p * 12.0 + vec2(u_progress * 2.0, -u_progress * 1.5));
  float coverage = 1.0 + 0.5 * noiseWarp + 0.1;
  float waveFront = u_progress * coverage;
  float warpScale = smoothstep(0.0, 0.05, u_progress);
  float warpedDist =
    normDist +
    (noiseLarge - 0.5) * noiseWarp * warpScale +
    (noiseSmall - 0.5) * (noiseWarp * 0.9) * warpScale;

  float delta = warpedDist - waveFront;
  float baseEnvelope = exp(-delta * delta / (2.0 * sigma * sigma));
  float ripples = max(0.0, cos(delta * waveFreq));
  float envelope = baseEnvelope * ripples;
  float gate = smoothstep(0.0, 0.05, u_progress) * (1.0 - smoothstep(0.85, 1.0, u_progress));
  envelope *= gate;

  vec2 dir = dist > 0.001 ? normalize(p) : vec2(0.0);
  float pinchSigma = 0.10;
  float pinchG = exp(-dist * dist / (2.0 * pinchSigma * pinchSigma));
  float pinchPulse = (1.0 - smoothstep(0.0, 0.42, u_progress)) * 0.3;
  float pinchDisp = (dist / (pinchSigma * pinchSigma)) * pinchG * 0.01 * pinchPulse;
  vec2 toEdge = min(uv, 1.0 - uv);
  float edgeFade = smoothstep(0.0, 0.14, min(toEdge.x, toEdge.y));
  pinchDisp *= edgeFade;

  vec2 uvOffset = dir * (envelope * pushAmt - pinchDisp);
  uvOffset.x /= aspect;
  vec2 caOffset = dir * envelope * caStrengthBase;
  caOffset.x /= aspect;

  vec4 fromColor = vec4(
    texture2D(u_from, clamp(uv - uvOffset - caOffset, 0.0, 1.0)).r,
    texture2D(u_from, clamp(uv - uvOffset, 0.0, 1.0)).g,
    texture2D(u_from, clamp(uv - uvOffset + caOffset, 0.0, 1.0)).b,
    1.0
  );
  vec4 toColor = vec4(
    texture2D(u_to, clamp(uv - uvOffset - caOffset, 0.0, 1.0)).r,
    texture2D(u_to, clamp(uv - uvOffset, 0.0, 1.0)).g,
    texture2D(u_to, clamp(uv - uvOffset + caOffset, 0.0, 1.0)).b,
    1.0
  );

  float feather = 0.04 + 0.05 * noiseLarge;
  float reveal = smoothstep(waveFront + feather, waveFront - feather, warpedDist);
  reveal *= smoothstep(0.0, 0.05, u_progress);
  vec4 color = mix(fromColor, toColor, reveal);

  float glow = envelope * glowAmount;
  color.r = colorDodge(color.r, glow);
  color.g = colorDodge(color.g, glow);
  color.b = colorDodge(color.b, glow);
  color.rgb *= 1.0 - 0.16 * pinchG * edgeFade * pinchPulse;
  gl_FragColor = vec4(clamp(color.rgb, 0.0, 1.0), 1.0);
}
`,
);

export const glimmSweep = createWebGLTransition(
  'Prism Light Sweep',
  860,
  `
vec3 cosinePalette(float t) {
  vec3 a = vec3(0.48, 0.42, 0.62);
  vec3 b = vec3(0.52, 0.45, 0.38);
  vec3 c = vec3(1.00, 0.86, 0.72);
  vec3 d = vec3(0.02, 0.23, 0.48);
  return a + b * cos(6.2831853 * (c * t + d));
}

void main() {
  vec2 px = v_uv * u_resolution;
  vec2 axis = normalize(vec2(1.0, -0.16));
  vec2 normal = vec2(-axis.y, axis.x);
  float travel = u_progress * (u_resolution.x + 360.0) - 180.0;
  float coord = dot(px, axis);
  float bandCoord = coord - travel;
  float wave = sin(dot(px, normal) * 0.027 + u_time * 5.6) * 18.0;
  wave += sin(dot(px, normal) * 0.061 - u_time * 4.2) * 7.0;
  float signedBand = bandCoord + wave;
  float band = exp(-signedBand * signedBand * 0.00042);
  float core = exp(-signedBand * signedBand * 0.0018);
  float reveal = smoothstep(-64.0, 46.0, -signedBand);
  float ripple = sin(dot(px, normal) * 0.16 + u_time * 8.0) * band;
  vec2 offset = normal * ripple * 20.0 / u_resolution + axis * core * 10.0 / u_resolution;
  float chroma = band * 5.4 / min(u_resolution.x, u_resolution.y);
  vec4 fromColor = sampleChromatic(u_from, v_uv + offset, normal, chroma);
  vec4 toColor = sampleChromatic(u_to, v_uv - offset * 0.45, -normal, chroma * 0.7);
  vec4 color = mix(fromColor, toColor, reveal);
  vec3 glow = cosinePalette(coord * 0.004 + u_time * 0.22);
  color.rgb = mix(color.rgb, glow, band * 0.55);
  color.rgb += core * vec3(0.55, 0.50, 0.62);
  color.rgb *= 1.0 + band * 0.18;
  gl_FragColor = color;
}
`,
);

export const inkBloom = createWebGLTransition(
  'Blooming Ink Drift',
  1260,
  `
void main() {
  vec2 px = v_uv * u_resolution;
  vec2 delta = px - u_origin;
  float d = length(delta);
  float angle = atan(delta.y, delta.x);
  vec2 domain = px / u_resolution.y;
  float n = fbm(domain * 3.8 + vec2(u_time * 0.16, -u_time * 0.12));
  float petal = fbm(vec2(angle * 2.2, d * 0.008) + u_time * 0.18);
  float radius = u_progress * (u_max_distance + 180.0);
  float edge = d - radius - (n - 0.5) * 120.0 * sin(3.14159265 * u_progress) - (petal - 0.5) * 80.0;
  float reveal = 1.0 - smoothstep(-74.0, 46.0, edge);
  float feather = 1.0 - smoothstep(0.0, 120.0, abs(edge));
  vec2 flow = vec2(valueNoise(domain * 9.0 + u_time), valueNoise(domain * 9.0 - u_time)) - 0.5;
  vec2 uv = v_uv + flow * feather * 0.045;
  vec4 fromColor = texture2D(u_from, clamp(uv, 0.0, 1.0));
  vec4 toColor = texture2D(u_to, clamp(v_uv - flow * feather * 0.03, 0.0, 1.0));
  vec4 color = mix(fromColor, toColor, reveal);
  color.rgb -= feather * (1.0 - reveal) * 0.18;
  color.rgb += feather * reveal * vec3(0.06, 0.04, 0.08);
  gl_FragColor = color;
}
`,
);

export const auroraFlow = createWebGLTransition(
  'Polar Light Veil',
  1120,
  `
void main() {
  vec2 px = v_uv * u_resolution;
  vec2 delta = px - u_origin;
  vec2 domain = px / u_resolution.y;
  vec2 drift = vec2(u_time * 0.16, u_progress * 1.15);
  float low = valueNoise(domain * 2.15 + drift);
  float mid = valueNoise(domain * 4.4 - drift * 0.7) * 0.5;
  float flow = low * 0.72 + mid;
  float ribbonA = sin(domain.y * 7.4 + flow * 4.6 - u_progress * 8.4 + delta.x * 0.0032);
  float ribbonB = sin(domain.y * 12.0 - domain.x * 2.1 + flow * 2.6 - u_progress * 5.2);
  float band = smoothstep(0.28, 0.9, 0.5 + 0.36 * ribbonA + 0.18 * ribbonB);
  float front = dot(px - u_origin, normalize(vec2(0.55, 0.84))) + u_progress * (u_resolution.x + u_resolution.y) - u_resolution.y * 0.55;
  float settle = smoothstep(0.84, 1.0, u_progress);
  float reveal = smoothstep(-100.0, 88.0, front + (flow - 0.5) * 160.0);
  reveal = mix(reveal, 1.0, settle);
  band *= 1.0 - settle;
  vec2 flowOffset = vec2(ribbonB * 0.45, flow - 0.5) * band * 48.0 / u_resolution;
  vec4 fromColor = texture2D(u_from, clamp(v_uv + flowOffset, 0.0, 1.0));
  vec4 toColor = texture2D(u_to, clamp(v_uv - flowOffset * 0.55, 0.0, 1.0));
  vec4 color = mix(fromColor, toColor, reveal);
  color.rgb += band * (1.0 - abs(reveal - 0.5) * 1.4) * vec3(0.08, 0.22, 0.26);
  color.rgb += pow(band, 8.0) * vec3(0.10, 0.28, 0.34);
  gl_FragColor = color;
}
`,
);

export const glassShatterWave = createWebGLTransition(
  'Shattered Glass Burst',
  1160,
  `
void main() {
  vec2 px = v_uv * u_resolution;
  vec2 delta = px - u_origin;
  float d = length(delta);
  vec2 dir = d > 0.001 ? delta / d : vec2(0.0);
  vec2 cell = floor(px / 54.0);
  vec2 local = fract(px / 54.0) - 0.5;
  float shard = hash21(cell);
  float shard2 = hash21(cell + 19.7);
  vec2 shardDir = normalize(vec2(shard - 0.5, shard2 - 0.5));
  float radius = u_progress * (u_max_distance + 160.0);
  float active = smoothstep(-40.0, 70.0, radius - d);
  float settle = smoothstep(0.68, 1.0, u_progress);
  float crack = smoothstep(0.018, 0.0, abs(local.x * shardDir.y - local.y * shardDir.x));
  vec2 offset = shardDir * active * (1.0 - settle) * (28.0 + shard * 44.0) / u_resolution;
  float reveal = active;
  float chroma = crack * active * 3.8 / min(u_resolution.x, u_resolution.y);
  vec4 fromColor = sampleChromatic(u_from, v_uv + offset, shardDir, chroma);
  vec4 toColor = sampleChromatic(u_to, v_uv - offset * 0.35, -shardDir, chroma * 0.7);
  vec4 color = mix(fromColor, toColor, reveal);
  color.rgb += crack * active * (1.0 - settle) * vec3(0.32, 0.36, 0.42);
  color.rgb -= active * (1.0 - settle) * 0.06;
  gl_FragColor = color;
}
`,
);

export const liquidChrome = createWebGLTransition(
  'Liquid Chrome Melt',
  1320,
  `
void main() {
  vec2 px = v_uv * u_resolution;
  vec2 delta = px - u_origin;
  float d = length(delta);
  vec2 dir = d > 0.001 ? delta / d : vec2(0.0);
  float life = sin(3.14159265 * u_progress);
  vec2 domain = px / u_resolution.y;

  float flow = fbm(domain * 3.2 + vec2(u_time * 0.4, -u_time * 0.3));
  float ridges = fbm(domain * 7.5 - vec2(u_time * 0.6, u_time * 0.2));
  float radius = u_progress * (u_max_distance + 220.0);
  float edge = d - radius + (flow - 0.5) * 220.0 * life;
  float reveal = 1.0 - smoothstep(-90.0, 70.0, edge);
  float band = 1.0 - smoothstep(0.0, 150.0, abs(edge));

  vec2 metalGrad = vec2(
    fbm(domain * 6.0 + vec2(0.04, 0.0)) - flow,
    fbm(domain * 6.0 + vec2(0.0, 0.04)) - flow
  );
  vec2 warp = (dir * band * 70.0 + metalGrad * band * 120.0) / u_resolution;
  float chroma = band * life * 6.5 / min(u_resolution.x, u_resolution.y);

  vec4 fromColor = sampleChromatic(u_from, v_uv + warp, dir, chroma);
  vec4 toColor = sampleChromatic(u_to, v_uv - warp * 0.5, -dir, chroma * 0.6);
  vec4 color = mix(fromColor, toColor, reveal);

  float sheen = pow(max(0.0, 0.5 + 0.5 * sin(ridges * 9.0 + edge * 0.05)), 6.0) * band * life;
  float rim = pow(band, 2.5) * life;
  color.rgb += sheen * vec3(0.55, 0.62, 0.78);
  color.rgb += rim * vec3(0.30, 0.36, 0.50);
  color.rgb = mix(color.rgb, color.rgb * vec3(0.78, 0.86, 1.06), rim * 0.6);
  gl_FragColor = color;
}
`,
);

export const hyperspaceWarp = createWebGLTransition(
  'Hyperspace Light Warp',
  1080,
  `
void main() {
  vec2 center = u_origin / u_resolution;
  vec2 rel = v_uv - center;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 arel = vec2(rel.x * aspect, rel.y);
  float dist = length(arel);
  float angle = atan(arel.y, arel.x);
  float life = sin(3.14159265 * u_progress);

  float streak = fbm(vec2(angle * 5.0, dist * 3.0 - u_time * 4.0));
  float streak2 = fbm(vec2(angle * 11.0 + 4.0, dist * 6.0 - u_time * 7.0));
  float warpAmount = (0.18 + streak * 0.5 + streak2 * 0.3) * life;
  vec2 pull = normalize(rel + 1e-4) * warpAmount * (0.25 + u_progress * 0.9);

  float reveal = smoothstep(0.0, 1.0, u_progress * 1.45 - dist * 0.85);
  float chroma = warpAmount * 7.0 / min(u_resolution.x, u_resolution.y);
  vec2 radialDir = normalize(rel + 1e-4);

  vec4 fromColor = sampleChromatic(u_from, clamp(v_uv + pull, 0.0, 1.0), radialDir, chroma);
  vec4 toColor = sampleChromatic(u_to, clamp(v_uv - pull * 0.4, 0.0, 1.0), -radialDir, chroma * 0.7);
  vec4 color = mix(fromColor, toColor, reveal);

  float lines = pow(max(0.0, streak2), 3.0) * life * (1.0 - reveal);
  float core = exp(-dist * 4.5) * life;
  color.rgb += lines * vec3(0.40, 0.55, 0.95);
  color.rgb += core * vec3(0.6, 0.7, 1.0);
  gl_FragColor = color;
}
`,
);

export const kaleidoscopeBloom = createWebGLTransition(
  'Kaleidoscope Bloom',
  1240,
  `
void main() {
  vec2 center = u_origin / u_resolution;
  vec2 rel = v_uv - center;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 arel = vec2(rel.x * aspect, rel.y);
  float r = length(arel);
  float a = atan(arel.y, arel.x);
  float life = sin(3.14159265 * u_progress);

  float segments = 8.0;
  float wedge = 6.2831853 / segments;
  float spin = u_time * 0.8 + u_progress * 2.2;
  float folded = mod(a + spin, wedge);
  folded = abs(folded - wedge * 0.5);
  vec2 kuv = center + vec2(cos(folded), sin(folded)) * r / vec2(aspect, 1.0);

  float petals = 0.5 + 0.5 * sin(folded * segments * 1.5 + r * 14.0 - u_time * 3.0);
  float bloom = smoothstep(0.0, 1.0, u_progress * 1.5 - r * 1.1);
  float mirrorMix = (1.0 - bloom) * life;
  vec2 sampleUv = mix(v_uv, clamp(kuv, 0.0, 1.0), mirrorMix);

  float chroma = petals * life * 4.0 / min(u_resolution.x, u_resolution.y);
  vec2 dir = normalize(rel + 1e-4);
  vec4 fromColor = sampleChromatic(u_from, sampleUv, dir, chroma);
  vec4 toColor = sampleChromatic(u_to, sampleUv, dir, chroma * 0.6);
  vec4 color = mix(fromColor, toColor, bloom);

  color.rgb += petals * mirrorMix * vec3(0.22, 0.18, 0.30);
  color.rgb += pow(petals, 5.0) * life * vec3(0.30, 0.26, 0.40);
  gl_FragColor = color;
}
`,
);

export const voltArc = createWebGLTransition(
  'Electric Arc Surge',
  1100,
  `
void main() {
  vec2 px = v_uv * u_resolution;
  vec2 delta = px - u_origin;
  float d = length(delta);
  vec2 dir = d > 0.001 ? delta / d : vec2(0.0);
  float angle = atan(delta.y, delta.x);
  float life = sin(3.14159265 * u_progress);

  float radius = u_progress * (u_max_distance + 180.0);
  float jag = fbm(vec2(angle * 6.0, d * 0.012 - u_time * 3.0)) - 0.5;
  float edge = d - radius + jag * 150.0 * life;
  float reveal = 1.0 - smoothstep(-60.0, 60.0, edge);
  float band = 1.0 - smoothstep(0.0, 90.0, abs(edge));

  float bolt = pow(max(0.0, 1.0 - abs(jag) * 6.0), 4.0) * band * life;
  float branches = pow(max(0.0, fbm(vec2(angle * 18.0, d * 0.05 - u_time * 6.0))), 5.0) * band * life;
  float flicker = 0.7 + 0.3 * sin(u_time * 40.0 + angle * 10.0);

  float chroma = band * life * 5.5 / min(u_resolution.x, u_resolution.y);
  vec2 jitter = dir * band * 30.0 / u_resolution;
  vec4 fromColor = sampleChromatic(u_from, v_uv + jitter, dir, chroma);
  vec4 toColor = sampleChromatic(u_to, v_uv - jitter * 0.4, -dir, chroma * 0.6);
  vec4 color = mix(fromColor, toColor, reveal);

  color.rgb += bolt * flicker * vec3(0.55, 0.78, 1.05);
  color.rgb += branches * flicker * vec3(0.40, 0.62, 1.0);
  color.rgb += pow(band, 3.0) * life * vec3(0.18, 0.30, 0.55);
  gl_FragColor = color;
}
`,
);

export const shockHalo = createWebGLTransition(
  'Energy Halo Blast',
  1160,
  `
void main() {
  vec2 px = v_uv * u_resolution;
  vec2 delta = px - u_origin;
  float d = length(delta);
  vec2 dir = d > 0.001 ? delta / d : vec2(0.0);
  float life = sin(3.14159265 * u_progress);

  float radius = u_progress * (u_max_distance + 200.0);
  float front = d - radius;
  float reveal = 1.0 - smoothstep(-30.0, 50.0, front);

  float rings = sin(front * 0.07 - u_time * 6.0);
  float ringEnergy = exp(-abs(front) * 0.006) * life;
  float halo = pow(max(0.0, rings), 3.0) * ringEnergy;
  float compress = (1.0 - smoothstep(0.0, 120.0, abs(front))) * life;

  vec2 push = dir * (halo * 60.0 - compress * 26.0) / u_resolution;
  float chroma = ringEnergy * 6.0 / min(u_resolution.x, u_resolution.y);
  vec4 fromColor = sampleChromatic(u_from, v_uv + push, dir, chroma);
  vec4 toColor = sampleChromatic(u_to, v_uv - push * 0.4, -dir, chroma * 0.6);
  vec4 color = mix(fromColor, toColor, reveal);

  color.rgb += halo * vec3(0.30, 0.45, 0.70);
  color.rgb += pow(max(0.0, rings), 8.0) * ringEnergy * vec3(0.5, 0.6, 0.9);
  color.rgb -= compress * 0.05;
  gl_FragColor = color;
}
`,
);

export const digitalGlitch = createWebGLTransition(
  'Digital Glitch Tear',
  920,
  `
void main() {
  float life = sin(3.14159265 * u_progress);

  float band = floor(v_uv.y * 26.0);
  float seed = hash21(vec2(band, floor(u_time * 18.0)));
  float seed2 = hash21(vec2(band + 7.0, floor(u_time * 24.0)));
  float slice = (seed - 0.5) * 0.22 * life;
  float blockShift = step(0.82, seed2) * (seed2 - 0.91) * 0.6 * life;
  vec2 tornUv = vec2(v_uv.x + slice + blockShift, v_uv.y);

  float threshold = hash21(vec2(band, 3.0));
  float reveal = smoothstep(threshold - 0.15, threshold + 0.15, u_progress);

  float ca = (0.006 + seed * 0.02) * life;
  vec4 fromColor;
  fromColor.r = texture2D(u_from, clamp(tornUv + vec2(ca, 0.0), 0.0, 1.0)).r;
  fromColor.g = texture2D(u_from, clamp(tornUv, 0.0, 1.0)).g;
  fromColor.b = texture2D(u_from, clamp(tornUv - vec2(ca, 0.0), 0.0, 1.0)).b;
  fromColor.a = 1.0;

  vec4 toColor;
  toColor.r = texture2D(u_to, clamp(vec2(v_uv.x + blockShift, v_uv.y) + vec2(ca, 0.0), 0.0, 1.0)).r;
  toColor.g = texture2D(u_to, clamp(vec2(v_uv.x + blockShift, v_uv.y), 0.0, 1.0)).g;
  toColor.b = texture2D(u_to, clamp(vec2(v_uv.x + blockShift, v_uv.y) - vec2(ca, 0.0), 0.0, 1.0)).b;
  toColor.a = 1.0;

  vec4 color = mix(fromColor, toColor, reveal);

  float scan = 0.92 + 0.08 * sin(v_uv.y * u_resolution.y * 1.6);
  float sparkle = step(0.97, hash21(v_uv * u_resolution + u_time)) * life;
  color.rgb *= scan;
  color.rgb += sparkle * 0.4;
  color.rgb += step(0.86, seed2) * life * vec3(0.0, 0.18, 0.22);
  gl_FragColor = color;
}
`,
);

export const vortexSwirl = createWebGLTransition(
  'Spiral Vortex Pull',
  1260,
  `
void main() {
  vec2 center = u_origin / u_resolution;
  vec2 rel = v_uv - center;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 arel = vec2(rel.x * aspect, rel.y);
  float r = length(arel);
  float a = atan(arel.y, arel.x);
  float life = sin(3.14159265 * u_progress);

  float twist = (2.6 / (r + 0.18)) * life;
  float swirlA = a + twist;
  vec2 swirled = center + vec2(cos(swirlA), sin(swirlA)) * r / vec2(aspect, 1.0);

  float reveal = smoothstep(0.0, 1.0, u_progress * 1.5 - r * 1.0);
  float spokes = 0.5 + 0.5 * sin(swirlA * 6.0 - u_time * 4.0);
  float chroma = life * (1.0 - r) * 5.0 / min(u_resolution.x, u_resolution.y);
  vec2 tangent = vec2(-arel.y, arel.x) / (r + 0.001);

  vec4 fromColor = sampleChromatic(u_from, clamp(swirled, 0.0, 1.0), tangent, chroma);
  vec4 toColor = sampleChromatic(u_to, clamp(mix(swirled, v_uv, reveal), 0.0, 1.0), tangent, chroma * 0.5);
  vec4 color = mix(fromColor, toColor, reveal);

  color.rgb += spokes * life * (1.0 - reveal) * vec3(0.14, 0.16, 0.26);
  color.rgb += exp(-r * 5.0) * life * vec3(0.3, 0.34, 0.5);
  gl_FragColor = color;
}
`,
);
