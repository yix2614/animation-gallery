import { blitFull, drawCellTile } from './types';
import type { TileTransition } from './types';

const DELAY_PER_PX = 0.85;
const DURATION = 460;

/**
 * Venetian flip: each tile collapses vertically showing the outgoing theme,
 * then unfolds with the incoming one, cascading out from the click point.
 * Persistent canvas: only animating tiles repaint each frame.
 */
export const pixelFlip: TileTransition = {
  name: 'Tile Flip Array',

  draw(env, now) {
    const { ctx, cells, cellSize, dpr } = env;
    const duration = DURATION * env.speed;
    const delayPerPx = DELAY_PER_PX * env.speed;
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
      const distance = Math.hypot(cell.centerX - env.x, cell.centerY - env.y);
      const t = (elapsed - distance * delayPerPx) / duration;

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

      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(cell.x, cell.y, cellSize, cellSize);

      const fold = Math.abs(Math.cos(Math.PI * t));
      const height = cellSize * fold;
      const top = cell.centerY - height / 2;
      const source = t < 0.5 ? env.roundedFrom : env.roundedTo;

      ctx.drawImage(source, cell.x * dpr, cell.y * dpr, cellSize * dpr, cellSize * dpr, cell.x, top, cellSize, height);

      // Shade deepens as the tile turns edge-on, selling the fold.
      const shade = 0.28 * Math.sin(Math.PI * t);
      ctx.fillStyle = `rgba(0, 0, 0, ${shade.toFixed(3)})`;
      ctx.fillRect(cell.x, top, cellSize, height);
    }

    return allDone;
  },
};
