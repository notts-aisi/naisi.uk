"use client";

import { useId, type ReactNode } from "react";
import Link from "next/link";
import Select from "@/components/ui/Select";
import {
  FIELD_LIMITS,
  STATUSES_WITH_GRADUATION,
  STATUS_LABELS,
  subjectLabel,
  type AffiliationStatus,
} from "@/lib/firestore/users";
import type { AboutYou } from "@/lib/applications/model";
import { ABOUT_YOU_WORD_LIMITS } from "@/lib/applications/validate";
import { graduationOptions } from "./checkText";
import { LongText, TextField } from "./fields";
import styles from "./form.module.css";

/**
 * About you: the same questions as joining the site.
 *
 * For somebody with an account the step opens filled in from their profile,
 * and what they change here changes their APPLICATION, not their profile.
 * The university email is the account's own and is shown, not edited: it is
 * only trusted because its owner followed a link we emailed to it, and a box
 * that could retype it would undo that. See
 * `src/lib/applications/applicant/account.ts`.
 *
 * For somebody with no join request the same questions ARE the join request
 * (`JoinStep.tsx` draws this step for them). They have no account address
 * yet, so the university email is a box to type into: `email.kind` is
 * `"typed"`, and nothing on that version of the step is saved to an
 * application until the join request has been sent.
 */

/** The order the join form lists them in. */
const STATUS_ORDER: AffiliationStatus[] = [
  "foundation",
  "undergraduate",
  "masters",
  "phd",
  "postdoc",
  "employee",
  "other",
];

const STUDENT: readonly string[] = STATUSES_WITH_GRADUATION;

/**
 * The university email, one of two ways.
 *
 * `account`: the address on the account, with whether its owner has proved
 * it. `check` is drawn under the box when the address still has to be
 * checked before this person can send (see `UniversityCheck.tsx`).
 *
 * `typed`: no account holds an address yet, so the person types one.
 */
export type AboutEmail =
  | { kind: "account"; address: string; verified: boolean; profileHref: string | null; check?: ReactNode }
  | { kind: "typed" };

export default function AboutStep({
  about,
  email,
  onChange,
  problems,
}: {
  about: AboutYou;
  email: AboutEmail;
  onChange: (patch: Partial<AboutYou>) => void;
  /** Sentences for what is missing, shown once the person has tried to send. */
  problems: readonly string[];
}) {
  const statusId = useId();
  const graduationId = useId();
  const graduates = STUDENT.includes(about.status);
  const years = graduationOptions(new Date().getFullYear(), about.expectedGraduation);
  const subject = graduates || !about.status ? "Degree" : subjectLabel(about.status as AffiliationStatus);

  return (
    <div className={styles.body}>
      {problems.length > 0 ? (
        <div className={styles.notice} data-tone="warn" role="alert">
          <ul>
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <TextField
        label="Preferred name"
        first={about.preferredName}
        onChange={(preferredName) => onChange({ preferredName })}
        maxLength={FIELD_LIMITS.preferredName}
        autoComplete="given-name"
      />

      {email.kind === "typed" ? (
        <TextField
          label="University email"
          type="email"
          first={about.universityEmail}
          onChange={(universityEmail) => onChange({ universityEmail })}
          placeholder="you@nottingham.ac.uk"
          maxLength={FIELD_LIMITS.universityEmail}
          autoComplete="email"
          inputMode="email"
          helpBelow="We’ll email you a link to check it’s yours."
        />
      ) : (
        <div>
          <TextField
            label="University email"
            type="email"
            first={email.address}
            onChange={() => {}}
            readOnly
            adornment={
              email.verified ? (
                <span className={styles.chip} data-tone="ok">
                  <span aria-hidden="true" className={styles.chipDot} />
                  Verified
                </span>
              ) : null
            }
            helpBelow={
              email.address ? (
                <>
                  This is the address on your account.
                  {email.profileHref ? (
                    <>
                      {" "}
                      <Link href={email.profileHref} className={styles.inlineLink}>
                        Change it on your profile
                      </Link>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  Your account has no university email yet.
                  {email.profileHref ? (
                    <>
                      {" "}
                      <Link href={email.profileHref} className={styles.inlineLink}>
                        Add one on your profile
                      </Link>
                      , then come back to this form.
                    </>
                  ) : (
                    <> Email ai-safety@uonsu.com and we’ll add it for you.</>
                  )}
                </>
              )
            }
          />
          {email.check ?? null}
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor={statusId} className={styles.label}>
          What do you do at UoN?
        </label>
        <Select
          id={statusId}
          className={styles.select}
          value={about.status}
          onChange={(event) => {
            const status = event.currentTarget.value;
            onChange({
              status,
              statusOther: status === "other" ? about.statusOther : "",
              expectedGraduation: STUDENT.includes(status) ? about.expectedGraduation : "",
            });
          }}
        >
          <option value="">Choose one</option>
          {STATUS_ORDER.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </div>

      {about.status === "other" ? (
        <TextField
          label="Describe your role"
          first={about.statusOther}
          onChange={(statusOther) => onChange({ statusOther })}
          maxLength={FIELD_LIMITS.statusOther}
        />
      ) : null}

      <div className={graduates || !about.status ? styles.pair : undefined}>
        <TextField
          label={subject}
          first={about.subject}
          onChange={(value) => onChange({ subject: value })}
          placeholder="BSc Physics"
          maxLength={FIELD_LIMITS.subject}
        />
        {graduates || !about.status ? (
          <div className={styles.field}>
            <label htmlFor={graduationId} className={styles.label}>
              Expected graduation
            </label>
            <Select
              id={graduationId}
              className={styles.select}
              value={about.expectedGraduation}
              onChange={(event) => onChange({ expectedGraduation: event.currentTarget.value })}
            >
              <option value="">Month and year</option>
              {years.map((group) => (
                <optgroup key={group.year} label={String(group.year)}>
                  {group.months.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
        ) : null}
      </div>

      <LongText
        label="Why are you interested in AI safety?"
        first={about.motivation}
        onChange={(motivation) => onChange({ motivation })}
        wordLimit={ABOUT_YOU_WORD_LIMITS.motivation}
        maxLength={FIELD_LIMITS.motivation}
        rows={3}
      />

      <LongText
        label="Interests within AI safety"
        optional
        first={about.interests}
        onChange={(interests) => onChange({ interests })}
        wordLimit={ABOUT_YOU_WORD_LIMITS.interests}
        maxLength={FIELD_LIMITS.interests}
        rows={2}
      />
    </div>
  );
}
