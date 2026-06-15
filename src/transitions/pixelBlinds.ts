import { blitFull, drawCellTile, easeOutCubic, hash01 } from './types';
import type { TileTransition } from './types';

const DIAGONAL_DELAY = 0.55;
const JITTER = 90;
const DURATION = 380;

/**
 * Shutter cascade: the incoming theme rolls down inside each tile like a
 * blind closing, sweeping diagonally across the grid with a little jitter.
 * Persistent canvas: only animating tiles repaint each frame.
 */
export const pixelBlinds: TileTransition = {
  name: 'Slatted Screen Sweep',

  draw(env, now) {
    const { ctx, cells, cellSize, dpr } = env;
    const duration = DURATION * env.speed;
    const elapsed = now - env.start;

    if (env.firstFrame) {
      blitFull(ctx, env.from, env.width, env.height);
    }

    let allDone = true;

    for (let i = 0; i < cells.length; i += 1) {
      if (env.done[i]) {
        continue;
      }
      const cell = cells[i];
      const delay = ((cell.x + cell.y) * DIAGONAL_DELAY + hash01(i + 1) * JITTER) * env.speed;
      const t = (elapsed - delay) / duration;

      if (t <= 0) {
        allDone = false;
        continue;
      }

      if (t >= 1) {
        drawCellTile(env, env.to, cell);
        env.done[i] = 1;
        continue;
      }

      allDone = false;

      const reveal = easeOutCubic(t);
      const height = cellSize * reveal;

      ctx.drawImage(env.to, cell.x * dpr, cell.y * dpr, cellSize * dpr, height * dpr, cell.x, cell.y, cellSize, height);

      // Shimmering lower edge marks the moving shutter.
      const shimmer = 0.25 * Math.sin(Math.PI * t);
      ctx.fillStyle = `rgba(255, 255, 255, ${shimmer.toFixed(3)})`;
      ctx.fillRect(cell.x, Math.max(cell.y, cell.y + height - 2), cellSize, 2);
    }

    return allDone;
  },
};
