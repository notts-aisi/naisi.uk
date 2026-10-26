import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { formByToken } from "./forms";
import { formClosedOn, isFormOpen } from "./model";
import { FORM_WORDS, SEND_WORDS, STATE_WORDS, programmeWords } from "./words";

/**
 * WHAT THE FORM'S PAGE IS HANDED, built on the server from the link alone:
 * the programme's words, the box that says how the form is anonymous, and
 * the secret the page already has in its address. Or one calm message: a
 * link that opens nothing, or a form that has closed.
 *
 * It is built from the link and nothing else: no session, no cookie, no
 * header, no address. Opening the page writes nothing.
 */

export type FormScreen =
  | {
      state: "open";
      /** "Fellowship: AGI Strategy". */
      eyebrow: string;
      intro: string;
      box: { heading: string; points: string[]; note: string };
      /** "It closes on Fri 18 Dec. Once sent, your answers can’t change." */
      closing: string;
      /** The secret already in the page's address, for the answers to go back with. */
      token: string;
    }
  | { state: "message"; title: string; body: string };

export const NO_FORM_SCREEN: FormScreen = { state: "message", ...STATE_WORDS.noForm };

export async function formScreenFor(db: Firestore, token: string, now: Date): Promise<FormScreen> {
  const form = await formByToken(db, token);
  if (!form) return NO_FORM_SCREEN;
  if (!isFormOpen(form, now) || !form.closesAt) {
    const on = formClosedOn(form, now);
    return on ? { state: "message", ...STATE_WORDS.closed(on) } : NO_FORM_SCREEN;
  }
  const name = form.programmeName || "the programme";
  return {
    state: "open",
    eyebrow: programmeWords(form.programmeKind, name),
    intro: FORM_WORDS.intro(name),
    box: { heading: FORM_WORDS.boxHeading, points: [...FORM_WORDS.points(name)], note: FORM_WORDS.note },
    closing: SEND_WORDS.closing(form.closesAt),
    token: form.token,
  };
}
