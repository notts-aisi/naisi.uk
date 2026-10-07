"use client";

import { useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { downloadCSV, toCSV } from "@/lib/csv";
import {
  AdminLoadingBar,
  AdminListFooter,
  AdminTable,
  useClientPagination,
} from "./adminList";
import { AdminPanel, AdminProblem, AdminStat, AdminStats } from "./adminPanels";
import { useNewsletterSubscribers, type Subscriber } from "./useNewsletterSubscribers";
import styles from "./NewsletterTable.module.css";

type EmailView = "preferred" | "gmail" | "uni";

function deliveryEmails(s: Subscriber, view: EmailView): string[] {
  const gmail = s.gmailEmail ?? "";
  const uni = s.universityEmail ?? "";
  if (view === "gmail") return gmail ? [gmail] : [];
  if (view === "uni") return uni ? [uni] : [];
  // "preferred": follow each user's delivery prefs, fall back to gmail.
  const out: string[] = [];
  if (s.deliverToGmail && gmail) out.push(gmail);
  if (s.deliverToUniEmail && uni) out.push(uni);
  if (out.length === 0 && gmail) out.push(gmail);
  return out;
}

function subscribersToCSV(rows: Subscriber[]): string {
  return toCSV(
    ["displayName", "role", "gmailEmail", "universityEmail", "deliverToGmail", "deliverToUniEmail"],
    rows.map((r) => [
      r.displayName,
      r.role,
      r.gmailEmail ?? "",
      r.universityEmail ?? "",
      r.deliverToGmail,
      r.deliverToUniEmail,
    ]),
  );
}

export default function NewsletterTable() {
  const { subs, loading, refreshing, error, reload } = useNewsletterSubscribers();
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const { shown, hasMore, loadMore, total, shownCount } = useClientPagination(subs, 20);

  const counts = useMemo(() => {
    let gmail = 0;
    let uni = 0;
    for (const s of subs) {
      if (s.deliverToGmail && s.gmailEmail) gmail += 1;
      if (s.deliverToUniEmail && s.universityEmail) uni += 1;
    }
    return { gmail, uni };
  }, [subs]);

  async function copyAddresses(view: EmailView) {
    const emails = subs.flatMap((s) => deliveryEmails(s, view));
    const unique = Array.from(new Set(emails)).join(", ");
    if (!unique) {
      setCopyStatus("No addresses to copy for that view.");
      return;
    }
    try {
      await navigator.clipboard.writeText(unique);
      setCopyStatus(`Copied ${unique.split(", ").length} address(es).`);
    } catch (err) {
      console.error(err);
      setCopyStatus("Copy failed: the browser blocked clipboard access.");
    }
    setTimeout(() => setCopyStatus(null), 3000);
  }

  function onDownload() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCSV(`naisi-newsletter-${stamp}.csv`, subscribersToCSV(subs));
  }

  if (loading) {
    return (
      <Card padding="md">
        <AdminLoadingBar label="Loading subscribers…" />
      </Card>
    );
  }
  if (error) {
    return <AdminProblem>Couldn&apos;t load subscribers: {error.message}</AdminProblem>;
  }

  return (
    <>
      <AdminStats label="Newsletter recipients">
        <AdminStat
          value={subs.length}
          label={subs.length === 1 ? "subscriber" : "subscribers"}
          note="Opted in from their profile"
        />
        <AdminStat
          value={counts.gmail}
          label="deliver to Gmail"
          note="The address they signed in with"
        />
        <AdminStat
          value={counts.uni}
          label="deliver to their university email"
          note="Where they have asked for it"
        />
      </AdminStats>

      <AdminPanel
        title="Take the list"
        description="“Honour preferences” copies each person’s chosen inbox or inboxes. Somebody who has not chosen gets their Gmail address."
      >
        <div className={styles.actions}>
          <Button size="sm" onClick={() => copyAddresses("preferred")}>
            Copy (honour preferences)
          </Button>
          <Button size="sm" variant="secondary" onClick={() => copyAddresses("gmail")}>
            Copy Gmail addresses
          </Button>
          <Button size="sm" variant="secondary" onClick={() => copyAddresses("uni")}>
            Copy university addresses
          </Button>
          <Button size="sm" variant="secondary" onClick={onDownload}>
            Download CSV
          </Button>
        </div>
        {copyStatus && (
          <p className={styles.status} role="status">
            {copyStatus}
          </p>
        )}
      </AdminPanel>

      {subs.length === 0 ? (
        <Card padding="md">
          <p className={styles.muted}>
            No subscribers yet. Members can opt in from their{" "}
            <a href="/profile" className={styles.link}>
              profile
            </a>
            .
          </p>
        </Card>
      ) : (
        <AdminTable caption="Newsletter recipients" minWidth="48rem" stackOnPhone>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Account</th>
              <th scope="col">Gmail</th>
              <th scope="col">University email</th>
              <th scope="col">Delivery</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.uid}>
                <td className={styles.name}>{s.displayName}</td>
                <td data-label="Account">
                  <Badge tone="neutral">{s.role}</Badge>
                </td>
                <td data-label="Gmail" className={styles.address}>
                  {s.gmailEmail ?? <span className={styles.muted}>None</span>}
                </td>
                <td data-label="University" className={styles.address}>
                  {s.universityEmail ?? <span className={styles.muted}>None</span>}
                </td>
                <td data-label="Delivery">
                  <div className={styles.deliveryCell}>
                    {s.deliverToGmail && <Badge tone="accent">Gmail</Badge>}
                    {s.deliverToUniEmail && <Badge tone="accent">University</Badge>}
                    {!s.deliverToGmail && !s.deliverToUniEmail && (
                      <Badge tone="warning">No inbox set</Badge>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}

      {!loading && !error && total > 0 && (
        <AdminListFooter
          shownCount={shownCount}
          total={total}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onRefresh={reload}
          refreshing={refreshing}
          noun="subscribers"
        />
      )}
    </>
  );
}
