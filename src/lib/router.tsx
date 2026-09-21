import {
  forwardRef,
  useCallback,
  useEffect,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from 'react';
import { useGridTransition, type SweepOptions } from './GridTransitionProvider';

/** Event name fired after a programmatic navigation, so `useRoute` can update. */
const ROUTE_EVENT = 'gridtransition:navigate';

/** Push a new URL via the History API and notify subscribers. */
function navigate(href: string) {
  window.history.pushState({}, '', href);
  window.dispatchEvent(new Event(ROUTE_EVENT));
}

/**
 * Subscribe to the current pathname (+ search + hash). Updates on both
 * programmatic navigation and browser back/forward.
 */
export function useRoute(): string {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener(ROUTE_EVENT, onChange);
    window.addEventListener('popstate', onChange);
    return () => {
      window.removeEventListener(ROUTE_EVENT, onChange);
      window.removeEventListener('popstate', onChange);
    };
  }, []);
  const getSnapshot = () =>
    window.location.pathname + window.location.search + window.location.hash;
  return useSyncExternalStore(subscribe, getSnapshot, () => '/');
}

export type TransitionRouter = {
  /** Navigate to `href`, playing a sweep and swapping the route mid-sweep. */
  push: (href: string, options?: SweepOptions) => void;
  /** Navigate without a sweep (plain History push). */
  replace: (href: string) => void;
};

/** Programmatic navigation with a sweep — for redirects, form submits, etc. */
export function useTransitionRouter(): TransitionRouter {
  const { sweep } = useGridTransition();

  const push = useCallback(
    (href: string, options?: SweepOptions) => {
      void sweep({ ...options, onCover: () => navigate(href) });
    },
    [sweep],
  );

  const replace = useCallback((href: string) => {
    window.history.replaceState({}, '', href);
    window.dispatchEvent(new Event(ROUTE_EVENT));
  }, []);

  return { push, replace };
}

function isModifiedEvent(event: MouseEvent) {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.button !== 0;
}

function isInternalHref(href: string, target?: string) {
  if (!href || target === '_blank') {
    return false;
  }
  // Same-origin, non-hash-only, non-download links only.
  try {
    const url = new URL(href, window.location.href);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

export type TransitionLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  /** Per-link sweep overrides (effect, colors, origin). */
  sweep?: SweepOptions;
};

/** A drop-in <a> that plays a sweep before navigating to a known destination. */
export const TransitionLink = forwardRef<HTMLAnchorElement, TransitionLinkProps>(
  function TransitionLink({ href, sweep: sweepOptions, onClick, target, ...rest }, ref) {
    const { sweep } = useGridTransition();

    const handleClick = useCallback(
      (event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented || isModifiedEvent(event) || !isInternalHref(href, target)) {
          return;
        }
        event.preventDefault();
        void sweep({
          ...sweepOptions,
          originX: sweepOptions?.originX ?? event.clientX,
          originY: sweepOptions?.originY ?? event.clientY,
          onCover: () => navigate(href),
        });
      },
      [href, onClick, sweep, sweepOptions, target],
    );

    return <a ref={ref} href={href} target={target} onClick={handleClick} {...rest} />;
  },
);

/**
 * Drop in at the root to automatically sweep on every internal link click,
 * without touching existing markup. Opt a link out with `data-grid-skip`.
 */
export function InterceptLinks() {
  const { sweep } = useGridTransition();

  useEffect(() => {
    const handler = (event: globalThis.MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.altKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.button !== 0
      ) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest('a');
      if (!anchor) {
        return;
      }
      if (anchor.hasAttribute('data-grid-skip') || anchor.hasAttribute('download')) {
        return;
      }
      const href = anchor.getAttribute('href') ?? '';
      const target = anchor.getAttribute('target') ?? undefined;
      if (!isInternalHref(href, target)) {
        return;
      }
      event.preventDefault();
      void sweep({
        originX: event.clientX,
        originY: event.clientY,
        onCover: () => navigate(href),
      });
    };

    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [sweep]);

  return null;
}
