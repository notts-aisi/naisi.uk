"use client";

import { useEffect, useRef } from "react";

/*
  The timings of the headline's second sentence, in milliseconds. It holds,
  loses its underline, is deleted a letter at a time, waits, is typed again
  and underlined, for as long as the hero is on screen.
*/
const SETTLE_MS = 2200;
const HOLD_MS = 2800;
const UNDERLINE_OFF_MS = 280;
const DELETE_MS = 55;
const EMPTY_MS = 750;
const TYPE_MS = 110;
const BEFORE_UNDERLINE_MS = 350;
const UNDERLINE_ON_MS = 350;

/**
 * Types the headline's second sentence over and over, while the hero has no
 * animated scene to do it.
 *
 * It renders nothing of its own. The sentence is already in the page, whole
 * and underlined, from the server: that is what a visitor with no script and
 * a visitor who asked for less motion both read. This finds it inside the
 * element it was rendered in (`[data-accent-text]`) and rewrites the letters
 * of the one text node that is there.
 *
 * It says where it has got to the way the scene does, by writing `data-ul`
 * (none, grow, full, shrink) and `data-caret` (on, off) on the hero's own
 * box, which the hero's stylesheet reads. So the stylesheet has one set of
 * rules for the line and the caret, whoever is typing.
 *
 * Rules a maintainer has to keep:
 *
 *  - It starts from the whole sentence and always ends on it. Leaving the
 *    page, or the effect running twice in development, puts the sentence
 *    back and takes both attributes off.
 *  - It writes the existing text node's value and never replaces the node.
 *  - Nothing runs under `prefers-reduced-motion`, and nothing runs while the
 *    hero is scrolled out of sight.
 *  - It must never run beside the scene: two typists would fight over the
 *    same letters. It is rendered by `HeroFrame` and nowhere else, and
 *    leaves with it.
 */
export default function HeadlineLoop() {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = anchor.current?.parentElement;
    if (!root) return;
    const accent = root.querySelector<HTMLElement>("[data-accent-text]");
    const first = accent?.firstChild;
    if (!accent || !first || first.nodeType !== Node.TEXT_NODE) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const box: HTMLElement = root;
    const letters: ChildNode = first;
    const sentence = letters.nodeValue ?? "";
    if (!sentence) return;

    let stopped = false;
    let timer = 0;
    let onScreen = true;
    let resume: (() => void) | null = null;

    const watcher = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      if (onScreen && resume) {
        const go = resume;
        resume = null;
        go();
      }
    });
    watcher.observe(box);

    /** Wait, and then go on waiting for as long as the hero is out of sight. */
    const wait = (ms: number) =>
      new Promise<void>((done) => {
        timer = window.setTimeout(() => {
          if (onScreen) done();
          else resume = done;
        }, ms);
      });
    const underline = (state: "none" | "grow" | "full" | "shrink") => {
      box.dataset.ul = state;
    };

    async function run() {
      await wait(SETTLE_MS);
      while (!stopped) {
        box.dataset.caret = "on";
        await wait(HOLD_MS);
        if (stopped) return;
        underline("shrink");
        await wait(UNDERLINE_OFF_MS);
        if (stopped) return;
        underline("none");
        for (let count = sentence.length - 1; count >= 0; count -= 1) {
          letters.nodeValue = sentence.slice(0, count);
          await wait(DELETE_MS);
          if (stopped) return;
        }
        await wait(EMPTY_MS);
        if (stopped) return;
        for (let count = 1; count <= sentence.length; count += 1) {
          letters.nodeValue = sentence.slice(0, count);
          await wait(TYPE_MS);
          if (stopped) return;
        }
        await wait(BEFORE_UNDERLINE_MS);
        if (stopped) return;
        underline("grow");
        await wait(UNDERLINE_ON_MS);
        if (stopped) return;
        underline("full");
      }
    }
    void run();

    return () => {
      stopped = true;
      resume = null;
      window.clearTimeout(timer);
      watcher.disconnect();
      letters.nodeValue = sentence;
      delete box.dataset.ul;
      delete box.dataset.caret;
    };
  }, []);

  return <span ref={anchor} hidden />;
}
