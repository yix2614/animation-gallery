import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { TRANSITIONS } from './transitions';
import { clamp, easeInOutCubic, smoothstep } from './transitions/types';
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
const FONT = `${FONT_SIZE}px Geist, "Helvetica Neue", system-ui, sans-serif`;
const KNOB_SYMBOL_VIEWBOX = 268;
const KNOB_SYMBOL_PATH = new Path2D(
  'M142.081 0.000118934C150.666 0.000183094 157.409 7.35129 156.671 15.9046L153.704 50.2668C152.474 64.5139 170.298 71.8968 179.503 60.9529L201.709 34.5505C207.235 27.9803 217.201 27.551 223.272 33.6217L234.525 44.8748C240.595 50.9454 240.166 60.912 233.596 66.4379L207.078 88.7405C196.134 97.945 203.517 115.769 217.764 114.539L252.096 111.575C260.649 110.837 268 117.581 268 126.166L268 142.08C268 150.665 260.649 157.409 252.095 156.67L217.733 153.704C203.486 152.474 196.103 170.297 207.047 179.502L233.449 201.708C240.02 207.234 240.449 217.201 234.378 223.272L223.126 234.524C217.055 240.595 207.088 240.165 201.562 233.595L179.533 207.403C170.328 196.459 152.505 203.842 153.735 218.089L156.671 252.096C157.409 260.649 150.665 268 142.08 268H126.166C117.581 268 110.837 260.649 111.575 252.096L114.537 217.794C115.767 203.547 97.9428 196.164 88.7384 207.108L66.5833 233.45C61.0574 240.02 51.0907 240.45 45.0201 234.379L33.7671 223.126C27.6965 217.055 28.1259 207.089 34.6961 201.563L60.9228 179.504C71.8666 170.3 64.4837 152.476 50.2367 153.706L15.9044 156.67C7.35111 157.409 0 150.665 0 142.08V126.165C0 117.58 7.35108 110.837 15.9044 111.575L50.2062 114.536C64.4532 115.766 71.836 97.9424 60.8921 88.7379L34.5503 66.5828C27.98 61.0569 27.5506 51.0903 33.6212 45.0197L44.8743 33.7667C50.9449 27.6961 60.9115 28.1255 66.4374 34.6957L88.7693 61.2478C97.9738 72.1917 115.797 64.809 114.568 50.5619L111.576 15.9043C110.837 7.35101 117.581 -6.41602e-05 126.166 4.18228e-10L142.081 0.000118934Z',
);

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

// Shockwave Grid is the resting/default row after the landing sequence.
const DEFAULT_ROW = clamp(
  ROWS.findIndex((row) => row.label === 'Shockwave Grid'),
  0,
  MAX_SCROLL,
);
const LANDING_START_ROW = clamp(
  ROWS.findIndex((row) => row.label === 'Spiral Vortex Pull'),
  0,
  MAX_SCROLL,
);
const LANDING_TRANSITION =
  TRANSITIONS.find((transition) => transition.name === 'Slatted Screen Sweep') ?? TRANSITIONS[0];

type Wave = {
  x: number;
  y: number;
  start: number;
  fromCanvas: HTMLCanvasElement;
  toCanvas: HTMLCanvasElement;
  roundedFromCanvas: HTMLCanvasElement;
  roundedToCanvas: HTMLCanvasElement;
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
  const dashAngles = [-Math.PI / 2, Math.PI / 4, (3 * Math.PI) / 4];
  for (const a of dashAngles) {
    ctx.moveTo(Math.cos(a) * KNOB_RADIUS * 0.86, Math.sin(a) * KNOB_RADIUS * 0.86);
    ctx.lineTo(Math.cos(a) * KNOB_RADIUS * 0.965, Math.sin(a) * KNOB_RADIUS * 0.965);
  }
  ctx.stroke();

  // Center icon: use the supplied multi-point white symbol instead of the
  // previous rounded triangle.
  const symbolSize = KNOB_RADIUS * 1.42;
  const symbolScale = symbolSize / KNOB_SYMBOL_VIEWBOX;
  ctx.save();
  ctx.translate(-(KNOB_SYMBOL_VIEWBOX * symbolScale) / 2, -(KNOB_SYMBOL_VIEWBOX * symbolScale) / 2);
  ctx.scale(symbolScale, symbolScale);
  ctx.fillStyle = '#f5f6f8';
  ctx.fill(KNOB_SYMBOL_PATH);
  ctx.restore();

  ctx.restore();
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  // Custom round cursor that follows the pointer and pulses on press.
  useEffect(() => {
    const ring = cursorRef.current;
    if (!ring) {
      return;
    }
    const fine = window.matchMedia('(pointer: fine)').matches;
    if (!fine) {
      // Touch devices have no hover cursor; leave the ring hidden.
      return;
    }

    const move = (event: PointerEvent) => {
      ring.style.transform = `translate(${event.clientX}px, ${event.clientY}px) translate(-50%, -50%)`;
      ring.style.opacity = '1';
    };
    const leave = () => {
      ring.style.opacity = '0';
    };
    const press = () => ring.classList.add('cursor-ring--press');
    const release = () => ring.classList.remove('cursor-ring--press');

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointerout', leave);

    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', press);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointerout', leave);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const themeCanvases = [document.createElement('canvas'), document.createElement('canvas')];
    const landingCanvas = document.createElement('canvas');
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
    let selectedRow = LANDING_START_ROW;

    let scrollPos = LANDING_START_ROW;
    let scrollTarget = LANDING_START_ROW;
    let lastPaintedScroll = Number.NaN;
    let snapTimer = 0;

    let rafId = 0;
    let running = false;

    let dragPointerId = -1;
    let dragLastY = 0;
    let dragMoved = 0;
    let dragStart = 0;
    let didPlayLanding = false;
    // After the landing wave finishes, roll the dial from Spiral to Shockwave.
    let landingScrollPending = false;
    // Time-based eased tween for scripted scrolls (e.g. the landing roll).
    // null means the dial follows the default spring toward scrollTarget.
    let scrollTween: { from: number; to: number; start: number; duration: number } | null = null;

    const startScrollTween = (to: number, duration: number) => {
      scrollTween = { from: scrollPos, to: clampScroll(to), start: performance.now(), duration };
      scrollTarget = clampScroll(to);
      ensureLoop();
    };

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

    const triggerWave = (
      fromCanvas: HTMLCanvasElement,
      toCanvas: HTMLCanvasElement,
      roundedFromCanvas: HTMLCanvasElement,
      roundedToCanvas: HTMLCanvasElement,
      transition: TileTransition,
      x: number,
      y: number,
    ) => {
      doneScratch.fill(0);
      wave = {
        x: clamp(x, 0, gridWidth),
        y: clamp(y, 0, gridHeight),
        start: performance.now(),
        fromCanvas,
        toCanvas,
        roundedFromCanvas,
        roundedToCanvas,
        transition,
        firstFrame: true,
      };
      ensureLoop();
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
        from: wave.fromCanvas,
        to: wave.toCanvas,
        roundedFrom: wave.roundedFromCanvas,
        roundedTo: wave.roundedToCanvas,
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
      triggerWave(
        themeCanvases[activeTheme],
        themeCanvases[nextTheme],
        roundedCanvases[activeTheme],
        roundedCanvases[nextTheme],
        TRANSITIONS[transitionIndex],
        clientX - bounds.left,
        clientY - bounds.top,
      );
      activeTheme = nextTheme;
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
      if (scrollTween) {
        // Scripted eased scroll: interpolate with an ease-in-out curve over a
        // fixed duration for a smooth, non-springy motion.
        const elapsed = now - scrollTween.start;
        const p = clamp(elapsed / scrollTween.duration, 0, 1);
        scrollPos = clampScroll(
          scrollTween.from + (scrollTween.to - scrollTween.from) * easeInOutCubic(p),
        );
        if (p >= 1) {
          scrollPos = scrollTween.to;
          scrollTween = null;
          if (Number.isInteger(scrollTarget)) {
            handleSelectionSettled();
          }
        } else {
          animating = true;
        }
      } else {
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
      }

      if (scrollPos !== lastPaintedScroll) {
        paintThemes();
      }

      if (wave) {
        if (drawWave(now)) {
          wave = null;
          blit();
          // Fallback: if the landing roll hasn't been kicked off by its timer
          // yet, start it now that the sweep is done.
          if (landingScrollPending) {
            landingScrollPending = false;
            startScrollTween(DEFAULT_ROW, 900);
            animating = true;
          }
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
      for (const offscreen of [...themeCanvases, ...roundedCanvases, landingCanvas, maskCanvas]) {
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

      const landingCtx = landingCanvas.getContext('2d')!;
      landingCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      landingCtx.fillStyle = '#000000';
      landingCtx.fillRect(0, 0, gridWidth, gridHeight);

      wave = null;
      paintThemes();
      if (!didPlayLanding) {
        didPlayLanding = true;
        activeTheme = 0;
        triggerWave(
          landingCanvas,
          themeCanvases[activeTheme],
          landingCanvas,
          roundedCanvases[activeTheme],
          LANDING_TRANSITION,
          gridWidth / 2,
          gridHeight / 2,
        );
        landingScrollPending = true;
        // Start the eased roll to Shockwave slightly before the landing wave
        // finishes, so the rotation overlaps the tail of the sweep instead of
        // waiting for it to fully complete.
        window.setTimeout(() => {
          if (landingScrollPending) {
            landingScrollPending = false;
            startScrollTween(DEFAULT_ROW, 900);
          }
        }, 220);
        return;
      }
      blit();
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      // User input takes over from any scripted landing roll.
      scrollTween = null;
      landingScrollPending = false;
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
        // User drag takes over from any scripted landing roll.
        scrollTween = null;
        landingScrollPending = false;
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
      <div ref={cursorRef} className="cursor-ring" aria-hidden="true" />
      <div className="click-hint" aria-hidden="true">
        <span className="click-hint__dot" />
        Click to play transition
      </div>
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
