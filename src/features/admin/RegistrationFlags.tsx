"use client";

import Chip from "@/components/ui/Chip";
import Notice from "@/components/ui/Notice";
import type { RegistrationSummary } from "@/lib/firestore/registrations";
import { AdminPanel, AdminTile, AdminTiles } from "./adminPanels";
import styles from "./Registrations.module.css";

/**
 * Sign-up activity: anything that looks wrong (a burst of new accounts, a
 * high rate of failed bot checks, a backlog of unfinished sign-ups), then the
 * counts for the whole collection and the two signals behind the flags.
 *
 * The counts come from the summary route, which counts every row. The table
 * under this card shows the rows that have been loaded so far, which can be
 * fewer.
 */
export default function RegistrationFlags({ summary }: { summary: RegistrationSummary }) {
  const { counts, velocity, recaptcha, flags } = summary;
  return (
    <AdminPanel
      title="Sign-up activity"
      badges={flags.length === 0 ? <Chip tone="success">No flags</Chip> : undefined}
    >
      {flags.length > 0 && (
        <ul className={styles.flagList}>
          {flags.map((f, i) => (
            <li key={`${f.kind}-${i}`}>
              {/* Amber and red are both drawn as a warning: the words say how
                  bad it is, and a red fill is kept for nothing. */}
              <Notice tone="warning" role="note" title={f.level === "red" ? "Urgent" : undefined}>
                {f.message}
              </Notice>
            </li>
          ))}
        </ul>
      )}

      <AdminTiles label="Sign-ups, counted over every row">
        <AdminTile value={counts.total} label="Total" />
        <AdminTile value={counts.pendingVerify} label="Pending verify" />
        <AdminTile value={counts.verifiedNoPassword} label="Verified, no password" />
        <AdminTile value={counts.pendingProfile} label="No profile yet" />
        <AdminTile value={counts.completed} label="Completed" />
        <AdminTile value={counts.orphans} label="Unfinished" />
      </AdminTiles>

      <p className={styles.metaLine}>
        <strong>{velocity.last1h}</strong> new in the last hour ·{" "}
        <strong>{velocity.last24h}</strong> in 24 hours · the bot check failed{" "}
        <strong>{Math.round(recaptcha.failRate * 100)}%</strong> of the time ({recaptcha.failed} of{" "}
        {recaptcha.attempts} over {recaptcha.windowDays} days)
      </p>
    </AdminPanel>
  );
}
