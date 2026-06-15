import { blitFull, clamp, drawCellTile, hash01, smoothstep } from './types';
import type { TileTransition } from './types';

const STAGGER = 620;
const DISTANCE_BIAS = 0.12;
const DURATION = 340;

/**
 * Sparkle dissolve: tiles swap in pseudo-random order with a quick shrink
 * pop and a white glint, loosely radiating from the click point.
 * Persistent canvas: only animating tiles repaint each frame.
 */
export const pixelDissolve: TileTransition = {
  name: 'Pixel Dust Fade',

  draw(env, now) {
    const { ctx, cells, cellSize } = env;
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
      const distance = Math.hypot(cell.centerX - env.x, cell.centerY - env.y);
      const delay = (hash01(i + 1) * STAGGER + distance * DISTANCE_BIAS) * env.speed;
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

      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(cell.x, cell.y, cellSize, cellSize);

      const scale = 1 - 0.4 * Math.sin(Math.PI * t);
      const blend = smoothstep(clamp((t - 0.2) / 0.6, 0, 1));

      if (blend < 1) {
        drawCellTile(env, env.roundedFrom, cell, scale);
      }
      if (blend > 0) {
        ctx.globalAlpha = blend;
        drawCellTile(env, env.roundedTo, cell, scale);
        ctx.globalAlpha = 1;
      }

      const glint = 0.16 * Math.sin(Math.PI * t);
      const size = cellSize * scale;
      ctx.fillStyle = `rgba(255, 255, 255, ${glint.toFixed(3)})`;
      ctx.fillRect(cell.centerX - size / 2, cell.centerY - size / 2, size, size);
    }

    return allDone;
  },
};
