import PageHead from "@/components/ui/PageHead";
import MessagesTabs from "@/features/messages/MessagesTabs";
import SentList from "@/features/messages/SentList";
import styles from "@/features/messages/messages.module.css";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { loadSent, sentWindowOf } from "@/lib/messages/sent";
import { PAGE_WORDS, SENT_WORDS } from "@/lib/messages/words";
import { messageWriterOf } from "@/lib/messages/writers";

export const dynamic = "force-dynamic";

/**
 * Run NAISI › Messages › Sent (docs/messages.md, "Sent"): what was sent, and
 * who it reached.
 *
 * FOR THE PEOPLE WHO WRITE IN MESSAGES (`messageWriterOf`), each reading only
 * the sends to people they may write to: an admin every send on the site,
 * from Messages and from the email log; a programme's lead or a group's
 * facilitator the messages written in Messages whose every tag is one of
 * theirs (`loadSent` in src/lib/messages/sent.ts). Anybody else is told, in
 * the line Write gives them, who Messages is for. The signed-in layout has
 * already sent everybody who is not an approved account elsewhere.
 *
 * `?until=<day>` shows the two weeks ending on that London day; with none,
 * the two weeks ending today. Read on the server, from collections no
 * browser can read, and drawn from names and counts.
 */
export default async function SentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const db = getAdminDb();
  const now = new Date();
  const writer = user && db ? await messageWriterOf(db, user, now) : null;

  if (!user || !db || !writer) {
    return (
      <div className={styles.page}>
        <PageHead title={PAGE_WORDS.title} />
        <section className={styles.card}>
          <p className={styles.quiet}>{PAGE_WORDS.notForYou}</p>
        </section>
      </div>
    );
  }

  const view = await loadSent(db, user, writer, sentWindowOf(params.until, now), now);

  return (
    <div className={styles.page}>
      <PageHead title={PAGE_WORDS.title} description={view.everything ? SENT_WORDS.ledeAdmin : SENT_WORDS.lede} />
      <MessagesTabs current="sent" />
      <SentList view={view} />
    </div>
  );
}
