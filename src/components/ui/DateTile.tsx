import styles from "./DateTile.module.css";

type DateTileProps = {
  /** A short weekday, in sentence case: "Fri". The capitals are CSS. */
  weekday: string;
  /** The day of the month: 16. */
  day: number | string;
  /** A short month, in sentence case: "Oct". */
  month: string;
  /**
   * `sm` (the default) is the boxed 46px tile of a list row. `md`, `lg` and
   * `hero` are the stub at the left of an event card: 84px, 96px, and one
   * that grows with the window for a page's next date.
   */
  size?: "sm" | "md" | "lg" | "hero";
  /**
   * The machine-readable date, e.g. "2026-10-16". When given, the tile is a
   * <time> element. Leave it out where the page already has a <time> for the
   * same date, so the date is not announced twice.
   */
  dateTime?: string;
  className?: string;
};

/**
 * A date as three stacked lines: the weekday and the month in the metadata
 * face, the day of the month in the display face. The month is the live
 * colour, the one place a date carries it.
 *
 * It formats nothing. The caller passes the three parts already worked out
 * in the site's time zone (`src/lib/datetime/siteTime`), so the tile renders
 * the same on the server and in the browser.
 */
export default function DateTile({
  weekday,
  day,
  month,
  size = "sm",
  dateTime,
  className,
}: DateTileProps) {
  const cls = [styles.tile, styles[size], className ?? ""].filter(Boolean).join(" ");
  const parts = (
    <>
      <span className={styles.weekday}>{weekday}</span>
      <span className={styles.day}>{day}</span>
      <span className={styles.month}>{month}</span>
    </>
  );
  return dateTime ? (
    <time className={cls} dateTime={dateTime}>
      {parts}
    </time>
  ) : (
    <span className={cls}>{parts}</span>
  );
}
