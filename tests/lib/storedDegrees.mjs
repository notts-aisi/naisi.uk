/**
 * What somebody's degree is, for each way a profile can hold one.
 *
 * ## One table, put through both readers
 *
 * Two pieces of code say what a person's degree is. The users rule in
 * `firestore.rules` reads it (`degreeOf` there) to decide whether a member's
 * own save changed it, because a change has to carry an entry saying what it
 * said before. And every page that shows a degree, searches by it or fills a
 * box with it reads it through `degreeOf` in
 * `src/features/profile/studyChange.ts`. If the two disagreed about one
 * stored profile, a page could show a degree the rule never saw change.
 *
 * So the reading is written down once, here, as stored values and the answer
 * to each, and both suites run it:
 *
 *  - `tests/profile-study-changes.test.mjs` puts every row through the
 *    function.
 *  - `scripts/rules-tests/tests/users-profile-self-edit.test.mjs` puts every
 *    row through the rule: it stores the row, changes the degree as a member,
 *    and the rule accepts the change only with an entry holding exactly the
 *    answer in the row, or with no entry where the row says there was none.
 *
 * ## The reading
 *
 * The newer `subject` where it is text with something in it. Otherwise the
 * older `course` where that is. Otherwise nothing, which is "" here. A value
 * that is not text is no answer in either field, whatever it holds.
 *
 * A row's `stored` is the two fields as the document holds them. A field left
 * out of `stored` is a field the document does not have.
 */
export const STORED_DEGREES = [
  // The newer field holds an answer.
  { stored: { subject: "Physics" }, degree: "Physics", why: "the newer field alone" },
  { stored: { subject: "Physics", course: "Maths" }, degree: "Physics", why: "both: the newer field is the answer" },
  { stored: { subject: "Physics", course: "" }, degree: "Physics", why: "an empty older field beside it" },
  { stored: { subject: "Physics", course: null }, degree: "Physics", why: "nothing in the older field beside it" },
  { stored: { subject: "Physics", course: 7 }, degree: "Physics", why: "an older field that is not text is not read" },
  { stored: { subject: " ", course: "Maths" }, degree: " ", why: "a space is text with something in it, to both readers" },

  // The newer field holds no answer, and the older one does.
  { stored: { course: "Maths" }, degree: "Maths", why: "an account from before the newer field" },
  { stored: { subject: "", course: "Maths" }, degree: "Maths", why: "an emptied newer field falls back" },
  { stored: { subject: null, course: "Maths" }, degree: "Maths", why: "nothing in the newer field falls back" },
  { stored: { subject: ["Medicine"], course: "Maths" }, degree: "Maths", why: "a list is not an answer, whatever it holds" },
  { stored: { subject: 7, course: "Maths" }, degree: "Maths", why: "a number is not an answer" },
  { stored: { subject: true, course: "Maths" }, degree: "Maths", why: "a yes or no is not an answer" },
  { stored: { subject: { name: "Medicine" }, course: "Maths" }, degree: "Maths", why: "a map is not an answer" },

  // Neither holds one.
  { stored: {}, degree: "", why: "neither field" },
  { stored: { subject: "" }, degree: "", why: "an empty newer field alone" },
  { stored: { subject: null }, degree: "", why: "nothing in the newer field alone" },
  { stored: { subject: ["Medicine"] }, degree: "", why: "a list alone" },
  { stored: { course: "" }, degree: "", why: "an empty older field alone" },
  { stored: { course: null }, degree: "", why: "nothing in the older field alone" },
  { stored: { course: 7 }, degree: "", why: "an older field that is a number" },
  { stored: { course: ["Maths"] }, degree: "", why: "an older field that is a list" },
  { stored: { subject: 7, course: ["Maths"] }, degree: "", why: "neither is text" },
];
