import type { Cell, TileTransition, TransitionEnv } from '../transitions/types';

const CELL_SIZE = 32;
const TILE_CORNER = 8;

export type RunTransitionOptions = {
  transition: TileTransition;
  /** Sweep origin in CSS pixels, relative to the viewport. */
  originX: number;
  originY: number;
  /** Fill used for the outgoing surface (covers the old page as the sweep starts). */
  fromColor: string;
  /** Fill used for the incoming surface (revealed as the sweep completes). */
  toColor: string;
  /** ~0 when the user prefers reduced motion. */
  speed: number;
  /** Called once the sweep has covered the screen, before it clears. */
  onCover?: () => void;
};

/** Fill an offscreen canvas with a solid color at device resolution. */
function paintSolid(canvas: HTMLCanvasElement, color: string, dpr: number, width: number, height: number) {
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Drive one full-screen sweep on an overlay canvas, reusing a TileTransition
 * from the demo's transition set. The transition animates between two solid
 * surfaces (`fromColor` -> `toColor`), so the band reads as a colored wipe that
 * covers the outgoing view and uncovers the incoming one.
 *
 * Returns a promise that resolves when the sweep has fully settled.
 */
export function runTransition(
  overlay: HTMLCanvasElement,
  options: RunTransitionOptions,
): Promise<void> {
  const ctx = overlay.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;

  const columnCount = Math.max(1, Math.ceil(width / CELL_SIZE));
  const rowCount = Math.max(1, Math.ceil(height / CELL_SIZE));
  const gridWidth = columnCount * CELL_SIZE;
  const gridHeight = rowCount * CELL_SIZE;
  const maxDistance = Math.hypot(gridWidth, gridHeight);

  const pixelWidth = Math.max(1, Math.round(gridWidth * dpr));
  const pixelHeight = Math.max(1, Math.round(gridHeight * dpr));

  overlay.width = pixelWidth;
  overlay.height = pixelHeight;
  overlay.style.width = `${gridWidth}px`;
  overlay.style.height = `${gridHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cells: Cell[] = Array.from({ length: rowCount * columnCount }, (_, index) => {
    const x = (index % columnCount) * CELL_SIZE;
    const y = Math.floor(index / columnCount) * CELL_SIZE;
    return { x, y, centerX: x + CELL_SIZE / 2, centerY: y + CELL_SIZE / 2 };
  });
  const done = new Uint8Array(cells.length);

  const fromCanvas = document.createElement('canvas');
  const toCanvas = document.createElement('canvas');
  const roundedFrom = document.createElement('canvas');
  const roundedTo = document.createElement('canvas');
  const maskCanvas = document.createElement('canvas');
  for (const surface of [fromCanvas, toCanvas, roundedFrom, roundedTo, maskCanvas]) {
    surface.width = pixelWidth;
    surface.height = pixelHeight;
  }

  paintSolid(fromCanvas, options.fromColor, dpr, gridWidth, gridHeight);
  paintSolid(toCanvas, options.toColor, dpr, gridWidth, gridHeight);

  // Rounded-corner variants: same fill masked to rounded tiles, matching the
  // demo engine's roundedFrom/roundedTo surfaces.
  const maskCtx = maskCanvas.getContext('2d')!;
  maskCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  maskCtx.clearRect(0, 0, gridWidth, gridHeight);
  maskCtx.fillStyle = '#ffffff';
  maskCtx.beginPath();
  for (const cell of cells) {
    maskCtx.roundRect(cell.x, cell.y, CELL_SIZE, CELL_SIZE, TILE_CORNER);
  }
  maskCtx.fill();

  for (const [solid, rounded] of [
    [fromCanvas, roundedFrom],
    [toCanvas, roundedTo],
  ] as const) {
    const rc = rounded.getContext('2d')!;
    rc.setTransform(1, 0, 0, 1, 0, 0);
    rc.globalCompositeOperation = 'source-over';
    rc.drawImage(solid, 0, 0);
    rc.globalCompositeOperation = 'destination-in';
    rc.drawImage(maskCanvas, 0, 0);
    rc.globalCompositeOperation = 'source-over';
  }

  const env: TransitionEnv = {
    ctx,
    from: fromCanvas,
    to: toCanvas,
    roundedFrom,
    roundedTo,
    cells,
    cellSize: CELL_SIZE,
    dpr,
    width: gridWidth,
    height: gridHeight,
    maxDistance,
    speed: options.speed,
    x: Math.min(Math.max(options.originX, 0), gridWidth),
    y: Math.min(Math.max(options.originY, 0), gridHeight),
    start: performance.now(),
    firstFrame: true,
    done,
  };

  let coverFired = false;

  return new Promise<void>((resolve) => {
    let rafId = 0;
    const tick = (now: number) => {
      const settled = options.transition.draw(env, now);
      env.firstFrame = false;

      // Fire onCover roughly midway, once the band has meaningfully covered the
      // screen, so the caller can swap routes underneath the overlay.
      if (!coverFired && now - env.start >= 120) {
        coverFired = true;
        options.onCover?.();
      }

      if (settled) {
        cancelAnimationFrame(rafId);
        if (!coverFired) {
          options.onCover?.();
        }
        resolve();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  });
}
