import { pixelRipple } from './pixelRipple';
import { pixelFlip } from './pixelFlip';
import { pixelDissolve } from './pixelDissolve';
import { pixelBlinds } from './pixelBlinds';

import { liquidWave } from './liquidWave';
import {
  auroraFlow,
  digitalGlitch,
  glassShatterWave,
  glimmSweep,
  hyperspaceWarp,
  inkBloom,
  kaleidoscopeBloom,
  liquidChrome,
  noiseRipple,
  rippleLens,
  shockHalo,
  voltArc,
  vortexSwirl,
} from './webglEffects';
import type { TileTransition } from './types';

export const TRANSITIONS: TileTransition[] = [
  inkBloom,
  pixelFlip,
  pixelDissolve,
  pixelBlinds,
  liquidWave,
  glassShatterWave,
  rippleLens,
  noiseRipple,
  pixelRipple,
  glimmSweep,
  auroraFlow,
  liquidChrome,
  hyperspaceWarp,
  kaleidoscopeBloom,
  voltArc,
  shockHalo,
  digitalGlitch,
  vortexSwirl,
];

export type { Cell, TileTransition, TransitionEnv } from './types';
