import PageHead from "@/components/ui/PageHead";
import MessageComposer, { type ComposerPostTarget } from "@/features/messages/MessageComposer";
import styles from "@/features/messages/messages.module.css";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { postTargetsOf } from "@/lib/messages/posting";
import { PAGE_WORDS, postWords } from "@/lib/messages/words";
import { messageWriterOf } from "@/lib/messages/writers";

export const dynamic = "force-dynamic";

/**
 * Run NAISI › Messages (docs/messages.md): one composer for writing to
 * people, on the picker.
 *
 * FOR ADMINS, A PROGRAMME'S LEAD AND A GROUP'S FACILITATOR
 * (`messageWriterOf`), each writing to the tags the picker's scope gives
 * them. Any other approved account is told, in a line, who Messages is for:
 * the menu draws the entry only for the people who write, so somebody here
 * by its address is told rather than sent away. The signed-in layout has
 * already sent everybody who is not an approved account elsewhere.
 *
 * `?for=<tag>` starts the composer with that tag, when it is one of the tags
 * this writer could also post on a programme's page: the way a programme's
 * Messages tab opens Messages set to that programme. Anything else is left
 * out, and the composer starts empty.
 */
export default async function MessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const db = getAdminDb();
  const writer = user && db ? await messageWriterOf(db, user, new Date()) : null;

  if (!writer) {
    return (
      <div className={styles.page}>
        <PageHead title={PAGE_WORDS.title} />
        <section className={styles.card}>
          <p className={styles.quiet}>{PAGE_WORDS.notForYou}</p>
        </section>
      </div>
    );
  }

  const postTargets: ComposerPostTarget[] = postTargetsOf(writer).map((target) => ({
    tagId: target.tagId,
    programme: target.programme,
    words: postWords(target.programme, target.to, target.group),
  }));
  const asked = typeof params.for === "string" ? params.for : null;
  const initial = asked && postTargets.some((target) => target.tagId === asked) ? [asked] : [];

  return (
    <div className={styles.page}>
      <PageHead title={PAGE_WORDS.title} description={PAGE_WORDS.lede} />
      <MessageComposer initial={initial} postTargets={postTargets} />
    </div>
  );
}
