# transitery

Full-screen page-transition effects for React, driven by WebGL shaders and canvas tiles. One `<Provider>`, a link interceptor, and a router hook — swap between **18 built-in effects** with a single prop.

Inspired by the ergonomics of route-transition libraries like glimm, but instead of a single light sweep it ships 18 distinct animations (glass, liquid metal, aurora, glitch, vortex, and more).

## Install

```bash
npm install transitery
```

Peer dependencies: `react` and `react-dom` (18+).

## Quick start

Wrap your app once, drop in `<InterceptLinks />`, and every internal link plays a transition on navigate — no other markup changes needed.

```tsx
import { GridTransitionProvider, InterceptLinks } from 'transitery/react';

export default function App({ children }) {
  return (
    <GridTransitionProvider effect="Shockwave Grid">
      <InterceptLinks />
      {children}
    </GridTransitionProvider>
  );
}
```

## Switching effects

The whole point: swapping between the 18 effects is trivial. Every effect shares one interface, so you switch by name.

### 1. Set a default for the whole app

```tsx
<GridTransitionProvider effect="Polar Light Veil" />
```

### 2. Override per link

```tsx
import { TransitionLink } from 'transitery/react';

<TransitionLink href="/about" sweep={{ effect: 'Digital Glitch Tear' }}>
  About
</TransitionLink>
```

### 3. Navigate programmatically

```tsx
import { useTransitionRouter } from 'transitery/react';

function SubmitButton() {
  const router = useTransitionRouter();
  return (
    <button onClick={() => router.push('/thanks', { effect: 'Spiral Vortex Pull' })}>
      Submit
    </button>
  );
}
```

### 4. List every effect (e.g. build a picker)

```tsx
import { EFFECT_NAMES } from 'transitery';

EFFECT_NAMES.forEach((name) => console.log(name));
// Use any of these strings as the `effect` prop / sweep option.
```

## The 18 built-in effects

| Effect name | Technique |
| --- | --- |
| `Blooming Ink Drift` | WebGL shader |
| `Tile Flip Array` | Canvas tiles |
| `Pixel Dust Fade` | Canvas tiles |
| `Slatted Screen Sweep` | Canvas tiles |
| `Midnight Black Tide` | Canvas tiles |
| `Shattered Glass Burst` | WebGL shader |
| `Glass Lens Pulse` | WebGL shader |
| `Flux Ring Ripple` | WebGL shader |
| `Shockwave Grid` | Canvas tiles |
| `Prism Light Sweep` | WebGL shader |
| `Polar Light Veil` | WebGL shader |
| `Liquid Chrome Melt` | WebGL shader |
| `Hyperspace Light Warp` | WebGL shader |
| `Kaleidoscope Bloom` | WebGL shader |
| `Electric Arc Surge` | WebGL shader |
| `Energy Halo Blast` | WebGL shader |
| `Digital Glitch Tear` | WebGL shader |
| `Spiral Vortex Pull` | WebGL shader |

## API

### `<GridTransitionProvider>`

Wraps your app and provides defaults for every transition.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `effect` | `EffectName` | `'Shockwave Grid'` | Default animation for every sweep. |
| `fromColor` | `string` | `rgba(0,0,0,0)` | Outgoing surface color. |
| `toColor` | `string` | `#000000` | Incoming surface color. |

### `<InterceptLinks />`

Drop in at the root. Automatically plays a transition on every internal link click. Opt a link out with `data-grid-skip`.

### `<TransitionLink href sweep?>`

A drop-in `<a>` that transitions before navigating to a known destination. `sweep` overrides `effect` / colors / origin per link.

### `useTransitionRouter()`

Returns `{ push(href, options?), replace(href) }` for programmatic navigation. `push` plays a sweep; `replace` navigates without one.

### `useRoute()`

Returns the current pathname (+ search + hash). Updates on navigation and browser back/forward.

### `EFFECT_NAMES`

`string[]` of all 18 effect names, usable as the `effect` prop or sweep option.

## How it works

On navigation, a full-screen overlay canvas plays one of the effects as a colored mask (`fromColor` → `toColor`); the new route swaps in underneath once the animation has covered the screen. The overlay is created lazily on the first transition, so an app that never navigates costs nothing. Respects `prefers-reduced-motion`.

## Credits

- Route-transition API design (provider + link interception) is inspired by [glimm](https://glimm.dev). No glimm source code is used here — the transition pipeline is original.
- The **Electric Arc Surge** effect adapts the ripple distortion technique from [m1ckc3s/ripple](https://github.com/m1ckc3s/ripple) by Mick Cesanek (MIT).
- Fonts: [Inter](https://github.com/rsms/inter) and [Geist Mono](https://github.com/vercel/geist-font), both under the SIL Open Font License 1.1.

See [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) for full dependency and license details.

## License

MIT © 2026 yix2614 — see [LICENSE](./LICENSE).
