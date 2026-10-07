"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { keepOut } from "./keepOut";
import styles from "./HeroScene.module.css";

type HeroSceneProps = {
  /**
   * The hero's words and buttons, written as ordinary markup on the server.
   * They are complete and readable without this component's script: the
   * scene is drawn behind them and takes nothing from them but their
   * positions. README.md says how to mark them up.
   */
  children: ReactNode;
  className?: string;
};

/**
 * The animated scene behind the homepage's hero.
 *
 * It draws one canvas, hidden from assistive technology, behind its children,
 * one screen high, pulled up under the site's sticky header. The scene's
 * script is fetched after the page has painted, and its arrival moves
 * nothing: the canvas and the strip under the header are sized by the
 * stylesheet alone.
 */
export default function HeroScene({ children, className }: HeroSceneProps) {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    let cancelled = false;
    let unmount: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // A frame, then a task: the words are on screen before the scene's
    // script is asked for. A hidden tab is given no frame, so it fetches
    // nothing until somebody looks at it.
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        import("./mount")
          .then(({ mountHero }) => {
            if (!cancelled) unmount = mountHero(root, canvas);
          })
          .catch(() => {
            // The script did not arrive. The hero stays as the server sent it.
          });
      }, 0);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (timer !== undefined) clearTimeout(timer);
      if (unmount) unmount();
    };
  }, []);

  const cls = [styles.root, className ?? ""].filter(Boolean).join(" ");

  return (
    <section ref={rootRef} className={cls}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      {/* The site's header is a sticky bar above the page. This strip is the
          room it takes inside the hero, and tells the scene to draw nothing
          bright behind the header's words. */}
      <div className={styles.bar} aria-hidden="true" {...keepOut("header")} />
      {children}
    </section>
  );
}
