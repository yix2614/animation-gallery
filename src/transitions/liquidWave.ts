import { blitFull, clamp, easeInOutCubic } from './types';
import type { TileTransition, TransitionEnv } from './types';

const DURATION = 1280;

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D u_from;
uniform sampler2D u_to;
uniform vec2 u_resolution;
uniform vec2 u_origin;
uniform float u_progress;
uniform float u_max_distance;
uniform float u_time;

varying vec2 v_uv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rotate = mat2(0.80, 0.60, -0.60, 0.80);

  for (int i = 0; i < 5; i++) {
    value += amplitude * valueNoise(p);
    p = rotate * p * 2.05 + vec2(17.2, 8.4);
    amplitude *= 0.5;
  }

  return value;
}

vec2 fbmGradient(vec2 p) {
  float e = 0.035;
  float center = fbm(p);
  return vec2(fbm(p + vec2(e, 0.0)) - center, fbm(p + vec2(0.0, e)) - center) / e;
}

void main() {
  vec2 px = v_uv * u_resolution;
  vec2 delta = px - u_origin;
  float distanceFromOrigin = length(delta);
  vec2 direction = distanceFromOrigin > 0.001 ? delta / distanceFromOrigin : vec2(0.0);
  vec2 tangent = vec2(-direction.y, direction.x);
  float aspect = u_resolution.x / u_resolution.y;

  float eased = u_progress * u_progress * (3.0 - 2.0 * u_progress);
  float life = sin(3.14159265 * u_progress);
  vec2 domain = vec2(px.x / u_resolution.y, px.y / u_resolution.y);
  vec2 flowDomain = domain * 5.4 + vec2(u_time * 0.15, -u_time * 0.12);
  float surfaceNoise = fbm(flowDomain + direction * 0.55);
  float angularNoise = fbm(vec2(atan(delta.y, delta.x) * 2.3, distanceFromOrigin * 0.01) + u_time * 0.18);
  float radius = eased * (u_max_distance + 130.0);
  float signedDistance = distanceFromOrigin - radius;

  float reveal = 1.0 - smoothstep(-42.0, 34.0, signedDistance);
  float front = 1.0 - smoothstep(0.0, 44.0, abs(signedDistance));

  float waveCoord = distanceFromOrigin - radius;
  float ringFrequency = 0.118;
  float ringPhase = waveCoord * ringFrequency + angularNoise * 0.8;
  float ringEnvelope =
    exp(-abs(waveCoord) * 0.011) *
    smoothstep(-330.0, -10.0, waveCoord) *
    (1.0 - smoothstep(170.0, 390.0, waveCoord));
  float ringTrain = sin(ringPhase) * ringEnvelope * life;
  float fineRings = sin(waveCoord * 0.24 - u_time * 3.0 + surfaceNoise * 2.2) * ringEnvelope * 0.18 * life;
  float ripples = ringTrain + fineRings;

  float crest =
    pow(max(0.0, 0.5 + 0.5 * sin(ringPhase)), 1.55) *
    ringEnvelope *
    life;
  float trough =
    pow(max(0.0, 0.5 - 0.5 * sin(ringPhase)), 1.45) *
    ringEnvelope *
    life;
  float wake = exp(-abs(waveCoord + 105.0) * 0.015) * life * 0.38;
  float backwash = exp(-abs(waveCoord + 210.0) * 0.012) * life * 0.2;

  vec2 grad = fbmGradient(flowDomain + ripples * 0.06);
  vec2 curl = vec2(grad.y, -grad.x);

  float liquid = crest * 1.4 + trough * 0.75 + wake + backwash;
  vec2 displacementPx =
    direction * ((ripples * 58.0) + liquid * 14.0) +
    tangent * ((surfaceNoise - 0.5) * liquid * 18.0) +
    curl * (life * 18.0 * (front + ringEnvelope * 0.35));
  vec2 displacement = displacementPx / u_resolution;

  float chroma = crest * life * 2.6 / min(u_resolution.x, u_resolution.y);
  vec2 uvFrom = clamp(v_uv + displacement * 0.72, 0.0, 1.0);
  vec2 uvTo = clamp(v_uv - displacement * 0.58, 0.0, 1.0);

  vec4 outgoing;
  outgoing.r = texture2D(u_from, clamp(uvFrom + direction * chroma, 0.0, 1.0)).r;
  outgoing.g = texture2D(u_from, uvFrom).g;
  outgoing.b = texture2D(u_from, clamp(uvFrom - direction * chroma, 0.0, 1.0)).b;
  outgoing.a = 1.0;

  vec4 incoming;
  incoming.r = texture2D(u_to, clamp(uvTo - direction * chroma * 0.8, 0.0, 1.0)).r;
  incoming.g = texture2D(u_to, uvTo).g;
  incoming.b = texture2D(u_to, clamp(uvTo + direction * chroma * 0.8, 0.0, 1.0)).b;
  incoming.a = 1.0;

  float revealWithFoam = clamp(reveal + front * 0.04 + ringTrain * 0.035, 0.0, 1.0);
  vec4 color = mix(outgoing, incoming, revealWithFoam);

  float mainBrightRing = smoothstep(0.22, 0.78, crest) * ringEnvelope;
  float mainDarkRing = smoothstep(0.2, 0.74, trough) * ringEnvelope;
  float caustic =
    pow(max(0.0, sin((px.x * aspect + px.y) * 0.036 + u_time * 7.0 + surfaceNoise * 6.0)), 8.0) *
    (crest + wake * 0.42) * life;
  float foam = smoothstep(0.5, 1.0, crest * (0.48 + 0.52 * fbm(domain * 22.0 - u_time * 0.65))) * life;

  color.rgb += caustic * vec3(0.16, 0.25, 0.34);
  color.rgb += foam * vec3(0.12, 0.16, 0.18);
  color.rgb += mainBrightRing * vec3(0.16, 0.20, 0.25);
  color.rgb -= mainDarkRing * 0.14;
  color.rgb += crest * vec3(0.035, 0.05, 0.065);
  color.rgb -= trough * 0.045;
  color.rgb -= backwash * 0.035;

  gl_FragColor = color;
}
`;

type LiquidRenderer = {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  positionBuffer: WebGLBuffer;
  fromTexture: WebGLTexture;
  toTexture: WebGLTexture;
  locations: {
    position: number;
    from: WebGLUniformLocation;
    to: WebGLUniformLocation;
    resolution: WebGLUniformLocation;
    origin: WebGLUniformLocation;
    progress: WebGLUniformLocation;
    maxDistance: WebGLUniformLocation;
    time: WebGLUniformLocation;
  };
};

let renderer: LiquidRenderer | null = null;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Unable to create WebGL shader.');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader compile error.';
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function requireUniform(gl: WebGLRenderingContext, program: WebGLProgram, name: string) {
  const location = gl.getUniformLocation(program, name);
  if (!location) {
    throw new Error(`Missing WebGL uniform ${name}.`);
  }
  return location;
}

function createRenderer() {
  const canvas = document.createElement('canvas');
  const gl =
    canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    }) || null;

  if (!gl) {
    return null;
  }

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) {
    throw new Error('Unable to create WebGL program.');
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'Unknown WebGL link error.');
  }

  const positionBuffer = gl.createBuffer();
  const fromTexture = gl.createTexture();
  const toTexture = gl.createTexture();
  if (!positionBuffer || !fromTexture || !toTexture) {
    throw new Error('Unable to allocate WebGL buffers.');
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  for (const texture of [fromTexture, toTexture]) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  return {
    canvas,
    gl,
    program,
    positionBuffer,
    fromTexture,
    toTexture,
    locations: {
      position: gl.getAttribLocation(program, 'a_position'),
      from: requireUniform(gl, program, 'u_from'),
      to: requireUniform(gl, program, 'u_to'),
      resolution: requireUniform(gl, program, 'u_resolution'),
      origin: requireUniform(gl, program, 'u_origin'),
      progress: requireUniform(gl, program, 'u_progress'),
      maxDistance: requireUniform(gl, program, 'u_max_distance'),
      time: requireUniform(gl, program, 'u_time'),
    },
  };
}

function uploadTexture(gl: WebGLRenderingContext, texture: WebGLTexture, source: HTMLCanvasElement) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
}

function drawWithWebGL(env: TransitionEnv, now: number, progress: number) {
  renderer ??= createRenderer();
  if (!renderer) {
    return false;
  }

  const { canvas, gl, program, positionBuffer, fromTexture, toTexture, locations } = renderer;
  if (canvas.width !== env.from.width || canvas.height !== env.from.height) {
    canvas.width = env.from.width;
    canvas.height = env.from.height;
  }

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(program);

  uploadTexture(gl, fromTexture, env.from);
  uploadTexture(gl, toTexture, env.to);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fromTexture);
  gl.uniform1i(locations.from, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, toTexture);
  gl.uniform1i(locations.to, 1);

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(locations.position);
  gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);

  gl.uniform2f(locations.resolution, env.width, env.height);
  gl.uniform2f(locations.origin, env.x, env.y);
  gl.uniform1f(locations.progress, progress);
  gl.uniform1f(locations.maxDistance, env.maxDistance);
  gl.uniform1f(locations.time, (now - env.start) / 1000);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  env.ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, env.width, env.height);
  return true;
}

/**
 * Liquid wave: a WebGL shader transition. The outgoing and incoming canvases
 * become textures; the fragment shader performs radial reveal, refraction,
 * turbulence, and a bright liquid rim from the click origin.
 */
export const liquidWave: TileTransition = {
  name: 'Midnight Black Tide',

  draw(env, now) {
    const t = clamp((now - env.start) / (DURATION * env.speed), 0, 1);
    const progress = easeInOutCubic(t);

    try {
      if (drawWithWebGL(env, now, progress)) {
        return t >= 1;
      }
    } catch (error) {
      console.warn('Liquid Wave WebGL fallback:', error);
    }

    blitFull(env.ctx, t < 1 ? env.from : env.to, env.width, env.height);
    return t >= 1;
  },
};
