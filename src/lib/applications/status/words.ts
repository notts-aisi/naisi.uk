import { standardSubject } from "../decisionDay/emailCopy";
import type { StatusView } from "./view";

/**
 * THE CHIP AND THE TITLE OF AN OUTCOME, said one way wherever it is said.
 *
 * Somebody reads where their application stands in two places: on their own
 * page ("Your application") and, one line each, on the list of everything
 * they have applied to. The list is older than application forms and words a
 * row from the stored status alone, and the status does not say enough. A
 * place given back and an invitation turned down are both stored as
 * `withdrawn`, so the list told both "You withdrew this application"; and a
 * declined application read "Declined" there while its own page, on purpose,
 * says exactly what somebody with no offer reads.
 *
 * So the list asks here, with the same view the page is drawn from
 * (`statusViewFor`, which reads the person's standing off their own
 * document). These are the page's own chip and title for each outcome:
 * `tests/applications-wave-h-list-words.test.mjs` holds this function and
 * `StatusPage.tsx` to the same words, so one cannot change without the other.
 *
 * NULL MEANS THERE IS NO OUTCOME TO STATE: no application, a draft, one that
 * is sent and waiting, one withdrawn before anything was decided, or a result
 * that cannot be read. The list keeps its own words for those.
 *
 * Pure, with no server import.
 */
export type OutcomeWords = {
  chip: string;
  /** How the chip is drawn: good news, an invitation to answer, or plain. */
  tone: "ok" | "accent" | "neutral";
  title: string;
};

export function outcomeWords(view: StatusView): OutcomeWords | null {
  if (view.kind === "place") {
    return {
      chip: "Accepted",
      tone: "ok",
      // The decision email's standard subject, with a full stop.
      title: view.programme ? `${standardSubject("accepted", view.programme.shortName)}.` : "You’re in.",
    };
  }
  if (view.kind === "invitation") {
    return {
      chip: "Invitation",
      tone: "accent",
      title: view.programme
        ? `You’re invited to ${view.programme.shortName}.`
        : "You’re invited to another programme.",
    };
  }
  if (view.kind === "released") {
    const name = view.programme?.shortName ?? null;
    if (view.how === "no-thanks") {
      return {
        chip: "Invitation turned down",
        tone: "neutral",
        title: name ? `You said no thanks to ${name}.` : "You said no thanks to your invitation.",
      };
    }
    return { chip: "Place given back", tone: "neutral", title: "You’ve told us you can’t make it." };
  }
  // No offer, and every programme declined: one card, and so one line.
  if (view.kind === "no-place") {
    return { chip: "No place this term", tone: "neutral", title: "We can’t offer you a place this term." };
  }
  return null;
}

/** One row of the list of somebody's applications, in that list's own chip tones. */
export type ListWords = {
  chip: string;
  tone: "success" | "accent" | "neutral";
  sentence: string;
};

const LIST_TONE = { ok: "success", accent: "accent", neutral: "neutral" } as const;

/** What the list says for an application made on a form, or null to keep its own words. */
export function listWordsFor(view: StatusView): ListWords | null {
  const words = outcomeWords(view);
  return words ? { chip: words.chip, tone: LIST_TONE[words.tone], sentence: words.title } : null;
}
