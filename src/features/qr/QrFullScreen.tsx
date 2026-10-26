"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import styles from "./QrFullScreen.module.css";

const subscribe = () => () => {};

type Props = {
  /** The short link's slug: the picture is drawn by the server from it. */
  slug: string;
  /** The address written under the code, as a person types it. */
  address: string;
  onClose: () => void;
};

/**
 * A short link's code filling the screen, for showing on a laptop or a phone
 * at a stall or a door: black on white, as large as the screen allows, with
 * its address under it.
 *
 * It covers the page and, where the browser allows a page to (not on an
 * iPhone), takes the whole screen too. Leaving full screen with the browser's
 * own key closes it, and so do Escape and Close. The picture is the server's
 * SVG of the code, the same one the sign prints.
 */
export function QrFullScreen({ slug, address, onClose }: Props) {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isClient) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    const overlay = overlayRef.current;
    let tookScreen = false;
    if (overlay && typeof overlay.requestFullscreen === "function") {
      overlay.requestFullscreen().then(
        () => {
          tookScreen = true;
        },
        () => {
          // Refused (a setting, or a browser that only gives video full
          // screen): the overlay already covers the page.
        },
      );
    }
    const onScreenChange = () => {
      // The browser's own way out of full screen closes this too.
      if (tookScreen && !document.fullscreenElement) onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      // One control in here: Tab stays on it.
      if (e.key === "Tab") {
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener("fullscreenchange", onScreenChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onScreenChange);
      window.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      before?.focus();
    };
  }, [isClient]);

  if (!isClient) return null;
  return createPortal(
    <div
      ref={overlayRef}
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`The code for ${address}, full screen`}
    >
      <button ref={closeRef} type="button" className={styles.close} onClick={onClose}>
        Close
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.code}
        src={`/api/links/${encodeURIComponent(slug)}/qr?format=svg`}
        alt={`QR code for ${address}`}
      />
      <p className={styles.address}>{address}</p>
    </div>,
    document.body,
  );
}
