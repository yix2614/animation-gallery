import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { TRANSITIONS } from '../transitions';
import type { TileTransition } from '../transitions/types';
import { runTransition } from './engine';

/** Names of the built-in effects, taken from the demo's transition set. */
export type EffectName = (typeof TRANSITIONS)[number]['name'];

export type SweepOptions = {
  /** Which built-in animation to play. Defaults to the provider's `effect`. */
  effect?: EffectName;
  /** Outgoing surface color. Defaults to the provider's `fromColor`. */
  fromColor?: string;
  /** Incoming surface color. Defaults to the provider's `toColor`. */
  toColor?: string;
  /** Sweep origin in viewport CSS pixels. Defaults to screen center. */
  originX?: number;
  originY?: number;
};

export type ProviderConfig = {
  effect: EffectName;
  fromColor: string;
  toColor: string;
};

type GridTransitionContextValue = {
  config: ProviderConfig;
  /**
   * Play a sweep. `onCover` runs once the band has covered the screen — the
   * router triggers use it to actually change the route underneath the overlay.
   */
  sweep: (options: SweepOptions & { onCover?: () => void }) => Promise<void>;
};

const GridTransitionContext = createContext<GridTransitionContextValue | null>(null);

const DEFAULT_EFFECT: EffectName = 'Shockwave Grid';
const DEFAULT_FROM = 'rgba(0, 0, 0, 0)';
const DEFAULT_TO = '#000000';

function resolveTransition(effect: EffectName): TileTransition {
  return TRANSITIONS.find((t) => t.name === effect) ?? TRANSITIONS[0];
}

export type GridTransitionProviderProps = {
  children: ReactNode;
  /** Default effect for every sweep. Override per-call via triggers. */
  effect?: EffectName;
  /** Default outgoing surface color. */
  fromColor?: string;
  /** Default incoming surface color. */
  toColor?: string;
};

export function GridTransitionProvider({
  children,
  effect = DEFAULT_EFFECT,
  fromColor = DEFAULT_FROM,
  toColor = DEFAULT_TO,
}: GridTransitionProviderProps) {
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const busyRef = useRef(false);

  const config = useMemo<ProviderConfig>(
    () => ({ effect, fromColor, toColor }),
    [effect, fromColor, toColor],
  );
  const configRef = useRef(config);
  configRef.current = config;

  // The overlay canvas is created lazily on the first sweep so an app that
  // never transitions costs nothing.
  const ensureOverlay = useCallback(() => {
    if (overlayRef.current) {
      return overlayRef.current;
    }
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      pointerEvents: 'none',
      zIndex: '2147483647',
      display: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(canvas);
    overlayRef.current = canvas;
    return canvas;
  }, []);

  const sweep = useCallback<GridTransitionContextValue['sweep']>(
    async (options) => {
      // Ignore re-entrant sweeps; run the pending navigation immediately.
      if (busyRef.current) {
        options.onCover?.();
        return;
      }
      busyRef.current = true;

      const current = configRef.current;
      const overlay = ensureOverlay();
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      overlay.style.display = 'block';
      try {
        await runTransition(overlay, {
          transition: resolveTransition(options.effect ?? current.effect),
          fromColor: options.fromColor ?? current.fromColor,
          toColor: options.toColor ?? current.toColor,
          originX: options.originX ?? window.innerWidth / 2,
          originY: options.originY ?? window.innerHeight / 2,
          speed: reducedMotion ? 0.002 : 1,
          onCover: options.onCover,
        });
      } finally {
        overlay.style.display = 'none';
        busyRef.current = false;
      }
    },
    [ensureOverlay],
  );

  useEffect(() => {
    return () => {
      overlayRef.current?.remove();
      overlayRef.current = null;
    };
  }, []);

  const value = useMemo<GridTransitionContextValue>(() => ({ config, sweep }), [config, sweep]);

  return (
    <GridTransitionContext.Provider value={value}>{children}</GridTransitionContext.Provider>
  );
}

export function useGridTransition(): GridTransitionContextValue {
  const value = useContext(GridTransitionContext);
  if (!value) {
    throw new Error('useGridTransition must be used within a <GridTransitionProvider>.');
  }
  return value;
}
