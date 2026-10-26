import { redirect } from "next/navigation";
import AskAnswer from "@/features/courses/facilitating/AskAnswer";
import styles from "@/features/courses/facilitating/Facilitating.module.css";
import { isAddressableId } from "@/lib/addressableId";
import { loadAnswerPage, type AnswerPageModel } from "@/lib/courses/facilitatorAsks/answerPage";
import {
  NOT_YOURS,
  OPEN_YOUR_GROUP,
  PAGE_FIELDS,
  SAID_NO_HEADING,
  TRAINING,
  saidYesHeading,
} from "@/lib/courses/facilitatorAsks/words";
import { NAMES_WHEN_GROUPS_GO_OUT } from "@/features/courses/groupNamesWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * THE PAGE AN ASK TO FACILITATE OPENS (board st-fac-ask-phone): "Would you
 * facilitate Group D?", the group's time, first session, room and size, the
 * run's training, and "Yes, I’ll facilitate" or "I can’t this term".
 *
 * FOR THE PERSON ASKED, SIGNED IN, AND NOBODY ELSE. Anybody else is told the
 * page is somebody else's and shown nothing of the ask, the same as for an
 * address that names no ask at all. Nothing from any application is shown,
 * theirs included. Every value is from records (`loadAnswerPage`).
 *
 * Drawn on the server; the two buttons are a client component that takes the
 * ask's id and nothing else, and does nothing until the page has hydrated.
 */

export const dynamic = "force-dynamic";

function Facts({ model }: { model: Extract<AnswerPageModel, { kind: "ask" }> }) {
  const rows: [string, string | null][] = [
    [PAGE_FIELDS.when, model.rows.when],
    [PAGE_FIELDS.from, model.rows.from],
    [PAGE_FIELDS.where, model.rows.where],
    [PAGE_FIELDS.group, model.rows.group],
  ];
  return (
    <div className={styles.facts}>
      <dl className={styles.factList}>
        {rows
          .filter((row): row is [string, string] => row[1] !== null)
          .map(([label, value]) => (
            <div key={label} className={styles.fact}>
              <dt className={styles.factLabel}>{label}</dt>
              <dd className={styles.factValue}>{value}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

export default async function FacilitatePage({ params }: { params: Promise<{ askId: string }> }) {
  const [{ askId }, user] = await Promise.all([params, getCurrentUser()]);
  if (!user) redirect("/login");
  const db = getAdminDb();
  const model: AnswerPageModel =
    db && isAddressableId(askId) ? await loadAnswerPage(db, user, askId, new Date()) : { kind: "not-yours" };

  if (model.kind === "not-yours") {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>Asked to facilitate</h1>
        <p className={styles.text}>{NOT_YOURS}</p>
      </div>
    );
  }

  const open = model.state === "open";
  return (
    <div className={styles.page}>
      <div>
        <p className={styles.eyebrow}>{model.eyebrow}</p>
        <h1 className={styles.heading} tabIndex={-1} id="facilitate-heading">
          {model.state === "yes" ? saidYesHeading(model.groupName) : model.heading}
        </h1>
      </div>

      <Facts model={model} />

      {model.training ? (
        <section className={styles.training} aria-labelledby="facilitate-training">
          <h2 id="facilitate-training" className={styles.trainingTitle}>
            {TRAINING}
          </h2>
          <p className={styles.trainingLine}>{model.training.line}</p>
          <p className={styles.trainingText}>{model.training.text}</p>
        </section>
      ) : null}

      {open ? (
        <>
          <AskAnswer askId={model.askId} />
          <p className={styles.foot}>{[model.namesWhen, model.answerBy].filter(Boolean).join(" ")}</p>
        </>
      ) : model.state === "yes" ? (
        model.groupsOut ? (
          <a className={styles.groupLink} href={model.groupHref}>
            {OPEN_YOUR_GROUP}
          </a>
        ) : (
          <p className={styles.foot}>{NAMES_WHEN_GROUPS_GO_OUT}</p>
        )
      ) : model.state === "no" ? (
        <div className={styles.closed} role="status">
          <p className={styles.closedTitle}>{SAID_NO_HEADING}</p>
          <p className={styles.text}>{model.closedText}</p>
        </div>
      ) : (
        <p className={styles.closed} role="status">
          {model.closedText}
        </p>
      )}
    </div>
  );
}
