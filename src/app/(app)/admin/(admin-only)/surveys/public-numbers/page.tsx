import Link from "next/link";
import PageHead from "@/components/ui/PageHead";
import { AdminPage } from "@/features/admin/adminList";
import PublicNumbersEditor, { type EditorProgramme } from "@/features/surveys/admin/PublicNumbersEditor";
import styles from "@/features/surveys/admin/publicNumbers.module.css";
import { getAdminDb } from "@/lib/firebase/admin";
import { publishedQuoteIds } from "@/lib/surveys/publicNumbers";
import { listNumbersProgrammes, loadOffer, publisherName, readPublished, type NumbersProgramme } from "@/lib/surveys/publicNumbersLoad";
import { PUBLIC_NUMBERS_WORDS as WORDS } from "@/lib/surveys/publicNumbersWords";
import { dayWords } from "@/lib/surveys/words";

export const dynamic = "force-dynamic";

/** The picker's value for a programme: its form's id and its own, joined by a dot no id holds. */
const keyOf = (programme: Pick<NumbersProgramme, "roundId" | "programmeId">) => `${programme.roundId}.${programme.programmeId}`;

/**
 * Run NAISI › Surveys › Public numbers (sv-public): an admin picks numbers
 * from a programme's own surveys, each with the answers it rests on, and the
 * comments their writers ticked "You can quote this, without my name", sees
 * them as the programme's public page will draw them on a phone and on a
 * computer, and publishes them, or takes them down.
 *
 * Under `(admin-only)`, so the group's layout (`requireAdminPage()`) is the
 * gate, and both routes ask again. Read on the server: the offer is counted
 * here (`loadOffer`) and handed to the page as numbers and words, never an
 * answer. A programme is picked by `?programme=<form>.<programme>`, the first
 * one listed when the address names none.
 */
export default async function PublicNumbersPage({ searchParams }: { searchParams: Promise<{ programme?: string | string[] }> }) {
  const db = getAdminDb();
  const programmes = db ? await listNumbersProgrammes(db) : [];
  const asked = (await searchParams).programme;
  const wanted = typeof asked === "string" ? asked : "";
  const current = programmes.find((programme) => keyOf(programme) === wanted) ?? programmes[0] ?? null;
  const crumb = <Link href="/admin/surveys">{WORDS.crumb}</Link>;
  if (!db || !current) {
    return (
      <AdminPage wide>
        <PageHead title={WORDS.title} description={WORDS.lede} crumb={crumb} />
        <p className={styles.line}>{WORDS.noProgrammes}</p>
      </AdminPage>
    );
  }
  const [offer, published] = await Promise.all([loadOffer(db, current), readPublished(db, current)]);
  const name = published ? await publisherName(db, published.publishedByUid) : "";
  // Two programmes of one name (the same fellowship in two terms) are told apart by their term.
  const named = (programme: NumbersProgramme) =>
    programmes.filter((each) => each.name === programme.name).length > 1 ? `${programme.name}, ${programme.term}` : programme.name;
  const options: EditorProgramme[] = programmes.map((programme) => ({ value: keyOf(programme), label: named(programme) }));
  return (
    <AdminPage wide>
      <PageHead title={WORDS.title} description={WORDS.lede} crumb={crumb} />
      <PublicNumbersEditor
        key={keyOf(current)}
        programmes={options}
        current={keyOf(current)}
        programme={{ roundId: current.roundId, programmeId: current.programmeId, name: current.name }}
        offer={{
          numbers: offer.numbers.map((number) => ({ id: number.id, label: number.label, base: number.base, figure: number.figure, words: number.words })),
          quotes: offer.quotes.map((quote) => ({ id: quote.id, text: quote.text })),
          heading: offer.heading,
          attribution: offer.attribution,
          footer: offer.footer,
        }}
        picked={{
          numbers: published ? published.numbers.map((number) => number.id).filter((id) => offer.numbers.some((number) => number.id === id)) : [],
          quotes: published ? publishedQuoteIds(offer, published.quotes) : [],
        }}
        publishedLine={published ? (published.publishedAt ? WORDS.publishedLine(dayWords(published.publishedAt), name) : WORDS.publishedNow) : null}
      />
    </AdminPage>
  );
}
