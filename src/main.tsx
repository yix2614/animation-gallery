import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { TRANSITIONS } from './transitions';
import { clamp, smoothstep } from './transitions/types';
import type { Cell, TileTransition, TransitionEnv } from './transitions';
import './styles.css';

const CELL_SIZE = 32;
const TILE_CORNER = 8;

// Dial geometry: items sit on a circle whose center is far to the left of the
// pivot, so rows above/below the selection drift left and tilt tangentially.
const WHEEL_RADIUS = 640;
const ITEM_ANGLE = 0.074;
const ITEM_SPACING = WHEEL_RADIUS * ITEM_ANGLE;
const ACTIVE_INDENT = 92;
const DOT_RADIUS = 6;
const DOT_OFFSET_X = 52;
const FONT_SIZE = 40;
const FONT = `${FONT_SIZE}px Inter, "Helvetica Neue", system-ui, sans-serif`;

// Left-hand hardware: a huge raised plate whose rim the text rides along, a
// ring of per-row tick dots just inside the rim, and a black knob with a
// white tri-star needle at the wheel center.
const PLATE_RADIUS = WHEEL_RADIUS - 24;
const DOT_RING_RADIUS = PLATE_RADIUS - 32;
const KNOB_RADIUS = 150;

type Row = { label: string; transitionIndex?: number };

const ROWS: Row[] = [
  ...TRANSITIONS.map((transition, index) => ({ label: transition.name, transitionIndex: index })),
];
const MAX_SCROLL = Math.max(ROWS.length - 1, 0);

// Start centered on Shockwave Grid instead of the first row, so the default
// selection sits on the center dot.
const DEFAULT_ROW = clamp(
  ROWS.findIndex((row) => row.label === 'Shockwave Grid'),
  0,
  MAX_SCROLL,
);

type Wave = {
  x: number;
  y: number;
  start: number;
  fromTheme: number;
  toTheme: number;
  transition: TileTransition;
  firstFrame: boolean;
};

type ThemeSpec = {
  page: string;
  plate: [string, string];
  text: string;
  tick: string;
};

// 0 = dark mode, 1 = light mode
const THEMES: ThemeSpec[] = [
  {
    page: '#000000',
    plate: ['#1a1c21', '#0a0b0d'],
    text: '#f4f6f8',
    tick: 'rgba(244, 246, 248, 0.30)',
  },
  {
    page: '#e7e9ed',
    plate: ['#ffffff', '#eef0f4'],
    text: '#0e141d',
    tick: 'rgba(14, 20, 29, 0.26)',
  },
];

function paintTheme(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  dpr: number,
  theme: ThemeSpec,
  scroll: number,
) {
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = theme.page;
  ctx.fillRect(0, 0, width, height);

  const pivotX = width / 2 + DOT_OFFSET_X;
  const pivotY = height / 2;
  const wheelCenterX = pivotX - WHEEL_RADIUS;

  // The plate the whole dial sits on.
  const plate = ctx.createLinearGradient(
    wheelCenterX,
    pivotY - PLATE_RADIUS,
    wheelCenterX,
    pivotY + PLATE_RADIUS,
  );
  plate.addColorStop(0, theme.plate[0]);
  plate.addColorStop(1, theme.plate[1]);
  ctx.fillStyle = plate;
  ctx.beginPath();
  ctx.arc(wheelCenterX, pivotY, PLATE_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // One tick dot per row, riding the inside of the rim. The slot at the
  // selection line is left for the red marker dot.
  ctx.fillStyle = theme.tick;
  for (let index = 0; index < ROWS.length; index += 1) {
    const angle = (index - scroll) * ITEM_ANGLE;
    if (Math.abs(angle) > 1.35 || Math.abs(angle) < ITEM_ANGLE * 0.5) {
      continue;
    }
    const dotX = wheelCenterX + Math.cos(angle) * DOT_RING_RADIUS;
    const dotY = pivotY + Math.sin(angle) * DOT_RING_RADIUS;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Selection marker on the center line: a short dash inside the dot ring and
  // a red dot sitting on the ring itself.
  const markerX = wheelCenterX + DOT_RING_RADIUS;
  ctx.strokeStyle = theme.text;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(markerX - 80, pivotY);
  ctx.lineTo(markerX - 34, pivotY);
  ctx.stroke();

  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(markerX, pivotY, DOT_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = FONT;
  ctx.textBaseline = 'middle';

  const visibleRange = Math.ceil(1.35 / ITEM_ANGLE);
  const nearest = Math.round(scroll);
  const ACTIVE_COLOR = '#ff7a1a';

  for (let index = nearest - visibleRange; index <= nearest + visibleRange; index += 1) {
    if (index < 0 || index >= ROWS.length) {
      continue;
    }
    const angle = (index - scroll) * ITEM_ANGLE;
    if (Math.abs(angle) > 1.35) {
      continue;
    }

    const label = ROWS[index].label;
    const proximity = clamp(1 - Math.abs(index - scroll), 0, 1);
    const indent = ACTIVE_INDENT * smoothstep(proximity);

    ctx.save();
    ctx.translate(wheelCenterX, pivotY);
    ctx.rotate(angle);
    ctx.translate(WHEEL_RADIUS + indent, 0);

    ctx.fillStyle = index === nearest ? ACTIVE_COLOR : theme.text;
    ctx.fillText(label, 0, 0);

    ctx.restore();
  }

  paintKnob(ctx, wheelCenterX, pivotY, theme, scroll);
}

// The black knob at the wheel center: thin bezel ring, near-black face, and a
// white tri-star needle (three rim dashes plus a solid tri-blade hub) that
// rotates with the scroll position.
function paintKnob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  theme: ThemeSpec,
  scroll: number,
) {
  const isDark = theme.page === '#000000';

  ctx.save();

  // Bezel: a soft ring separating the knob from the plate.
  ctx.beginPath();
  ctx.arc(cx, cy, KNOB_RADIUS + 12, 0, Math.PI * 2);
  ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(13, 16, 22, 0.08)';
  ctx.lineWidth = 10;
  ctx.stroke();

  // Near-black face with a faint top-lit sheen.
  const face = ctx.createRadialGradient(
    cx,
    cy - KNOB_RADIUS * 0.5,
    KNOB_RADIUS * 0.2,
    cx,
    cy,
    KNOB_RADIUS,
  );
  face.addColorStop(0, '#17181c');
  face.addColorStop(1, '#050608');
  ctx.beginPath();
  ctx.arc(cx, cy, KNOB_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = face;
  ctx.fill();

  ctx.translate(cx, cy);
  ctx.rotate((scroll - DEFAULT_ROW) * ITEM_ANGLE * 0.6);

  // Three slim rounded dashes near the rim, one per needle direction.
  ctx.strokeStyle = '#f5f6f8';
  ctx.lineWidth = KNOB_RADIUS * 0.05;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 3; i += 1) {
    const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
    ctx.moveTo(Math.cos(a) * KNOB_RADIUS * 0.82, Math.sin(a) * KNOB_RADIUS * 0.82);
    ctx.lineTo(Math.cos(a) * KNOB_RADIUS * 0.92, Math.sin(a) * KNOB_RADIUS * 0.92);
  }
  ctx.stroke();

  // Solid tri-blade needle: one compact shape with three rounded tips and
  // deeply concave sides. The round-joined stroke is what rounds the tips and
  // softens the waists.
  const tipRadius = KNOB_RADIUS * 0.32;
  const waistRadius = tipRadius * 0.3;
  ctx.beginPath();
  for (let i = 0; i < 3; i += 1) {
    const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
    const next = -Math.PI / 2 + ((i + 1) / 3) * Math.PI * 2;
    const mid = (a + next) / 2;
    const x = Math.cos(a) * tipRadius;
    const y = Math.sin(a) * tipRadius;
    if (i === 0) {
      ctx.moveTo(x, y);
    }
    ctx.quadraticCurveTo(
      Math.cos(mid) * waistRadius,
      Math.sin(mid) * waistRadius,
      Math.cos(next) * tipRadius,
      Math.sin(next) * tipRadius,
    );
  }
  ctx.closePath();
  ctx.fillStyle = '#f5f6f8';
  ctx.lineJoin = 'round';
  ctx.lineWidth = KNOB_RADIUS * 0.1;
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const themeCanvases = [document.createElement('canvas'), document.createElement('canvas')];
    // Same surfaces with transparent rounded tile corners, so animating tiles
    // get round corners from a plain drawImage instead of per-tile clipping.
    const roundedCanvases = [document.createElement('canvas'), document.createElement('canvas')];
    const maskCanvas = document.createElement('canvas');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const speed = reducedMotion ? 0.002 : 1;

    let dpr = 1;
    let gridWidth = 0;
    let gridHeight = 0;
    let maxDistance = 1;
    let cells: Cell[] = [];
    let doneScratch = new Uint8Array(0);
    let activeTheme = 0;
    let wave: Wave | null = null;
    let roundedDirty = true;
    let selectedRow = DEFAULT_ROW;

    let scrollPos = DEFAULT_ROW;
    let scrollTarget = DEFAULT_ROW;
    let lastPaintedScroll = Number.NaN;
    let snapTimer = 0;

    let rafId = 0;
    let running = false;

    let dragPointerId = -1;
    let dragLastY = 0;
    let dragMoved = 0;
    let dragStart = 0;

    const clampScroll = (value: number) => clamp(value, 0, MAX_SCROLL);

    const paintThemes = () => {
      paintTheme(themeCanvases[0], gridWidth, gridHeight, dpr, THEMES[0], scrollPos);
      paintTheme(themeCanvases[1], gridWidth, gridHeight, dpr, THEMES[1], scrollPos);
      lastPaintedScroll = scrollPos;
      roundedDirty = true;
      if (wave) {
        // Persistent transitions must rebuild their base layer on top of the
        // freshly painted surfaces.
        wave.firstFrame = true;
        doneScratch.fill(0);
      }
    };

    const composeRounded = () => {
      for (let i = 0; i < roundedCanvases.length; i += 1) {
        const roundedCtx = roundedCanvases[i].getContext('2d')!;
        roundedCtx.setTransform(1, 0, 0, 1, 0, 0);
        roundedCtx.globalCompositeOperation = 'source-over';
        roundedCtx.drawImage(themeCanvases[i], 0, 0);
        roundedCtx.globalCompositeOperation = 'destination-in';
        roundedCtx.drawImage(maskCanvas, 0, 0);
        roundedCtx.globalCompositeOperation = 'source-over';
      }
      roundedDirty = false;
    };

    const blit = () => {
      const source = themeCanvases[activeTheme];
      ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, gridWidth, gridHeight);
    };

    const drawWave = (now: number) => {
      if (!wave) {
        return true;
      }
      if (roundedDirty) {
        composeRounded();
      }

      const env: TransitionEnv = {
        ctx,
        from: themeCanvases[wave.fromTheme],
        to: themeCanvases[wave.toTheme],
        roundedFrom: roundedCanvases[wave.fromTheme],
        roundedTo: roundedCanvases[wave.toTheme],
        cells,
        cellSize: CELL_SIZE,
        dpr,
        width: gridWidth,
        height: gridHeight,
        maxDistance,
        speed,
        x: wave.x,
        y: wave.y,
        start: wave.start,
        firstFrame: wave.firstFrame,
        done: doneScratch,
      };
      wave.firstFrame = false;

      return wave.transition.draw(env, now);
    };

    // Clicking animates only while a transition-title row is selected.
    const startWave = (clientX: number, clientY: number) => {
      const transitionIndex = ROWS[selectedRow].transitionIndex;
      if (transitionIndex === undefined) {
        return;
      }

      const bounds = canvas.getBoundingClientRect();
      const nextTheme = activeTheme === 0 ? 1 : 0;

      doneScratch.fill(0);
      wave = {
        x: clamp(clientX - bounds.left, 0, gridWidth),
        y: clamp(clientY - bounds.top, 0, gridHeight),
        start: performance.now(),
        fromTheme: activeTheme,
        toTheme: nextTheme,
        transition: TRANSITIONS[transitionIndex],
        firstFrame: true,
      };
      activeTheme = nextTheme;
      ensureLoop();
    };

    // Settling on a row just records the selected row.
    const handleSelectionSettled = () => {
      const index = clampScroll(Math.round(scrollPos));
      if (index === selectedRow) {
        return;
      }
      selectedRow = index;
    };

    const tick = (now: number) => {
      let animating = false;

      scrollTarget = clampScroll(scrollTarget);
      const remaining = scrollTarget - scrollPos;
      if (Math.abs(remaining) > 0.01) {
        scrollPos += remaining * 0.16;
        scrollPos = clampScroll(scrollPos);
        animating = true;
      } else {
        scrollPos = scrollTarget;
        if (Number.isInteger(scrollTarget)) {
          handleSelectionSettled();
        }
      }

      if (scrollPos !== lastPaintedScroll) {
        paintThemes();
      }

      if (wave) {
        if (drawWave(now)) {
          wave = null;
          blit();
        } else {
          animating = true;
        }
      } else {
        blit();
      }

      if (animating) {
        rafId = requestAnimationFrame(tick);
      } else {
        running = false;
      }
    };

    const ensureLoop = () => {
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(tick);
      }
    };

    const scheduleSnap = () => {
      window.clearTimeout(snapTimer);
      snapTimer = window.setTimeout(() => {
        scrollTarget = clampScroll(Math.round(scrollTarget));
        ensureLoop();
      }, 180);
    };

    const rebuild = () => {
      dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const columnCount = Math.max(1, Math.ceil(width / CELL_SIZE));
      const rowCount = Math.max(1, Math.ceil(height / CELL_SIZE));

      gridWidth = columnCount * CELL_SIZE;
      gridHeight = rowCount * CELL_SIZE;
      maxDistance = Math.hypot(gridWidth, gridHeight);

      canvas.width = Math.round(gridWidth * dpr);
      canvas.height = Math.round(gridHeight * dpr);
      canvas.style.width = `${gridWidth}px`;
      canvas.style.height = `${gridHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const pixelWidth = Math.max(1, Math.round(gridWidth * dpr));
      const pixelHeight = Math.max(1, Math.round(gridHeight * dpr));
      for (const offscreen of [...themeCanvases, ...roundedCanvases, maskCanvas]) {
        offscreen.width = pixelWidth;
        offscreen.height = pixelHeight;
      }

      cells = Array.from({ length: rowCount * columnCount }, (_, index) => {
        const x = (index % columnCount) * CELL_SIZE;
        const y = Math.floor(index / columnCount) * CELL_SIZE;
        return { x, y, centerX: x + CELL_SIZE / 2, centerY: y + CELL_SIZE / 2 };
      });
      doneScratch = new Uint8Array(cells.length);

      const maskCtx = maskCanvas.getContext('2d')!;
      maskCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      maskCtx.clearRect(0, 0, gridWidth, gridHeight);
      maskCtx.fillStyle = '#ffffff';
      maskCtx.beginPath();
      for (const cell of cells) {
        maskCtx.roundRect(cell.x, cell.y, CELL_SIZE, CELL_SIZE, TILE_CORNER);
      }
      maskCtx.fill();

      wave = null;
      paintThemes();
      blit();
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      scrollTarget = clampScroll(scrollTarget + event.deltaY / ITEM_SPACING);
      scheduleSnap();
      ensureLoop();
    };

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      dragPointerId = event.pointerId;
      dragLastY = event.clientY;
      dragMoved = 0;
      dragStart = performance.now();
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic pointer events have no active pointer to capture.
      }
    };

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== dragPointerId) {
        return;
      }

      const deltaY = event.clientY - dragLastY;
      dragLastY = event.clientY;
      dragMoved += Math.abs(deltaY);

      if (dragMoved > 4) {
        scrollTarget = clampScroll(scrollTarget - deltaY / ITEM_SPACING);
        ensureLoop();
      }
    };

    const handlePointerUp = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== dragPointerId) {
        return;
      }
      dragPointerId = -1;

      if (dragMoved < 6 && performance.now() - dragStart < 500) {
        startWave(event.clientX, event.clientY);
      } else {
        scheduleSnap();
      }
    };

    rebuild();
    window.addEventListener('resize', rebuild);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(snapTimer);
      window.removeEventListener('resize', rebuild);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="stage"
        aria-label="Scroll to pick a tile transition, click to toggle dark and light mode"
      />
      <a
        className="copyright"
        href="https://x.com/yixiang6688"
        target="_blank"
        rel="noopener noreferrer"
        onPointerDown={(e) => e.stopPropagation()}
      >
        © Yixiang
      </a>
    </>
  );
}

// Reuse the root across Vite HMR re-executions of this module; calling
// createRoot twice on the same container stacks zombie app instances.
type RootContainer = HTMLElement & { _reactRoot?: ReturnType<typeof createRoot> };

const container = document.getElementById('root')! as RootContainer;
const root = (container._reactRoot ??= createRoot(container));

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
