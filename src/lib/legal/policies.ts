/**
 * Versioned, dated legal policies — the single source of truth for the Terms of
 * Use and Privacy Policy version history.
 *
 * When a policy's wording changes: add a new content module under
 * `src/content/legal/<policy>/v<N>.tsx`, register it in
 * `src/content/legal/registry.tsx`, and PREPEND a new entry here (newest first).
 * `CURRENT_POLICY_VERSION` changes with it. We store the version a user accepted
 * and when (`policyVersion` + `policyAgreedAt`), so a future PR can detect anyone
 * who agreed to an older version and require them to re-consent on sign-in.
 *
 * The /<policy> page renders the current version; /<policy>/versions lists the
 * history; /<policy>/v/[version] renders a specific archived version.
 */
export type PolicyKey = "terms" | "privacy";

export type PolicyVersion = { version: number; lastUpdated: string };

export const POLICIES: Record<
  PolicyKey,
  {
    label: string;
    href: string;
    /** Newest first — entry [0] is the current version. */
    versions: PolicyVersion[];
  }
> = {
  terms: {
    label: "Terms of Use",
    href: "/terms",
    versions: [{ version: 1, lastUpdated: "25 May 2026" }],
  },
  privacy: {
    label: "Privacy Policy",
    href: "/privacy",
    // v4 went out with the 6 September 2026 release, so its words are words
    // members agreed to at that sign-in. It is frozen: a digest in
    // tests/privacy-policy.test.mjs holds the file, and it renders unchanged
    // at /privacy/v/4.
    //
    // v5 is the notification grid's version, 7 September 2026. It names the
    // four rows and the two choices per row, and it puts important notices
    // from an event organiser or a group facilitator under performance of a
    // contract rather than consent, which is a new legal basis for a class of
    // message the notification settings do not switch off. That is a material
    // change to what v4 promised, so it moved the version rather than editing
    // v4, and every member is asked again at their next sign-in. It is frozen
    // in its turn: a digest holds the file, and it renders unchanged at
    // /privacy/v/5.
    //
    // v6 is the application form's version. v5 said reviewers scored with
    // names hidden unless a round's author switched that off, and that the
    // form would say so. On an application form everybody who reads an
    // application sees whose it is, and the form does not say so, so the
    // policy does. That reverses a promise v5 made, which is a material
    // change, so it moved the version and every member is asked again at
    // their next sign-in. It also says who reads an application, what is kept
    // beside it and what decision day sends. It is frozen in its turn: a
    // digest holds the file, and it renders unchanged at /privacy/v/6.
    //
    // v7 is the course hub's version: a programme while it runs and when it
    // ends. v6 said a person mints their own certificate and nothing is
    // issued unless they choose to. Under v7 certificates are sent to the
    // people who finished and to facilitators, each private until its owner
    // turns the link on. That takes back a promise v6 made, which is a
    // material change, so it moved the version and every member is asked
    // again the next time they open the member area. It also says what a
    // programme's lead sees, pitching week and teams on an incubator, what
    // leaving does and who reads the reason, a place that comes back, how who
    // finished is recorded, that facilitators see names only, and that a
    // programme's attendance is a third logged download.
    //
    // v8 is the second reader's version. An admin can ask Claude (Anthropic)
    // to read an application with its reviews, and Pangram to check its
    // longer answers for writing produced with AI. Two new processors, and a
    // new use of what an applicant wrote, so it moved the version and every
    // member is asked again at their next sign-in. It says what is sent and
    // what is left out, that only admins see what comes back, and that
    // nothing is done because of it alone.
    //
    // v9 is the whole term's version. Claude reads an application blind
    // first, then with its reviews, and before decision day an admin can ask
    // it to look across every programme at once: who might suit which
    // programme, and who would make a good facilitator, including people who
    // did not offer. A new use of what an applicant wrote, and of each
    // programme's decision on them, so it moved the version.
    //
    // v10 is confirming a place. A term may ask everybody holding a place to
    // confirm it by a day, with a daily reminder, and after the day a person
    // may take somebody off so the place goes to somebody else; and an admin
    // may ask somebody who did not offer to facilitate. A new email, a new
    // field on the application and a new consequence, so it moved the version.
    //
    // v11 is a personal note with an invitation. An admin may add a few
    // sentences to a pooled applicant's invitation email on why the programme
    // suits them, and Claude may draft them from the application. Until now
    // nothing Claude wrote reached an applicant, so it moved the version.
    //
    // v12 is the notes in two emails that are not the same for everybody: a
    // note with your group for somebody placed outside the times they gave,
    // and the sentence asking somebody who did not offer to facilitate. Claude
    // may draft either, from the application alone and never anybody's times.
    // v11 said the invitation's note was the one place Claude's words could
    // reach somebody, so this took that back and moved the version.
    //
    // v13 is Claude and Pangram on coursework, and the notes admins keep about
    // a person. v12 promised "we will not use anything you write in a course
    // to make decisions about you outside the programme". v13 takes that back
    // from its own agreement on: what somebody writes on a course after they
    // first agree to v13 or a later version, and the notes admins keep about
    // them, may be used when they are considered for something else with us
    // later. Anything written before stays inside its programme, and the site
    // keeps the moment of that first agreement once (`courseworkUseAgreedAt`,
    // `src/lib/legal/courseworkUse.ts`). It also names admins' notes, Claude
    // picking a week's strongest answers and Pangram checking coursework. A
    // taken-back promise is a material change, so it moved the version and
    // every member is asked again at their next sign-in.
    //
    // v14 is required survey questions. v13 said "Every question can be
    // skipped." v14 says every question needs an answer unless it is marked
    // optional, and the boxes that ask permission (follow-ups, Kairos, being
    // quoted) are always up to the person (`isQuestionRequired` in
    // `src/lib/surveys/items.ts`). It also says an admin may send somebody a
    // link to answer just the questions they left blank, which shows none of
    // their earlier answers and adds to them without changing them. A
    // taken-back promise is a material change, so it moved the version and
    // every member is asked again at their next visit.
    //
    // Keep this comment ABOVE `versions:`, never between the `[` and the first
    // `{`: tests/funnel-harness-guards.test.mjs reads the current version out
    // of this file with a regex that allows only whitespace across that gap,
    // so a comment sitting there leaves the guard unable to read the very
    // number it exists to pin. Anywhere else in the file is fine.
    versions: [
      { version: 14, lastUpdated: "30 October 2026" },
      { version: 13, lastUpdated: "30 October 2026" },
      { version: 12, lastUpdated: "29 October 2026" },
      { version: 11, lastUpdated: "28 October 2026" },
      { version: 10, lastUpdated: "28 October 2026" },
      { version: 9, lastUpdated: "28 October 2026" },
      { version: 8, lastUpdated: "28 October 2026" },
      { version: 7, lastUpdated: "27 October 2026" },
      { version: 6, lastUpdated: "7 October 2026" },
      { version: 5, lastUpdated: "7 September 2026" },
      { version: 4, lastUpdated: "6 September 2026" },
      { version: 3, lastUpdated: "3 September 2026" },
      { version: 2, lastUpdated: "29 June 2026" },
      { version: 1, lastUpdated: "25 May 2026" },
    ],
  },
};

/** The current (newest) version of a policy. */
export function currentPolicy(key: PolicyKey): PolicyVersion {
  return POLICIES[key].versions[0];
}

/**
 * A single agreement version string covering BOTH policies, stored against a
 * user when they accept. Changes whenever either policy's version changes.
 */
export const CURRENT_POLICY_VERSION = `terms.${currentPolicy("terms").version}+privacy.${currentPolicy("privacy").version}`;
