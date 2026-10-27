import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { findOpenForm } from "@/lib/applications/lifecycle/openForm";
import { findPublicTerm } from "@/lib/applications/lifecycle/publicTerm";
import { loadForm } from "@/lib/applications/repo";
import { londonDateKey } from "./weekPlan";

/**
 * "WHAT’S NEXT" (boards wk-lastweek-phone, en-after-phone,
 * en-after-nofinish-phone): what a member's programme pages say about
 * applying again, in the last week and once the programme is over.
 *
 * Every fact is the term's own form's, as a visitor may be told it
 * (`findPublicTerm`, which decides which form is this term and where it
 * stands; nothing here decides it a second time): a form taking applications
 * (its term's name, the day it closes, and its own page for "Find out
 * more"), or the next one an admin has opened, which takes applications from
 * a day still to come. Nothing here is a date of a term: with no form open or
 * opening, there is nothing to say.
 *
 * "Facilitate a group next term: say so when you apply." is said only while
 * the form taking applications asks it ("Would you like to facilitate a
 * group?", `asksFacilitating`): read from that one form, which
 * `findOpenForm` picks as the term does (the one that closes first), by its
 * id. Nothing of the form but that yes or no leaves this file.
 */

export type WhatsNext = {
  /** Null while no form is taking applications or opening. */
  applications:
    | {
        kind: "open";
        /** The term, as applicants read it at the top of the form: "Spring 2027". */
        label: string;
        /** "YYYY-MM-DD" in London, or null for a form with no closing time. */
        closesOn: string | null;
        /** The form's own page. */
        href: string;
      }
    | {
        kind: "opening";
        /** "YYYY-MM-DD" in London: the day it opens. */
        opensOn: string;
      }
    | null;
  /** Whether the form taking applications asks people if they would facilitate. */
  facilitate: boolean;
};

export async function whatsNextFor(db: Firestore, now: Date): Promise<WhatsNext> {
  const term = await findPublicTerm(db, now);
  if (term.stage === "open") {
    const open = await findOpenForm(db, now);
    const form = open && open.applyPath === term.applyPath ? await loadForm(db, open.id) : null;
    return {
      applications: {
        kind: "open",
        label: term.label,
        closesOn: term.closesAt ? londonDateKey(term.closesAt) : null,
        href: term.applyPath,
      },
      facilitate: form?.asksFacilitating === true,
    };
  }
  // A form that opens later: the term itself before its first day, or the
  // next intake beside a term that is under way.
  const opensAt = term.stage === "before" ? term.opensAt : term.stage === "none" ? null : (term.next?.opensAt ?? null);
  return {
    applications: opensAt && opensAt.getTime() > now.getTime() ? { kind: "opening", opensOn: londonDateKey(opensAt) } : null,
    facilitate: false,
  };
}
