/**
 * `kairosChoices/{uid}`: WHETHER A PERSON'S NAME AND PROGRAMME RECORD MAY GO
 * TO KAIROS, ONE DOCUMENT PER PERSON (the programme impact questionnaire's
 * P7 (b); Zach, Mon 26 Oct 2026).
 *
 *   { uid, shared, at, via }
 *
 * SHARED UNTIL THE PERSON SAYS NO. NAISI shares each person's name, programme
 * record and the ratings they were given at the end with Kairos by default,
 * and the privacy policy says so. Most people never say anything, so most
 * people have no document at all, and no document reads as shared. A
 * document is written the first time somebody changes the choice: on a
 * programme survey's form, or on their profile. It keeps what they said last
 * (`shared`), when (`at`) and where (`via`). Saying yes again writes
 * `shared: true` over the no, so the latest word is the one kept.
 *
 * WHAT SAYING NO CHANGES is only what goes to Kairos with the person's name:
 * the Kairos file leaves them out. Admins still see their answers, and the
 * answers still count in the totals.
 *
 * Server-only in both directions: firestore.rules shuts the collection to
 * every browser, its owner's included. `src/lib/kairos/choice.ts` is its one
 * reader and its one writer, and `tests/kairos-choice.test.mjs` walks the tree
 * for anything else that names it. It goes with the person's account
 * (`accountDeletion.ts`).
 *
 * Pure: no reads, so the form and the profile's panel can share its types.
 */

export const KAIROS_CHOICES_COLLECTION = "kairosChoices";

/** Where the person last said it: a programme survey's form, or their profile. */
export type KairosVia = "survey" | "settings";

export type KairosChoiceDoc = {
  uid: string;
  /** False once the person has said not to share their details with Kairos. */
  shared: boolean;
  /** When they last said it. */
  at: Date | null;
  via: KairosVia;
};

function tsToDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const obj = v as { toDate?: () => Date };
  return typeof obj?.toDate === "function" ? obj.toDate() : null;
}

/**
 * A stored choice, or null for one that is not whole: a `uid` that is not its
 * own id, or no yes or no in it. A choice that is not whole says nothing, so
 * the person reads as shared, the default the policy states.
 */
export function normalizeKairosChoice(id: string, data: Record<string, unknown>): KairosChoiceDoc | null {
  if (data.uid !== id || typeof data.shared !== "boolean") return null;
  return {
    uid: id,
    shared: data.shared,
    at: tsToDate(data.at),
    via: data.via === "settings" ? "settings" : "survey",
  };
}

/** Whether a person's details go to Kairos: yes, unless their choice says no. */
export function sharesWithKairos(choice: Pick<KairosChoiceDoc, "shared"> | null | undefined): boolean {
  return choice?.shared !== false;
}
