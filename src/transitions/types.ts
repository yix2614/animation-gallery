export type Cell = {
  x: number;
  y: number;
  centerX: number;
  centerY: number;
};

/**
 * Everything a transition needs to paint one frame. The engine owns the theme
 * surfaces: `from`/`to` are full opaque renders of the outgoing and incoming
 * theme, `roundedFrom`/`roundedTo` are the same surfaces with transparent
 * rounded tile corners for mid-animation tiles.
 */
export type TransitionEnv = {
  ctx: CanvasRenderingContext2D;
  from: HTMLCanvasElement;
  to: HTMLCanvasElement;
  roundedFrom: HTMLCanvasElement;
  roundedTo: HTMLCanvasElement;
  cells: Cell[];
  cellSize: number;
  dpr: number;
  width: number;
  height: number;
  maxDistance: number;
  /** Time multiplier: 1 normally, ~0 when the user prefers reduced motion. */
  speed: number;
  /** Wave origin (click position) and start timestamp. */
  x: number;
  y: number;
  start: number;
  /**
   * True on the first frame of a wave (and again if the underlying theme
   * surfaces were repainted mid-wave). Persistent transitions repaint their
   * base layer when this is set.
   */
  firstFrame: boolean;
  /** Per-cell scratch flags, zeroed at wave start. */
  done: Uint8Array;
};

export type TileTransition = {
  name: string;
  /** Paint one frame; return true once every tile has settled. */
  draw(env: TransitionEnv, now: number): boolean;
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function easeOutCubic(p: number) {
  return 1 - Math.pow(1 - p, 3);
}

export function easeInOutCubic(p: number) {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

export function smoothstep(p: number) {
  return p * p * (3 - 2 * p);
}

/** Deterministic pseudo-random in [0, 1) from an integer seed. */
export function hash01(seed: number) {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

export function blitFull(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  width: number,
  height: number,
) {
  ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, width, height);
}

/** Draw one cell-sized tile from a theme surface, scaled around its center. */
export function drawCellTile(
  env: TransitionEnv,
  source: HTMLCanvasElement,
  cell: Cell,
  scale = 1,
  offsetX = 0,
  offsetY = 0,
) {
  const size = env.cellSize * scale;
  env.ctx.drawImage(
    source,
    cell.x * env.dpr,
    cell.y * env.dpr,
    env.cellSize * env.dpr,
    env.cellSize * env.dpr,
    cell.centerX + offsetX - size / 2,
    cell.centerY + offsetY - size / 2,
    size,
    size,
  );
}
