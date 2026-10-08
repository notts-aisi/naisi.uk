import Link from "next/link";
import type { ReactNode } from "react";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import shared from "./editor.module.css";

/**
 * What a committee screen shows somebody it is not for.
 *
 * Rendered as ordinary HTML in place of the page, never as a redirect: a
 * person who followed a link here is told plainly what is and is not theirs,
 * with somewhere to go next.
 *
 * "No application form here" is the answer both for a form that does not
 * exist and for one the caller has no role on. Whether a form or a programme
 * exists is not something a stranger is told, so the two read the same.
 */

const FORMS_PATH = "/admin/admissions/forms";

function Refusal({
  title,
  children,
  href,
  action,
}: {
  title: string;
  children: ReactNode;
  href: string;
  action: string;
}) {
  return (
    <ApplicationsRoot className={shared.page}>
      <section className={`${shared.card} ${shared.empty}`}>
        <h1 className={shared.cardTitle}>{title}</h1>
        <p className={shared.cardNote}>{children}</p>
        <div className={shared.emptyActions}>
          <Link href={href} className={shared.btn}>
            {action}
          </Link>
        </div>
      </section>
    </ApplicationsRoot>
  );
}

export function NoFormHere() {
  return (
    <Refusal title="There is no application form here" href={FORMS_PATH} action="See application forms">
      It may have been removed, or the link may be wrong. The forms you work on are listed under
      Admissions.
    </Refusal>
  );
}

export function NoProgrammeHere({ roundId }: { roundId: string }) {
  return (
    <Refusal
      title="There is no programme here"
      href={`${FORMS_PATH}/${encodeURIComponent(roundId)}`}
      action="See this term’s programmes"
    >
      It may have been removed, or the link may be wrong. The programmes you work on are listed on
      the term’s page.
    </Refusal>
  );
}

export function FormIsAdminOnly({ roundId }: { roundId: string }) {
  return (
    <Refusal
      title="Only an admin can change the application form"
      href={`${FORMS_PATH}/${encodeURIComponent(roundId)}`}
      action="See this term’s programmes"
    >
      The form is the same for every programme, so its questions and dates are an admin’s to set.
      Ask an admin if one of your programme’s questions needs changing.
    </Refusal>
  );
}

export function SettingsAreTheLeads({ roundId, programmeId }: { roundId: string; programmeId: string }) {
  return (
    <Refusal
      title="Settings are the lead’s"
      href={`${FORMS_PATH}/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/applications`}
      action="Go to applications"
    >
      You review this programme’s applications. Its settings are changed by its lead or an admin.
    </Refusal>
  );
}
