import type { ReactNode } from "react";
import NetField from "@/components/ui/NetField";
import HeadlineLoop from "./HeadlineLoop";
import styles from "./HeroFrame.module.css";

/**
 * THE HERO'S FRAME, WHILE IT HAS NO MOVING SCENE.
 *
 * It takes the hero's words as `children` and a class for the box, and that
 * is all, because it is the one piece meant to be swapped: the animated scene
 * (`HeroScene`) is a component with the same two props, rendering the same
 * element, that draws behind the same children. To change over, replace this
 * component where `HomeHero.tsx` renders it, and nothing else.
 *
 * It is the same box the scene is: one screen high, pulled up under the
 * site's sticky bar, with a strip as tall as that bar as its first piece.
 * The words are the next piece and never add the bar's height themselves,
 * which is why they are laid out the same under this frame and under the
 * scene.
 *
 * Everything that only makes sense without the scene therefore lives in
 * here, so that it leaves with the swap:
 *
 *  - a still drawing of the network where the scene will be, so the hero is
 *    not an empty ground;
 *  - `HeadlineLoop`, which types the headline's second sentence. The scene
 *    drives that sentence itself, and two drivers would fight over it.
 *
 * It is a Server Component. The words inside it are in the page's HTML with
 * or without script.
 */
export default function HeroFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={className ? `${styles.frame} ${className}` : styles.frame}>
      <NetField net="card" strength="strong" className={styles.still} />
      {/* The room the site's bar takes at the top of the hero. */}
      <div className={styles.bar} aria-hidden="true" />
      {children}
      <HeadlineLoop />
    </section>
  );
}
