/**
 * Runs the hero's scene on a page.
 *
 * scene.ts starts and stops the engine. This file decides everything around
 * it: which of the three forms the screen calls for, when to start over, and
 * how the typed headline reaches the page.
 * It is loaded after the first paint by HeroScene, so none of it is in the
 * page's first script.
 *
 * What it writes on the root element, for the stylesheet and for checks:
 *
 *   data-form     "desktop" | "tablet" | "phone", the form the scene runs in
 *   data-scene    "running", or "still" under reduced motion
 *   data-typing   present once the scene has taken over the accent's words
 *   data-ul       the accent's underline: none | grow | full | shrink
 *   data-caret    on | off
 *   data-replay   flips between absent and "b" when the entrance replays
 *
 * Rules a maintainer has to keep:
 *
 *  - The two media conditions below are the ones HeroScene.module.css lays
 *    the hero out on. Change them in both places or the scene and the layout
 *    disagree about the form.
 *  - A finger on the hero scrolls the page, on every form. Nothing here may
 *    set `touch-action` or stop a touch: the hero is one screen high, so a
 *    visitor on a phone has nowhere else to put a finger, and a hero that
 *    kept the swipe for itself would be a page that does not scroll.
 */
import { maxWidth } from "@/theme/breakpoints";
import { startScene, type HeroForm, type SceneHeadline } from "./scene";

/** At or below this the hero is in its phone form. */
export const PHONE_QUERY = maxWidth("md");
/**
 * At or below this, or on any screen held upright, the hero is stacked: the
 * tablet form, unless the phone condition also holds. The engine draws its
 * wide network only in a root that is wider than it is tall, so an upright
 * screen takes the stacked layout however wide it is.
 */
export const STACKED_QUERY = `${maxWidth("lg")}, (orientation: portrait)`;
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

/** What counts as pressing something inside the hero. */
const CONTROLS = 'a[href], button, input, select, textarea, summary, [role="button"], [role="link"]';

const STATE_ATTRIBUTES = [
  "data-form",
  "data-scene",
  "data-typing",
  "data-ul",
  "data-caret",
  "data-replay",
];

/**
 * Start the scene on `canvas` inside `root` and keep it right for the screen.
 * Returns a function that stops it and takes back everything it added.
 */
export function mountHero(root: HTMLElement, canvas: HTMLCanvasElement): () => void {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  // A root that is in no window has nothing to draw in and nothing to stop.
  if (!view) return () => {};
  const win: Window & typeof globalThis = view;

  const phone = win.matchMedia(PHONE_QUERY);
  const stacked = win.matchMedia(STACKED_QUERY);
  const reduced = win.matchMedia(REDUCED_QUERY);

  const accentEl = root.querySelector<HTMLElement>("[data-accent-text]");
  const accent = accentEl?.textContent ?? "";

  let form: HeroForm = "desktop";
  let stopScene: (() => void) | null = null;
  /** Whether the engine's reports are being written to the page yet. */
  let typing = false;
  /** Touches whose capture was handed back so that a link stays a link. */
  const loose = new Set<number>();

  function formNow(): HeroForm {
    if (phone.matches) return "phone";
    return stacked.matches ? "tablet" : "desktop";
  }

  function set(name: string, value: string | null) {
    if (value === null) root.removeAttribute(name);
    else if (root.getAttribute(name) !== value) root.setAttribute(name, value);
  }

  // ------------------------------------------------------ the typed headline

  /** Can a visitor see the accent's words right now? */
  function accentIsShowing(): boolean {
    for (let el: Element | null = accentEl; el; el = el.parentElement) {
      if (parseFloat(win.getComputedStyle(el).opacity) < 0.01) return false;
    }
    return accentEl !== null;
  }

  function onHeadline(state: SceneHeadline) {
    if (!accentEl) return;
    if (!typing) {
      // The words were already on the page in full when the scene started
      // (the script came late, or the scene was rebuilt). Leave them alone
      // and join the loop the first time it holds the whole accent, so
      // nothing a visitor has read is taken away and typed again.
      if (state.accentText !== accent || state.ul !== "full") return;
      typing = true;
    }
    if (accentEl.textContent !== state.accentText) accentEl.textContent = state.accentText;
    set("data-typing", "");
    set("data-ul", state.ul);
    set("data-caret", state.caret ? "on" : "off");
  }

  function onReplay() {
    // The engine has started its entrance again. The words' own entrance
    // follows it, and the accent is typed from nothing as it was the first time.
    set("data-replay", root.getAttribute("data-replay") === "b" ? null : "b");
    typing = accent !== "";
  }

  function restoreHeadline() {
    if (accentEl && accentEl.textContent !== accent) accentEl.textContent = accent;
    set("data-ul", null);
    set("data-caret", null);
  }

  // --------------------------------------------------- a finger on a link

  function controlAt(target: EventTarget | null): Element | null {
    const el = target as Element | null;
    if (!el || typeof el.closest !== "function") return null;
    const control = el.closest(CONTROLS);
    return control && control !== root && root.contains(control) ? control : null;
  }

  /*
   * The engine captures a finger on the root so it can follow a drag to the
   * edge of the hero. A captured finger's click can be sent to the capturing
   * element, which would leave a link inside the hero unable to be followed
   * by touch. So when a press begins on a link or button, the capture is
   * handed straight back. This listens on the document, which hears the press
   * after the engine's own listener on the root has run.
   */
  function afterPointerDown(event: PointerEvent) {
    if (event.pointerType === "mouse" || !controlAt(event.target)) return;
    try {
      if (root.hasPointerCapture(event.pointerId)) {
        root.releasePointerCapture(event.pointerId);
        loose.add(event.pointerId);
      }
    } catch {
      // The pointer has already gone; there is nothing to hand back.
    }
  }

  /*
   * Without its capture the root does not hear a finger lifted outside it,
   * and the engine would go on leaning toward where the finger last was. Tell
   * the engine the touch ended, in the only language it listens to.
   */
  function afterPointerEnd(event: PointerEvent) {
    if (!loose.delete(event.pointerId)) return;
    if (event.composedPath().includes(root)) return;
    root.dispatchEvent(
      new win.PointerEvent("pointercancel", {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
      }),
    );
  }

  /*
   * The engine replays its entrance on a double click anywhere in the root.
   * That is kept for the open scene. A double click on the words is how a
   * visitor selects one, and must not send the whole hero round again, so it
   * is stopped before the engine hears it.
   */
  function onDoubleClick(event: Event) {
    if (event.target !== root) event.stopPropagation();
  }

  // ------------------------------------------------------- start and stop

  function start() {
    form = formNow();
    typing = accent !== "" && !accentIsShowing();
    try {
      stopScene = startScene(root, canvas, {
        form,
        accent: accent || undefined,
        onHeadline: accent ? onHeadline : undefined,
        onReplay,
      });
    } catch (error) {
      // The words do not depend on the scene: without it the hero is the
      // same page on a plain ground.
      stopScene = null;
      console.error("[hero] the scene did not start", error);
    }
    set("data-form", form);
    set("data-scene", stopScene ? (reduced.matches ? "still" : "running") : null);
  }

  function halt() {
    if (stopScene) stopScene();
    stopScene = null;
    loose.clear();
    restoreHeadline();
  }

  function onFormChange() {
    if (formNow() === form) return;
    halt();
    start();
  }

  function onReducedChange() {
    set("data-scene", stopScene ? (reduced.matches ? "still" : "running") : null);
  }

  root.addEventListener("dblclick", onDoubleClick, true);
  doc.addEventListener("pointerdown", afterPointerDown);
  doc.addEventListener("pointerup", afterPointerEnd);
  doc.addEventListener("pointercancel", afterPointerEnd);
  phone.addEventListener("change", onFormChange);
  stacked.addEventListener("change", onFormChange);
  reduced.addEventListener("change", onReducedChange);

  start();

  let unmounted = false;
  return function unmountHero() {
    if (unmounted) return;
    unmounted = true;
    halt();
    root.removeEventListener("dblclick", onDoubleClick, true);
    doc.removeEventListener("pointerdown", afterPointerDown);
    doc.removeEventListener("pointerup", afterPointerEnd);
    doc.removeEventListener("pointercancel", afterPointerEnd);
    phone.removeEventListener("change", onFormChange);
    stacked.removeEventListener("change", onFormChange);
    reduced.removeEventListener("change", onReducedChange);
    for (const name of STATE_ATTRIBUTES) root.removeAttribute(name);
  };
}
