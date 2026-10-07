"use client";

import Link from "next/link";
import { useMemo } from "react";
import Card from "@/components/ui/Card";
import PageHead from "@/components/ui/PageHead";
import { useAuth } from "@/auth/AuthProvider";
import { AdminLoadingBar, AdminPage } from "./adminList";
import MemberItem, { PersonCrumb } from "./MemberItem";
import { accountName } from "./MembersTable";
import { useMembers } from "./useMembers";
import styles from "./MemberItem.module.css";

/**
 * Finds one account on the roster and hands it to its page.
 *
 * The read is the Accounts list's own (`useMembers`, with the turned-down
 * accounts included), so this page asks Firestore nothing the list does not
 * already ask, and the roster it comes back with is also where the names of
 * whoever approved or turned down the account are looked up.
 *
 * Somebody still waiting in Join requests is not on the roster, and neither is
 * an account that has been deleted. Both are answered here in a sentence.
 */
export default function MemberPage({ uid }: { uid: string }) {
  const { user: currentUser } = useAuth();
  const { users, loading, error } = useMembers({ includeRejected: true });

  const person = useMemo(() => users.find((u) => u.uid === uid) ?? null, [users, uid]);
  const nameByUid = useMemo(
    () => new Map(users.map((u) => [u.uid, accountName(u)] as const)),
    [users],
  );

  // The signed-in admin's own id decides two things on the page (whether this
  // is their own account, and so what cannot be done to it), so the page waits
  // for it as it waits for the roster.
  if (loading || !currentUser) {
    return (
      <AdminPage wide>
        <PageHead crumb={<PersonCrumb />} title="Account" />
        <Card padding="md">
          <AdminLoadingBar label="Loading this account…" />
        </Card>
      </AdminPage>
    );
  }

  if (error) {
    return (
      <AdminPage wide>
        <PageHead crumb={<PersonCrumb />} title="Account" />
        <Card padding="md">
          <p className={styles.problem}>Couldn&apos;t load this account: {error.message}</p>
        </Card>
      </AdminPage>
    );
  }

  if (!person) {
    return (
      <AdminPage wide>
        <PageHead
          crumb={<PersonCrumb />}
          title="No account here"
          description="Nobody on the Accounts list has this address. They may still be waiting in Join requests, or the account may have been deleted."
          meta={
            <>
              <Link href="/admin/members">Back to Accounts</Link>
              <Link href="/admin">Open Join requests</Link>
            </>
          }
        />
      </AdminPage>
    );
  }

  // Keyed by the account, so one person's unsaved choices never show under
  // the next person's name when the address changes in place.
  return (
    <AdminPage wide>
      <MemberItem
        key={person.uid}
        user={person}
        currentAdminUid={currentUser.uid}
        nameByUid={nameByUid}
      />
    </AdminPage>
  );
}
