import { fetchPublicTerm } from "@/features/term/fetchPublicTerm";
import HomeHero from "./HomeHero";
import StayInTouch from "./StayInTouch";
import ThisTerm from "./ThisTerm";
import UpcomingEvents from "./UpcomingEvents";
import WorkOnAiSafety from "./WorkOnAiSafety";

/**
 * The homepage. Top to bottom:
 *
 *  1. The hero: the mark, the headline, the lede, two buttons, the term's
 *     status line and the award.
 *  2. "This term": the term's dates, a card for each programme, and the row
 *     about leading a group. Left out when there is no term.
 *  3. "Work on AI safety": what the field is and the two ways into it.
 *  4. "What's on": the next three public events. Left out when there are none.
 *  5. The mailing list form, at `#stay-in-touch`.
 *
 * WHERE THE TERM IS decides the hero's buttons, its status line and the chip
 * on each programme. That comes from `fetchPublicTerm()`, which asks the
 * term's own form, and never from a date written here. The five answers:
 *
 *  - `none`: no form a visitor may be told about. The hero asks people onto
 *    the mailing list, there is no status line and no "This term".
 *  - `before`: the form's opening is ahead.
 *  - `open`: the form is taking applications. The only stage with a link to
 *    the form.
 *  - `closed`: applications have closed and decisions have not gone out.
 *  - `running`: decisions have gone out.
 *
 * Each section is handed the FIELDS it prints, never the term itself.
 */

// Rendered per request, as the fellowships and incubator pages are, so a form
// opening or closing, and an event being published, edited or deleted, reach
// the page without a deploy. NOT prerendered and refreshed on a timer: the
// build has no database, so the copy it makes has no term in it, and every
// fresh server instance would hand that copy to its first visitor. That is a
// homepage with no status line and no Apply while applications are open. The
// form's own page still decides for itself whether it is open.
export const dynamic = "force-dynamic";

export default async function Landing() {
  const term = await fetchPublicTerm();
  const { stage, label, opensAt, closesAt, decisionsByDate, applyPath, programmes } = term;
  const nextLabel = term.next?.label ?? null;
  const nextOpensAt = term.next?.opensAt ?? null;

  return (
    <>
      <HomeHero
        stage={stage}
        opensAt={opensAt}
        closesAt={closesAt}
        decisionsByDate={decisionsByDate}
        applyPath={applyPath}
        nextLabel={nextLabel}
        nextOpensAt={nextOpensAt}
      />
      <ThisTerm
        stage={stage}
        label={label}
        closesAt={closesAt}
        decisionsByDate={decisionsByDate}
        applyPath={applyPath}
        programmes={programmes}
      />
      <WorkOnAiSafety />
      <UpcomingEvents />
      <StayInTouch />
    </>
  );
}
