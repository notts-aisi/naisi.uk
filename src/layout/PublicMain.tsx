"use client";

/**
 * Two responsibilities, deliberately split:
 *
 *  1. `<PublicTransitionProvider>` is the context owner. It wraps the ENTIRE
 *     public layout (header + main + footer) so any descendant, including
 *     PublicHeader, which is a sibling of PublicMain, can consume
 *     `usePublicTransition()` to take part in the exit choreography
 *     (header-lift before body-fade before nav).
 *
 *  2. `<PublicMain>` is the `<main>` element. It consumes the context to know
 *     when to play its body fade-out, and owns its own entrance.
 *
 * They USED to be one component, with the Provider scoped inside `<main>`.
 * That made the header invisible to the context (siblings don't see it), so
 * header lift never fired. Don't recombine.
 *
 * THE ENTRANCE, AND THE RULE IT KEEPS: a page that arrives in its own HTML is
 * visible from the first paint, with nothing waiting on a script. Only a page
 * reached by a navigation inside the browser (back from sign-in, say) fades
 * in, and by then the script is already running. `useArrivedByNavigation()`
 * tells the two apart, and PublicHeader uses it for the same reason.
 * /sources/<slug> is inside this layout and is where a printed code lands, so
 * never make the first HTML wait for hydration again.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import styles from "./PublicMain.module.css";

type PublicTransitionContext = {
  /** Fade the public page out then navigate. Used by header sign-in
   *  links so /login's swipe-in is preceded by a graceful exit instead
   *  of a hard cut. Calls are idempotent once an exit is in flight. */
  startExitTo: (url: string) => void;
  /** True once the page-body fade-out is in progress. */
  exiting: boolean;
  /** True once the header has started lifting upward (fires BEFORE
   *  `exiting` so the banner clears the viewport before the page
   *  fades out + the auth route takes over). */
  headerLifting: boolean;
};

const Ctx = createContext<PublicTransitionContext | null>(null);

export function usePublicTransition() {
  return useContext(Ctx);
}

/** Page-body fade-out duration. Keep in sync with .exiting keyframes
 *  in PublicMain.module.css. */
export const PUBLIC_EXIT_MS = 540;
/** Head start the banner gets to lift off-screen BEFORE the body
 *  starts fading. Has to be long enough for the user to register the
 *  banner leaving as a discrete moment before the page transition. */
export const HEADER_LIFT_HEAD_START_MS = 420;

export function PublicTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);
  const [headerLifting, setHeaderLifting] = useState(false);
  const exitingRef = useRef(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("naisi:from-signout") === "1") {
        sessionStorage.removeItem("naisi:from-signout");
      }
    } catch {
      // sessionStorage unavailable: nothing to clean up
    }
  }, []);

  const startExitTo = useCallback(
    (url: string) => {
      if (exitingRef.current) return;
      exitingRef.current = true;
      // 1) Lift the banner immediately. PublicHeader subscribes to
      //    `headerLifting` and animates upward over 540ms.
      setHeaderLifting(true);
      // 2) After the banner has had a head-start (420ms, about 78% lifted on
      //    the smooth curve), start the body fade-out.
      setTimeout(() => setExiting(true), HEADER_LIFT_HEAD_START_MS);
      // 3) Once both motions are done, navigate. Total wait ≈ 960ms.
      setTimeout(
        () => router.push(url),
        HEADER_LIFT_HEAD_START_MS + PUBLIC_EXIT_MS,
      );
    },
    [router],
  );

  return (
    <Ctx.Provider value={{ startExitTo, exiting, headerLifting }}>
      {children}
    </Ctx.Provider>
  );
}

const subscribeToNothing = () => () => {};
const inBrowser = () => true;
const onServer = () => false;

/**
 * True when the component was first rendered by a navigation inside the
 * browser, false when it arrived in the page's own HTML.
 *
 * React reads the server snapshot while it hydrates and the client one on any
 * later mount, and `useState` keeps whichever the first render saw. So the
 * answer never changes for the life of the component, and the first client
 * render of a hydrated page matches its HTML.
 */
export function useArrivedByNavigation(): boolean {
  const browser = useSyncExternalStore(subscribeToNothing, inBrowser, onServer);
  const [arrived] = useState(browser);
  return arrived;
}

export default function PublicMain({ children }: { children: ReactNode }) {
  const ctx = useContext(Ctx);
  const exiting = ctx?.exiting ?? false;
  const arrivedByNavigation = useArrivedByNavigation();
  // Only for a page reached by navigation. The first paint carries an inline
  // opacity:0 + translateY(4px), and on the next animation frame `animate`
  // flips, which swaps in the .mainAnim class. The animation's from-state
  // matches the inline style exactly, so the handoff is seamless: no flash
  // where content was briefly visible before the animation took hold.
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    // One rAF to ensure the initial inline-style paint commits before
    // React's re-render swaps to the animated class. Without this the
    // two paints can collapse into one, defeating the mask.
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const className = [
    styles.main,
    arrivedByNavigation && animate ? styles.mainAnim : "",
    exiting ? styles.exiting : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Applied for the one frame before the animation takes over, and never to
  // a page that arrived in its own HTML: that one starts visible.
  const initialStyle =
    arrivedByNavigation && !animate && !exiting
      ? ({ opacity: 0, transform: "translateY(4px)" } as const)
      : undefined;

  return (
    <main className={className} style={initialStyle}>
      {children}
    </main>
  );
}
