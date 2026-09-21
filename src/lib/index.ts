export {
  GridTransitionProvider,
  useGridTransition,
  type GridTransitionProviderProps,
  type EffectName,
  type SweepOptions,
  type ProviderConfig,
} from './GridTransitionProvider';

export {
  InterceptLinks,
  TransitionLink,
  useTransitionRouter,
  useRoute,
  type TransitionLinkProps,
  type TransitionRouter,
} from './router';

export { runTransition, type RunTransitionOptions } from './engine';

// All 18 built-in effects (names usable as the `effect` prop) and their types.
export { TRANSITIONS } from '../transitions';
export type { TileTransition, TransitionEnv, Cell } from '../transitions/types';

/** Convenience list of built-in effect names. */
import { TRANSITIONS } from '../transitions';
export const EFFECT_NAMES = TRANSITIONS.map((t) => t.name);
