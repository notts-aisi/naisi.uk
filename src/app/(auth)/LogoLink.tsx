"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import logoStyles from "./LogoLink.module.css";

/** Custom event the auth pages listen for to play a back-swipe animation
 *  before the layout navigates to "/". Cancelable: the page calls
 *  preventDefault() to indicate it'll handle the navigation itself, so
 *  the frame shouldn't fire its own router.push. */
export const AUTH_BACK_HOME_EVENT = "naisi:auth-back-home";

/** Dispatched by login / register pages once GIS is ready and the card
 *  is about to swipe in. LogoLink listens for it so the NAISI logo can
 *  float in from the left in sync with the card arriving from the right. */
export const AUTH_PAGE_READY_EVENT = "naisi:auth-page-ready";

/** Dispatched once a page has taken a back-home request and is playing its
 *  own exit, whichever of the frame's links was pressed, so the logo can
 *  leave with the card. */
const AUTH_LEAVING_EVENT = "naisi:auth-leaving";

/**
 * The click handler for a link home from the sign-in frame: the logo, and
 * "Back to naisi.uk" beside it.
 *
 * On a left-click without modifiers it dispatches a cancelable custom event
 * so the page underneath (login / register) can intercept it and animate its
 * own exit before the route actually changes. If nothing intercepts, it falls
 * back to a regular router.push. Modifier-clicks (cmd/ctrl/shift/middle) are
 * left alone for native open-in-new-tab behaviour.
 */
export function useBackHome(): (e: MouseEvent<HTMLAnchorElement>) => void {
  const router = useRouter();
  return useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.button !== 0) return;
      e.preventDefault();
      const evt = new CustomEvent(AUTH_BACK_HOME_EVENT, { cancelable: true });
      window.dispatchEvent(evt);
      if (!evt.defaultPrevented) {
        router.push("/");
        return;
      }
      // The page took it and will navigate when its exit has played.
      window.dispatchEvent(new CustomEvent(AUTH_LEAVING_EVENT));
    },
    [router],
  );
}

type Props = {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** The brand link at the top left of the sign-in frame. */
export default function LogoLink({ children, className, ...rest }: Props) {
  const handleClick = useBackHome();
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const onReady = () => setEntered(true);
    // Float back out to the left in sync with the card swiping back out to
    // the right.
    const onLeaving = () => setExiting(true);
    window.addEventListener(AUTH_PAGE_READY_EVENT, onReady);
    window.addEventListener(AUTH_LEAVING_EVENT, onLeaving);
    // Safety fallback in case GIS never reports: reveal the logo after
    // 2.4s regardless so the corner doesn't sit empty forever.
    const t = setTimeout(() => setEntered(true), 2400);
    return () => {
      window.removeEventListener(AUTH_PAGE_READY_EVENT, onReady);
      window.removeEventListener(AUTH_LEAVING_EVENT, onLeaving);
      clearTimeout(t);
    };
  }, []);

  const entryClass = exiting
    ? logoStyles.logoExiting
    : entered
      ? logoStyles.logoEntered
      : logoStyles.logoEntering;

  const composedClass = [className, entryClass].filter(Boolean).join(" ");

  return (
    <Link href="/" className={composedClass} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
