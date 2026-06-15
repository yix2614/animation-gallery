import { blitFull, clamp, drawCellTile, easeOutCubic } from './types';
import type { TileTransition } from './types';

const KEYFRAMES = [0, 0.34, 0.58, 0.78, 1];
const DELAY_PER_PX = 1;
const DURATION = 760;

function interpolateKeyframes(t: number, values: number[]) {
  for (let i = 0; i < KEYFRAMES.length - 1; i += 1) {
    if (t <= KEYFRAMES[i + 1]) {
      const progress = (t - KEYFRAMES[i]) / (KEYFRAMES[i + 1] - KEYFRAMES[i]);
      return values[i] + (values[i + 1] - values[i]) * easeOutCubic(progress);
    }
  }

  return values[values.length - 1];
}

/**
 * The original shock wave: tiles compress, expand outward with a push, then
 * settle while the new theme sweeps through radially.
 */
export const pixelRipple: TileTransition = {
  name: 'Shockwave Grid',

  draw(env, now) {
    const { ctx, cells, cellSize, dpr, maxDistance } = env;
    const duration = DURATION * env.speed;
    const delayPerPx = DELAY_PER_PX * env.speed;
    const elapsed = now - env.start;

    // Untouched outer region comes from one full-surface blit; the settled
    // inner disc is a second blit under a single circular clip. Only the
    // animating ring pays per-tile drawing costs.
    blitFull(ctx, env.from, env.width, env.height);

    const safeRadius = (elapsed - duration) / delayPerPx - cellSize * 1.5;
    if (safeRadius > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(env.x, env.y, safeRadius, 0, Math.PI * 2);
      ctx.clip();
      blitFull(ctx, env.to, env.width, env.height);
      ctx.restore();
    }
    const skipRadius = safeRadius - cellSize;

    let allDone = true;

    for (const cell of cells) {
      const distance = Math.hypot(cell.centerX - env.x, cell.centerY - env.y);
      if (distance < skipRadius) {
        continue;
      }

      const t = clamp((elapsed - distance * delayPerPx) / duration, 0, 1);

      if (t <= 0) {
        allDone = false;
        continue;
      }

      if (t >= 1) {
        drawCellTile(env, env.to, cell);
        continue;
      }

      allDone = false;

      const impact = Math.pow(1 - clamp(distance / maxDistance, 0, 1), 1.25);
      const maxPushX = ((cell.centerX - env.x) / maxDistance) * 22 * impact;
      const maxPushY = ((cell.centerY - env.y) / maxDistance) * 22 * impact;

      const scale = interpolateKeyframes(t, [1, 1 - 0.18 * impact, 1 + 0.16 * impact, 0.985, 1]);
      const pushX = interpolateKeyframes(t, [0, 0, maxPushX, maxPushX * -0.18, 0]);
      const pushY = interpolateKeyframes(t, [0, 0, maxPushY, maxPushY * -0.18, 0]);
      const brightness = interpolateKeyframes(t, [1, 1 - 0.08 * impact, 1 + 0.08 * impact, 1.02, 1]);
      const blend = clamp((t - 0.38) / 0.24, 0, 1);

      const size = cellSize * scale;
      const destX = cell.centerX + pushX - size / 2;
      const destY = cell.centerY + pushY - size / 2;

      // Gaps revealed by the shrinking tile read as a darkened crack in the
      // outgoing surface, subtle in both dark and light mode.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(cell.x, cell.y, cellSize, cellSize);

      if (blend < 1) {
        ctx.drawImage(env.roundedFrom, cell.x * dpr, cell.y * dpr, cellSize * dpr, cellSize * dpr, destX, destY, size, size);
      }
      if (blend > 0) {
        ctx.globalAlpha = blend;
        ctx.drawImage(env.roundedTo, cell.x * dpr, cell.y * dpr, cellSize * dpr, cellSize * dpr, destX, destY, size, size);
        ctx.globalAlpha = 1;
      }

      if (Math.abs(brightness - 1) > 0.004) {
        ctx.fillStyle =
          brightness > 1
            ? `rgba(255, 255, 255, ${(brightness - 1).toFixed(3)})`
            : `rgba(0, 0, 0, ${(1 - brightness).toFixed(3)})`;
        ctx.fillRect(destX, destY, size, size);
      }
    }

    return allDone;
  },
};
