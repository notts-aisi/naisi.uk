"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import InitialsChip from "@/components/ui/InitialsChip";
import { Input } from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Notice from "@/components/ui/Notice";
import OptionRow from "@/components/ui/OptionRow";
import PageHead from "@/components/ui/PageHead";
import ResponsiveSelect, {
  type ResponsiveSelectOption,
} from "@/components/ui/ResponsiveSelect";
import SavedFlash, { type SaveState } from "@/components/ui/SavedFlash";
import SegmentedControl, { type SegmentedOption } from "@/components/ui/SegmentedControl";
import Switch from "@/components/ui/Switch";
import type { Role } from "@/lib/firebase/session";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import {
  ALL_TRACKS,
  STATUS_LABELS,
  TRACK_LABELS,
  type Track,
  type UserDoc,
  type UserPermissions,
} from "@/lib/firestore/users";
import { startImpersonation } from "@/auth/impersonation";
import ConductFlagControl from "./ConductFlagControl";
import MemberApplicationHistory from "./MemberApplicationHistory";
import MemberEditForm from "./MemberEditForm";
import { ROLE_WORDS, accountName, joinedDay, roleTone } from "./MembersTable";
import MembershipChip from "./MembershipChip";
import StudyChangeNotes from "./StudyChangeNotes";
import {
  deleteUser,
  setPermissions,
  setRole,
  setSuRecognised,
  setTracks,
  unrejectUser,
  updateMember,
} from "./adminMutations";
import styles from "./MemberItem.module.css";

type Props = {
  user: UserDoc;
  currentAdminUid: string;
  /** Names for the uids an account document points at: who approved it, who turned it down. */
  nameByUid: ReadonlyMap<string, string>;
};

const ACTIVE_ROLES: Role[] = ["member", "committee", "admin"];

type PermissionTier = "none" | "draft" | "approve";

const PERMISSION_OPTIONS: readonly SegmentedOption<PermissionTier>[] = [
  { value: "none", label: "None" },
  { value: "draft", label: "Draft" },
  { value: "approve", label: "Draft + approve" },
];

function permissionTier(
  perms: UserPermissions | undefined,
  draftKey: keyof UserPermissions,
  approveKey: keyof UserPermissions,
): PermissionTier {
  if (perms?.[approveKey]) return "approve";
  if (perms?.[draftKey]) return "draft";
  return "none";
}

function applyTier(
  perms: UserPermissions,
  draftKey: keyof UserPermissions,
  approveKey: keyof UserPermissions,
  tier: PermissionTier,
): UserPermissions {
  // Approve implies draft, which keeps the three choices honest: there is no
  // useful "approve but not draft".
  switch (tier) {
    case "none":
      return { ...perms, [draftKey]: false, [approveKey]: false };
    case "draft":
      return { ...perms, [draftKey]: true, [approveKey]: false };
    case "approve":
      return { ...perms, [draftKey]: true, [approveKey]: true };
  }
}

/** "Mon 21 Sep", in London time. */
function shortDay(date: Date | null | undefined): string {
  return date ? formatSiteDate(date, { weekday: "short", day: "numeric", month: "short" }) : "";
}

/**
 * One person's page in the admin area: who they are, what they can do on the
 * site, the record the committee keeps of their applications, and the two
 * careful actions (viewing the site as them, deleting their account).
 *
 * Everything here is drawn from the account document the Accounts list
 * already reads, plus the same three things the list's rows used to open: the
 * membership control, the conduct flag and the application record. Every
 * permission an admin can grant has its control in this file, which is what
 * `tests/admin-permissions-keys.test.mjs` reads.
 */
export default function MemberItem({ user, currentAdminUid, nameByUid }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // The roster is a ONE-SHOT fetch, so nothing pushes a fresh document into
  // this page after a write: `user` keeps saying whatever the roster read when
  // it loaded. `saved` is what THIS page has written since, and every control
  // below is drawn off the overlay rather than off the prop. Without it a
  // toggle snapped straight back to its old value the moment the write
  // returned, and the next click resent the value that was already stored, so
  // a permission could be granted and never taken off again in that session.
  //
  // The overlay remembers WHICH document it was taken against, so a genuine
  // refresh (a new prop object) drops it and the server's answer wins, with no
  // effect and no second render to do it.
  const [saved, setSaved] = useState<{ from: UserDoc; patch: Partial<UserDoc> }>({
    from: user,
    patch: {},
  });
  const shown = saved.from === user ? { ...user, ...saved.patch } : user;

  /** Record what this page just saved, so the control it belongs to settles. */
  function remember(fields: Partial<UserDoc>) {
    setSaved((prev) => ({
      from: user,
      patch: prev.from === user ? { ...prev.patch, ...fields } : fields,
    }));
  }

  /** One write: the buttons wait, then the card says Saved or says what went wrong. */
  async function save(what: string, write: () => Promise<void>) {
    setBusy(true);
    setProblem(null);
    setSaveState("saving");
    try {
      await write();
      setSaveState("saved");
    } catch (err) {
      console.error(err);
      setSaveState("idle");
      setProblem(`That did not save: ${what}. Try again.`);
    } finally {
      setBusy(false);
    }
  }

  const isSelf = user.uid === currentAdminUid;
  const isRejected = shown.role === "rejected";
  const isAdminRole = shown.role === "admin";
  const displayName = accountName(user);
  const firstName =
    user.profile?.preferredName?.trim() || displayName.trim().split(/\s+/)[0] || displayName;
  // Gave a university email and never clicked the link that proves it.
  const uniEmailUnverified =
    Boolean(user.profile?.universityEmail) && !user.profile?.uniEmailVerifiedAt;

  function onRoleChange(next: Role) {
    if (next === shown.role) return;
    if (isSelf && next !== "admin") {
      const ok = window.confirm(
        "Demote yourself from admin? You'll lose admin access on next page load.",
      );
      if (!ok) return;
    }
    void save("the role", async () => {
      await setRole(user.uid, next);
      remember({ role: next });
    });
  }

  function onToggleShow() {
    const next = !shown.showOnMembers;
    void save("the public profile switch", async () => {
      await updateMember(user.uid, { showOnMembers: next });
      remember({ showOnMembers: next });
    });
  }

  function onToggleTrack(track: Track) {
    const current = new Set(shown.tracks ?? []);
    if (current.has(track)) current.delete(track);
    else current.add(track);
    const next = ALL_TRACKS.filter((t) => current.has(t));
    void save("the tracks", async () => {
      await setTracks(user.uid, next);
      remember({ tracks: next });
    });
  }

  function onToggleSuRecognised() {
    const next = !shown.suRecognised;
    void save("SU recognition", async () => {
      await setSuRecognised(user.uid, next);
      remember({ suRecognised: next });
    });
  }

  /** One standalone permission key, for the ones that have no draft/approve
   *  pair. `manageMembership` was the first (there is no "draft a
   *  membership"); `circulateWorksheet` is the second, because writing a
   *  worksheet is open to the whole committee and the only act left to gate
   *  is putting one in front of named people. */
  function onChangePermission(key: keyof UserPermissions, value: boolean) {
    const next = { ...(shown.permissions ?? {}), [key]: value };
    void save("what they can manage", async () => {
      await setPermissions(user.uid, next);
      remember({ permissions: next });
    });
  }

  function onChangePermissionTier(
    draftKey: keyof UserPermissions,
    approveKey: keyof UserPermissions,
    tier: PermissionTier,
  ) {
    const next = applyTier(shown.permissions ?? {}, draftKey, approveKey, tier);
    void save("what they can manage", async () => {
      await setPermissions(user.uid, next);
      remember({ permissions: next });
    });
  }

  function onUnreject() {
    void save("the join request", async () => {
      await unrejectUser(user.uid);
      remember({ role: "pending" });
    });
  }

  async function onViewAs() {
    // Plain words, because anything written during view-as is recorded as the
    // person being viewed: the session is theirs in every way that counts.
    const ok = window.confirm(
      `View the site as ${displayName}?\n\n`
        + "You'll see exactly what they see: the menu, the pages they can open.\n\n"
        + `Anything you do that saves is recorded as ${displayName} doing it.\n`
        + "Leaving signs you out, and you sign back in as yourself.",
    );
    if (!ok) return;
    setBusy(true);
    setProblem(null);
    try {
      await startImpersonation(user.uid);
      // No setBusy(false) on success: the page is navigating away.
    } catch (err) {
      console.error(err);
      setProblem(err instanceof Error ? err.message : "View as did not start.");
      setBusy(false);
    }
  }

  async function onDelete() {
    setBusy(true);
    setDeleteError(null);
    try {
      await deleteUser(user.uid);
      // The account is gone, so this page has nothing left to show.
      router.replace("/admin/members");
    } catch (err) {
      console.error(err);
      setDeleteError(err instanceof Error ? err.message : "The delete did not go through.");
      setBusy(false);
    }
  }

  const status = user.profile?.status;
  const subject = user.profile?.subject ?? user.profile?.course;
  const studies = [subject, status ? STATUS_LABELS[status] : null].filter(Boolean).join(" · ");
  const approver = user.approvedBy ? nameByUid.get(user.approvedBy) : undefined;
  const rejecter = user.rejectedBy ? nameByUid.get(user.rejectedBy) : undefined;

  // The person's name is the page's one heading. The section and the way back
  // to the list are the crumb above it; the initials sit inside the heading,
  // and say nothing to a screen reader.
  const head = (
    <PageHead
      crumb={<PersonCrumb />}
      title={
        <span className={styles.nameWithInitials}>
          <InitialsChip name={displayName} uid={user.uid} size="lg" />
          <span>{displayName}</span>
        </span>
      }
      badges={
        <>
          <Chip tone={roleTone(shown.role)}>{ROLE_WORDS[shown.role]}</Chip>
          {shown.role === "committee" && shown.suRecognised && (
            <Chip tone="neutral">SU-recognised</Chip>
          )}
          {isSelf && <Chip tone="neutral">You</Chip>}
          {uniEmailUnverified && (
            <Chip
              tone="warning"
              title="Gave a university email and never clicked the link we sent to it"
            >
              Uni email not verified
            </Chip>
          )}
        </>
      }
      meta={
        <>
          <span className={styles.metaEmail}>
            <span className={styles.metaStrong}>{user.email ?? "No email on file"}</span>
            <span className="meta">Admins only</span>
          </span>
          {user.createdAt && <span>Joined {joinedDay(user.createdAt)}</span>}
          {studies && <span>{studies}</span>}
        </>
      }
    />
  );

  // Sent back to the queue from this page a moment ago: there is nothing to
  // manage here until somebody approves the request again.
  if (shown.role === "pending") {
    return (
      <div className={styles.page}>
        {head}
        <Notice
          tone="info"
          actions={
            <Link href="/admin" className={styles.textLink}>
              Open Join requests
            </Link>
          }
        >
          {displayName} is waiting in Join requests.
        </Notice>
        <section className={styles.card} aria-labelledby={`history-${user.uid}`}>
          <h2 id={`history-${user.uid}`} className={styles.cardTitle}>
            History
          </h2>
          <MemberApplicationHistory uid={user.uid} />
        </section>
      </div>
    );
  }

  const careful = (
    <section className={`${styles.card} ${styles.careful}`} aria-labelledby={`careful-${user.uid}`}>
      <h2 id={`careful-${user.uid}`} className={styles.cardTitle}>
        Careful
      </h2>
      {!isRejected && (
        <div className={styles.carefulRow}>
          <div className={styles.carefulText}>
            <span className={styles.carefulName}>View the site as {firstName}</span>
            <span className={styles.carefulNote}>
              {isSelf
                ? "You can’t view the site as yourself."
                : isAdminRole
                  ? "You can’t view the site as another admin."
                  : "See what they see. Anything you do while you look is recorded as them, and leaving signs you out."}
            </span>
          </div>
          {!isSelf && !isAdminRole && (
            <Button variant="secondary" onClick={onViewAs} disabled={busy}>
              View as {firstName}
            </Button>
          )}
        </div>
      )}
      <div className={styles.carefulRow}>
        <div className={styles.carefulText}>
          <span className={styles.carefulName}>Delete account</span>
          <span className={styles.carefulNote}>
            {isSelf
              ? "You can’t delete your own account. Ask another admin."
              : "This can’t be undone."}
          </span>
        </div>
        {!isSelf && (
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              setTypedName("");
              setDeleteError(null);
              setDeleting(true);
            }}
          >
            Delete account…
          </Button>
        )}
      </div>
    </section>
  );

  const typedMatches = typedName.trim().toLowerCase() === displayName.trim().toLowerCase();

  const deleteDialog = (
    <Modal
      open={deleting}
      onClose={() => {
        if (!busy) setDeleting(false);
      }}
      ariaLabel={`Delete ${displayName}’s account`}
      width="md"
    >
      <form
        className={styles.dialog}
        onSubmit={(e) => {
          e.preventDefault();
          if (typedMatches && !busy) void onDelete();
        }}
      >
        <h2 className={styles.dialogTitle}>Delete {displayName}’s account?</h2>
        <div className={styles.dialogLists}>
          <div>
            <p className={`meta ${styles.goes}`}>Goes for good</p>
            <ul className={styles.dialogList}>
              <li>Their account, sign-in and profile</li>
              <li>Their mailing list choices</li>
              <li>Their applications, with the reviews and decisions on them</li>
              <li>Their place on any course, with progress and register marks</li>
              <li>Their SU membership rows here, and any conduct flag</li>
            </ul>
          </div>
          <div>
            <p className="meta">Stays</p>
            <ul className={`${styles.dialogList} ${styles.dialogListMuted}`}>
              <li>Tasks, comments, events and RSVPs they made</li>
              <li>Their worksheet answers</li>
              <li>The record the committee keeps of their applications</li>
            </ul>
          </div>
        </div>
        <label className={styles.dialogField}>
          <span className={styles.dialogLabel}>Type {displayName} to confirm</span>
          <Input
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </label>
        {deleteError && (
          <p className={styles.problem} role="alert">
            {deleteError}
          </p>
        )}
        <div className={styles.dialogActions}>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setDeleting(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={busy || !typedMatches}>
            {busy ? "Deleting…" : `Delete ${firstName}’s account`}
          </Button>
        </div>
      </form>
    </Modal>
  );

  if (isRejected) {
    return (
      <div className={styles.page}>
        {head}
        <section className={styles.card} aria-labelledby={`account-${user.uid}`}>
          <p id={`account-${user.uid}`} className="meta">
            Account
          </p>
          <div className={styles.accountState}>
            <Chip tone="danger" dot>
              Turned down
            </Chip>
            <span className={styles.accountLine}>
              {user.rejectedAt
                ? `${rejecter ? `By ${rejecter}, ` : ""}${shortDay(user.rejectedAt)}`
                : "This join request was turned down."}
            </span>
          </div>
          <p className={styles.cardNote}>
            Putting it back sends {firstName} to Join requests again, to be approved or not.
          </p>
          <div className={styles.cardActions}>
            <Button variant="secondary" onClick={onUnreject} disabled={busy}>
              Put back in Join requests
            </Button>
            <SavedFlash state={saveState} />
          </div>
          {problem && (
            <p className={styles.problem} role="alert">
              {problem}
            </p>
          )}
        </section>

        {/* Outside the branch above on purpose: what a turned-down applicant
            was told is exactly what an admin wants in front of them before
            they press delete. */}
        <section className={styles.card} aria-labelledby={`history-${user.uid}`}>
          <h2 id={`history-${user.uid}`} className={styles.cardTitle}>
            History
          </h2>
          <MemberApplicationHistory uid={user.uid} />
        </section>

        {careful}
        {deleteDialog}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {head}

      <div className={styles.summary}>
        <section className={styles.card} aria-labelledby={`account-${user.uid}`}>
          <p id={`account-${user.uid}`} className="meta">
            Account
          </p>
          <div className={styles.accountState}>
            <Chip tone="success" dot>
              Approved
            </Chip>
          </div>
          <p className={styles.cardLine}>{ROLE_WORDS[shown.role]}</p>
          {user.approvedAt && (
            <p className={styles.cardLine}>
              Approved{approver ? ` by ${approver}` : ""}, {shortDay(user.approvedAt)}
            </p>
          )}
        </section>

        <section className={styles.card} aria-labelledby={`membership-${user.uid}`}>
          <p id={`membership-${user.uid}`} className="meta">
            SU membership
          </p>
          <MembershipChip uid={user.uid} recordedYears={user.paidMembershipYears} />
          <p className={styles.cardNote}>A badge and a record. It changes nothing they can do.</p>
        </section>

        <section className={styles.card} aria-labelledby={`mailing-${user.uid}`}>
          <p id={`mailing-${user.uid}`} className="meta">
            Mailing list
          </p>
          <p className={styles.cardLine}>
            Which emails {firstName} gets, at each of their addresses, is on the Mailing list page.
          </p>
          <Link
            href={`/admin/subscriptions?audienceId=${encodeURIComponent(user.uid)}`}
            className={styles.textLink}
          >
            Open their mailing list rows
            <Arrow />
          </Link>
        </section>
      </div>

      <section className={styles.card} aria-labelledby={`access-${user.uid}`}>
        <div className={styles.cardHead}>
          <h2 id={`access-${user.uid}`} className={styles.cardTitle}>
            Role and access
          </h2>
          <SavedFlash state={saveState} />
        </div>
        {problem && (
          <p className={styles.problem} role="alert">
            {problem}
          </p>
        )}

        <div className={styles.access}>
          <div className={styles.accessColumn}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Role</span>
              <ResponsiveSelect<Role>
                className={styles.rolePicker}
                value={shown.role}
                onChange={onRoleChange}
                options={ACTIVE_ROLES.map<ResponsiveSelectOption<Role>>((r) => ({
                  value: r,
                  label: ROLE_WORDS[r],
                }))}
                disabled={busy}
                ariaLabel="Role"
              />
              {isSelf && (
                <span className={styles.fieldHint}>
                  Taking your own admin role away asks you to confirm.
                </span>
              )}
            </div>

            {shown.role === "committee" && (
              <div className={styles.field}>
                <Switch
                  checked={Boolean(shown.suRecognised)}
                  onChange={onToggleSuRecognised}
                  disabled={busy}
                  label="SU-recognised committee"
                  description="On the SU’s committee list. Can see the member directory and the committee task board."
                />
              </div>
            )}

            <div className={styles.field}>
              <span className={styles.fieldLabel}>
                Tracks <span className={styles.fieldAside}>only admins see these</span>
              </span>
              <div className={styles.trackRow}>
                {ALL_TRACKS.map((t) => {
                  const checked = (shown.tracks ?? []).includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onToggleTrack(t)}
                      disabled={busy}
                      aria-pressed={checked}
                      className={`${styles.trackPill} ${checked ? styles.trackPillOn : ""}`}
                    >
                      {TRACK_LABELS[t]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.field}>
              <Switch
                checked={Boolean(shown.showOnMembers)}
                onChange={onToggleShow}
                disabled={busy}
                label="Public profile"
                description="Shown on the public members page."
              />
            </div>
          </div>

          <div className={styles.accessColumn}>
            <span className={styles.fieldLabel}>
              Can manage
              {isAdminRole && <span className={styles.fieldAside}>an admin can do all of these</span>}
            </span>

            <div className={styles.tierRow}>
              <div className={styles.tierText}>
                <span className={styles.tierName}>Newsletter</span>
                <span className={styles.tierNote}>
                  Writes the newsletter. Draft + approve also sends it.
                </span>
              </div>
              <SegmentedControl
                ariaLabel="Newsletter permissions"
                value={permissionTier(shown.permissions, "draftNewsletter", "approveNewsletter")}
                onChange={(next) =>
                  onChangePermissionTier("draftNewsletter", "approveNewsletter", next)
                }
                options={PERMISSION_OPTIONS}
                size="sm"
                disabled={busy || isAdminRole}
              />
            </div>

            <div className={styles.tierRow}>
              <div className={styles.tierText}>
                <span className={styles.tierName}>Events</span>
                <span className={styles.tierNote}>
                  Creates events. Draft + approve also publishes them.
                </span>
              </div>
              <SegmentedControl
                ariaLabel="Event permissions"
                value={permissionTier(shown.permissions, "draftEvent", "approveEvent")}
                onChange={(next) => onChangePermissionTier("draftEvent", "approveEvent", next)}
                options={PERMISSION_OPTIONS}
                size="sm"
                disabled={busy || isAdminRole}
              />
            </div>

            <div className={styles.tierRow}>
              <div className={styles.tierText}>
                <span className={styles.tierName}>Courses</span>
                <span className={styles.tierNote}>
                  Edits courses. Draft + approve also publishes them.
                </span>
              </div>
              <SegmentedControl
                ariaLabel="Course permissions"
                value={permissionTier(shown.permissions, "draftCourse", "approveCourse")}
                onChange={(next) => onChangePermissionTier("draftCourse", "approveCourse", next)}
                options={PERMISSION_OPTIONS}
                size="sm"
                disabled={busy || isAdminRole}
              />
            </div>

            <div className={styles.optionGrid}>
              <OptionRow
                checked={Boolean(shown.permissions?.manageMembership)}
                onChange={() =>
                  onChangePermission("manageMembership", !shown.permissions?.manageMembership)
                }
                disabled={busy || isAdminRole}
                description="Creates membership years and records who has paid."
              >
                SU membership
              </OptionRow>
              <OptionRow
                checked={Boolean(shown.permissions?.circulateWorksheet)}
                onChange={() =>
                  onChangePermission("circulateWorksheet", !shown.permissions?.circulateWorksheet)
                }
                disabled={busy || isAdminRole}
                description="Sends worksheets and reads the answers."
              >
                Worksheets
              </OptionRow>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby={`profile-${user.uid}`}>
        <h2 id={`profile-${user.uid}`} className={styles.cardTitle}>
          Profile
        </h2>
        <p className={styles.cardNote}>
          What {firstName} told us when they joined. Nothing changes until you press Save changes.
        </p>
        {/* What they have since changed about their own degree or graduation,
            with what each said before. Nothing is drawn for somebody who has
            changed neither. This page is the only one that shows it. */}
        <StudyChangeNotes
          changes={user.studyChanges}
          firstName={firstName}
          status={user.profile?.status}
        />
        <MemberEditForm user={user} />
      </section>

      <section className={styles.card} aria-labelledby={`history-${user.uid}`}>
        <h2 id={`history-${user.uid}`} className={styles.cardTitle}>
          History
        </h2>
        {/* The committee's record of this person: which rounds they applied
            to, what was decided, and what the reviewers wrote. Admins only,
            which this page is. */}
        <MemberApplicationHistory uid={user.uid} />
      </section>

      {/* Not on your own page. A conduct flag is a record one admin keeps
          about another person, so a self-set one has nobody outside it who
          agreed to it; another admin can still flag this one. The route
          refuses a self-flag as well, so a hand-made request meets the same
          rule. */}
      {!isSelf && (
        <section className={styles.card}>
          <ConductFlagControl uid={user.uid} displayName={displayName} />
        </section>
      )}

      {careful}
      {deleteDialog}
    </div>
  );
}

/** The section, then the way back to the list: "People / Accounts". */
export function PersonCrumb() {
  return (
    <>
      <span>People</span>
      <span aria-hidden="true">/</span>
      <Link href="/admin/members">Accounts</Link>
    </>
  );
}

function Arrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
