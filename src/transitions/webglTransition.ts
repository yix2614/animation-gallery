import { blitFull, clamp, easeInOutCubic } from './types';
import type { TileTransition, TransitionEnv } from './types';

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_PREFIX = `
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
    p = rotate * p * 2.04 + vec2(19.1, 7.7);
    amplitude *= 0.5;
  }
  return value;
}

vec2 rotate2(vec2 p, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c) * p;
}

vec4 sampleChromatic(sampler2D tex, vec2 uv, vec2 dir, float amount) {
  vec4 color;
  color.r = texture2D(tex, clamp(uv + dir * amount, 0.0, 1.0)).r;
  color.g = texture2D(tex, clamp(uv, 0.0, 1.0)).g;
  color.b = texture2D(tex, clamp(uv - dir * amount, 0.0, 1.0)).b;
  color.a = 1.0;
  return color;
}
`;

type Renderer = {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  positionBuffer: WebGLBuffer;
  fromTexture: WebGLTexture;
  toTexture: WebGLTexture;
  textureWidth: number;
  textureHeight: number;
  texturesUploaded: boolean;
  locations: {
    position: number;
    from: WebGLUniformLocation | null;
    to: WebGLUniformLocation | null;
    resolution: WebGLUniformLocation | null;
    origin: WebGLUniformLocation | null;
    progress: WebGLUniformLocation | null;
    maxDistance: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
  };
};

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

function createRenderer(fragmentBody: string) {
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
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, `${FRAGMENT_PREFIX}\n${fragmentBody}`);
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
    textureWidth: 0,
    textureHeight: 0,
    texturesUploaded: false,
    locations: {
      position: gl.getAttribLocation(program, 'a_position'),
      from: gl.getUniformLocation(program, 'u_from'),
      to: gl.getUniformLocation(program, 'u_to'),
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      origin: gl.getUniformLocation(program, 'u_origin'),
      progress: gl.getUniformLocation(program, 'u_progress'),
      maxDistance: gl.getUniformLocation(program, 'u_max_distance'),
      time: gl.getUniformLocation(program, 'u_time'),
    },
  };
}

function uploadTexture(gl: WebGLRenderingContext, texture: WebGLTexture, source: HTMLCanvasElement) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
}

export function createWebGLTransition(name: string, duration: number, fragmentBody: string): TileTransition {
  let renderer: Renderer | null = null;

  return {
    name,

    draw(env: TransitionEnv, now: number) {
      const t = clamp((now - env.start) / (duration * env.speed), 0, 1);
      const progress = easeInOutCubic(t);

      try {
        renderer ??= createRenderer(fragmentBody);
        if (!renderer) {
          blitFull(env.ctx, t < 1 ? env.from : env.to, env.width, env.height);
          return t >= 1;
        }

        const { canvas, gl, program, positionBuffer, fromTexture, toTexture, locations } = renderer;
        if (canvas.width !== env.from.width || canvas.height !== env.from.height) {
          canvas.width = env.from.width;
          canvas.height = env.from.height;
          renderer.textureWidth = canvas.width;
          renderer.textureHeight = canvas.height;
          renderer.texturesUploaded = false;
        }

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(program);

        if (
          env.firstFrame ||
          !renderer.texturesUploaded ||
          renderer.textureWidth !== env.from.width ||
          renderer.textureHeight !== env.from.height
        ) {
          uploadTexture(gl, fromTexture, env.from);
          uploadTexture(gl, toTexture, env.to);
          renderer.textureWidth = env.from.width;
          renderer.textureHeight = env.from.height;
          renderer.texturesUploaded = true;
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, fromTexture);
        if (locations.from) {
          gl.uniform1i(locations.from, 0);
        }
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, toTexture);
        if (locations.to) {
          gl.uniform1i(locations.to, 1);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(locations.position);
        gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);

        if (locations.resolution) {
          gl.uniform2f(locations.resolution, env.width, env.height);
        }
        if (locations.origin) {
          gl.uniform2f(locations.origin, env.x, env.y);
        }
        if (locations.progress) {
          gl.uniform1f(locations.progress, progress);
        }
        if (locations.maxDistance) {
          gl.uniform1f(locations.maxDistance, env.maxDistance);
        }
        if (locations.time) {
          gl.uniform1f(locations.time, (now - env.start) / 1000);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        env.ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, env.width, env.height);
      } catch (error) {
        console.warn(`${name} WebGL fallback:`, error);
        blitFull(env.ctx, t < 1 ? env.from : env.to, env.width, env.height);
      }

      return t >= 1;
    },
  };
}
