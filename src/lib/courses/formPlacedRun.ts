/**
 * WHAT THE OLDER PER-RUN APPLY PAGE AND ROUTE SAY about a run the term's
 * application form places people on.
 *
 * Such a run takes no application of its own (see `runTakesPeopleFromForm`
 * in `src/lib/applications/lifecycle/openForm.ts`, which is what decides).
 * The route answers with the sentence below and the page draws the card, so
 * the two cannot come to say different things.
 *
 * THE WORDS SAY NOTHING ABOUT THE FORM, on purpose. A form that is still a
 * draft is nobody's business, and one that has closed is not something to
 * send a visitor to. The course's own page is told where the term's form is,
 * by the form's own code, and says the right thing in every state, so that
 * is where a reader is sent.
 *
 * Words only, with no import, so the route and the page can both take them.
 */

/** The route's refusal, for a request that tries to make or change an application. */
export const APPLICATIONS_NOT_TAKEN_HERE =
  "This run doesn't take applications here. The course page says how to apply.";

/** The card the apply page draws in place of the form. */
export const NOT_TAKEN_HERE_CARD = {
  title: "Applications for this course aren't taken on this page",
  body: "People join this run another way, so there is nothing to fill in here. The course page says how to apply and when.",
  toCourse: "Go to the course page",
  toCatalogue: "Browse all courses",
} as const;
