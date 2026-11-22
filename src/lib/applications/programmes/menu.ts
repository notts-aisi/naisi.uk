import type { TermStage } from "../lifecycle/status";

/**
 * The menu's programmes, as they travel from `GET
 * /api/admissions/programmes/menu` to the shell. Made on the server by
 * `loadProgrammesMenu` (`./list.ts`); read in the browser by
 * `askProgrammesMenu` and `parseProgrammesMenu` below. No server import, so
 * the shell can name it.
 */

/** One programme in the menu: its name, its Overview, and how many applications wait for this reader there. */
export type MenuProgramme = { name: string; href: string; review: number };

/** One term in the menu: its heading ("Autumn 2026", "Spring 2027 · applying") and its programmes. */
export type MenuTerm = { heading: string; programmes: MenuProgramme[] };

/** What the menu says after a term's name: while its form takes applications, and while it is deciding. Nothing otherwise. */
const MENU_SUFFIX: Partial<Record<TermStage, string>> = { open: "applying", deciding: "deciding" };

/** "Autumn 2026", "Spring 2027 · applying", "Spring 2027 · deciding". */
export function menuHeadingFor(label: string, stage: TermStage): string {
  const suffix = MENU_SUFFIX[stage];
  return suffix ? `${label} · ${suffix}` : label;
}

/** A programme's Overview, the one address a menu entry may open. */
const OVERVIEW = /^\/admin\/admissions\/forms\/[^/?#]+\/programmes\/[^/?#]+\/overview$/;

const NO_TERMS: MenuTerm[] = [];

/**
 * The route's answer, as the shell may draw it: every term with a heading
 * and at least one programme, every programme with a name, an Overview's
 * address and a whole Review count. Anything else in the answer is dropped,
 * and an answer that is not one is no terms, so the menu is the one it
 * would be without them.
 */
export function parseProgrammesMenu(raw: unknown): MenuTerm[] {
  const terms = (raw as { terms?: unknown } | null)?.terms;
  if (!Array.isArray(terms)) return NO_TERMS;
  const out: MenuTerm[] = [];
  for (const term of terms) {
    const heading = (term as { heading?: unknown } | null)?.heading;
    const programmes = (term as { programmes?: unknown } | null)?.programmes;
    if (typeof heading !== "string" || !heading.trim() || !Array.isArray(programmes)) continue;
    const kept: MenuProgramme[] = [];
    for (const each of programmes) {
      const { name, href, review } = (each ?? {}) as { name?: unknown; href?: unknown; review?: unknown };
      if (typeof name !== "string" || !name.trim() || typeof href !== "string" || !OVERVIEW.test(href)) continue;
      kept.push({ name, href, review: typeof review === "number" && Number.isInteger(review) && review > 0 ? review : 0 });
    }
    if (kept.length > 0) out.push({ heading, programmes: kept });
  }
  return out.length > 0 ? out : NO_TERMS;
}

/**
 * How long the shell waits for the answer. Past it the request is let go and
 * the menu stays the one it was drawn with for the rest of this page load,
 * so entries never arrive long after somebody has started using the menu.
 */
export const PROGRAMMES_MENU_WAIT_MS = 8_000;

/**
 * Ask `GET /api/admissions/programmes/menu` once. Never throws: a refusal, a
 * failed request, an answer that is not one and an answer slower than
 * `waitMs` are all no terms.
 */
export async function askProgrammesMenu(waitMs: number = PROGRAMMES_MENU_WAIT_MS): Promise<MenuTerm[]> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<MenuTerm[]>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(NO_TERMS);
    }, waitMs);
  });
  const asked = fetch("/api/admissions/programmes/menu", { cache: "no-store", signal: controller.signal })
    .then(async (res) => (res.ok ? parseProgrammesMenu(await res.json().catch(() => null)) : NO_TERMS))
    .catch(() => NO_TERMS);
  try {
    return await Promise.race([asked, late]);
  } finally {
    clearTimeout(timer);
  }
}
