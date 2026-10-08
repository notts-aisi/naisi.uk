import Link from "next/link";
import Card from "@/components/ui/Card";
import styles from "./YourPlace.module.css";

/**
 * A PLACE SOMEBODY HOLDS, said in the member area while they are on no run.
 *
 * Decision day gives somebody a place on a programme. Until they are put on
 * a run of it, the pages that list a member's runs have nothing of theirs to
 * list, and would say they are on no programme. This card is drawn there
 * instead.
 *
 * IT SAYS WHAT THEIR OWN PAGE SAYS, AND SENDS THEM TO IT. The title and the
 * sentence are handed in, and they are the ones "Your application" shows
 * this person (`placeWordsFor`). Nothing about an application is worded
 * here, so this card and that page cannot come to say two things. The link
 * is to that page, where the reply buttons are.
 *
 * A Server Component with no state of its own: a page reads, this draws.
 * With no place it draws nothing.
 */

/** One place, as the member area names it. */
export type HeldPlace = {
  /** The form the place was given on, which is the address of the page that says so. */
  roundId: string;
  /** "You’re in AGI Strategy.": the title of the person's own page. */
  title: string;
  /** What that page says comes next, for the kind of programme they are in. */
  next: string;
};

const LIST_PATH = "/applications";

export default function YourPlace({ places }: { places: HeldPlace[] }) {
  if (places.length === 0) return null;

  return (
    <>
      {places.map((place) => (
        <Card key={place.roundId} as="section" padding="md" className={styles.card}>
          <h2 className={styles.title}>{place.title}</h2>
          <p className={styles.next}>{place.next}</p>
          <Link href={`${LIST_PATH}/${encodeURIComponent(place.roundId)}`} className={styles.link}>
            See your application →
          </Link>
        </Card>
      ))}
    </>
  );
}
