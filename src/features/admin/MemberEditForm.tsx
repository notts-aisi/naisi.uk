"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import CountedTextarea from "@/components/ui/CountedTextarea";
import GraduationSelect from "@/components/ui/GraduationSelect";
import StatusSelect from "@/components/ui/StatusSelect";
import { Field, Input } from "@/components/ui/Input";
import {
  FIELD_LIMITS,
  STATUSES_WITH_GRADUATION,
  subjectLabel,
  type AffiliationStatus,
  type UserDoc,
} from "@/lib/firestore/users";
import { updateMember, updateUserProfile } from "./adminMutations";
import { useUserEditLock } from "./useAdminLock";
import styles from "./MemberItem.module.css";

type Props = {
  user: UserDoc;
};

/**
 * The profile half of one person's page: what they told us when they joined,
 * editable by an admin. A plain form inside the page's Profile card.
 */
export default function MemberEditForm({ user }: Props) {
  // Hold a maintenance lock on the member ONLY once the admin actually edits a
  // field (not merely on opening the page to read it), so the member sees an
  // "under maintenance" notice and doesn't make clashing edits. Released when
  // the edit is saved or put back, and when the form unmounts.
  const [dirty, setDirty] = useState(false);
  useUserEditLock(user.uid, dirty);
  const [savedOnce, setSavedOnce] = useState(false);

  const [preferredName, setPreferredName] = useState(user.profile?.preferredName ?? "");
  const [universityEmail, setUniversityEmail] = useState(user.profile?.universityEmail ?? "");
  const [status, setStatus] = useState<AffiliationStatus | "">(user.profile?.status ?? "");
  const [statusOther, setStatusOther] = useState(user.profile?.statusOther ?? "");
  const [subject, setSubject] = useState(
    user.profile?.subject ?? user.profile?.course ?? "",
  );
  const [expectedGraduation, setExpectedGraduation] = useState(
    user.profile?.expectedGraduation ?? "",
  );
  const [motivation, setMotivation] = useState(user.profile?.motivation ?? "");
  const [interests, setInterests] = useState(user.profile?.interests ?? "");
  const [title, setTitle] = useState(user.title ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Put every field back to what the account document says, and let go of the lock. */
  function putBack() {
    setPreferredName(user.profile?.preferredName ?? "");
    setUniversityEmail(user.profile?.universityEmail ?? "");
    setStatus(user.profile?.status ?? "");
    setStatusOther(user.profile?.statusOther ?? "");
    setSubject(user.profile?.subject ?? user.profile?.course ?? "");
    setExpectedGraduation(user.profile?.expectedGraduation ?? "");
    setMotivation(user.profile?.motivation ?? "");
    setInterests(user.profile?.interests ?? "");
    setTitle(user.title ?? "");
    setBio(user.bio ?? "");
    setError(null);
    setDirty(false);
  }

  const showGraduation = status !== "" && STATUSES_WITH_GRADUATION.includes(status);
  const showStatusOther = status === "other";
  const showCommitteeTitle = user.role === "committee" || user.role === "admin";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await Promise.all([
        updateUserProfile(user.uid, {
          preferredName: preferredName.trim(),
          universityEmail: universityEmail.trim(),
          status: status || undefined,
          statusOther: showStatusOther ? statusOther.trim() : "",
          subject: subject.trim(),
          expectedGraduation: showGraduation ? expectedGraduation : "",
          motivation: motivation.trim(),
          interests: interests.trim(),
        }),
        updateMember(user.uid, {
          ...(showCommitteeTitle ? { title: title.trim() || null } : {}),
          bio: bio.trim() || null,
        }),
      ]);
      setDirty(false);
      setSavedOnce(true);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      onChange={() => {
        if (!dirty) setDirty(true);
        if (savedOnce) setSavedOnce(false);
      }}
      className={styles.formGrid}
    >
      <Field id={`pn-${user.uid}`} label="Preferred name">
        <Input
          id={`pn-${user.uid}`}
          value={preferredName}
          onChange={(e) => setPreferredName(e.target.value)}
          maxLength={FIELD_LIMITS.preferredName}
        />
      </Field>
      <Field id={`uni-${user.uid}`} label="University email">
        <Input
          id={`uni-${user.uid}`}
          type="email"
          value={universityEmail}
          onChange={(e) => setUniversityEmail(e.target.value)}
          placeholder="you@nottingham.ac.uk"
          maxLength={FIELD_LIMITS.universityEmail}
        />
      </Field>
      <Field id={`status-${user.uid}`} label="What do you do at UoN?">
        <StatusSelect id={`status-${user.uid}`} value={status} onChange={setStatus} />
      </Field>
      <Field id={`subject-${user.uid}`} label={subjectLabel(status || undefined)}>
        <Input
          id={`subject-${user.uid}`}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={FIELD_LIMITS.subject}
        />
      </Field>
      {showStatusOther && (
        <div className={styles.formWide}>
          <Field id={`statusOther-${user.uid}`} label="Describe role (Other)">
            <Input
              id={`statusOther-${user.uid}`}
              value={statusOther}
              onChange={(e) => setStatusOther(e.target.value)}
              maxLength={FIELD_LIMITS.statusOther}
            />
          </Field>
        </div>
      )}
      {showGraduation && (
        <div className={styles.formWide}>
          <Field id={`grad-${user.uid}`} label="Expected graduation">
            <GraduationSelect
              id={`grad-${user.uid}`}
              value={expectedGraduation}
              onChange={setExpectedGraduation}
            />
          </Field>
        </div>
      )}
      {showCommitteeTitle && (
        <Field
          id={`title-${user.uid}`}
          label="Committee title"
          hint="Shown on the public Members page (e.g. President, Treasurer)."
        >
          <Input
            id={`title-${user.uid}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={FIELD_LIMITS.title}
          />
        </Field>
      )}
      <div className={styles.formWide}>
        <Field id={`motivation-${user.uid}`} label="Motivation">
          <CountedTextarea
            id={`motivation-${user.uid}`}
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
            max={FIELD_LIMITS.motivation}
            rows={3}
          />
        </Field>
      </div>
      <div className={styles.formWide}>
        <Field
          id={`interests-${user.uid}`}
          label="AI safety interests"
          hint="Optional. Interpretability, alignment, governance and so on."
        >
          <CountedTextarea
            id={`interests-${user.uid}`}
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            max={FIELD_LIMITS.interests}
            rows={2}
          />
        </Field>
      </div>
      <div className={styles.formWide}>
        <Field id={`bio-${user.uid}`} label="Public bio" hint="Shown on the public Members page.">
          <CountedTextarea
            id={`bio-${user.uid}`}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            max={FIELD_LIMITS.bio}
            rows={3}
          />
        </Field>
      </div>

      {error && (
        <p className={`${styles.problem} ${styles.formWide}`} role="alert">
          {error}
        </p>
      )}

      <div className={`${styles.formActions} ${styles.formWide}`}>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={putBack} disabled={busy || !dirty}>
          Put back
        </Button>
        {savedOnce && !dirty && (
          <span className={styles.formSaved} role="status">
            Saved.
          </span>
        )}
      </div>
    </form>
  );
}
