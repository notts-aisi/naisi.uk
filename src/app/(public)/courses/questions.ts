import type { CoursePageFaq } from "@/lib/firestore/coursePages";

/**
 * The questions on the fellowships page, before somebody applies.
 *
 * These are the page's own words and are not stored: they are about applying
 * to the fellowships as a whole, where a course's page keeps the questions
 * about that one course. Two of the answers name this term's two fellowships,
 * so they need a second look whenever the programmes on offer change.
 */
export const FELLOWSHIP_QUESTIONS: CoursePageFaq[] = [
  {
    q: "Do I need a background?",
    a: "No. AGI Strategy doesn’t assume anything. For Technical AI Safety, some maths or coding helps.",
  },
  {
    q: "How much time does it take?",
    a: "About 5 hours a week for 6 weeks. That’s the reading plus the weekly discussion.",
  },
  {
    q: "Does it cost anything?",
    a: "No, it’s free.",
  },
  {
    q: "Do I need SU membership?",
    a: "We’d like everyone who takes part to get SU membership (£6 a year). It never stops you taking part.",
  },
  {
    q: "What if I miss a week?",
    a: "Tell your facilitator and catch up on the reading.",
  },
  {
    q: "Can I do both fellowships?",
    a: "You can apply for both and put them in order, but you can only have a place on one.",
  },
  {
    q: "What happens after?",
    a: "You could apply to the research incubator next time. Socials and talks carry on all year.",
  },
];
