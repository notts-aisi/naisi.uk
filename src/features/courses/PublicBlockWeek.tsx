import Prose, { Runs } from "@/features/courses/weekBlocks/Prose";
import { safeSourceUrl } from "@/lib/courses/weekBlocks/prose";
import type { PublicBlockWeek as PublicBlockWeekData, PublicSource } from "@/lib/courses/weekBlocks/publicWeek";
import styles from "./PublicBlockWeek.module.css";

/**
 * A WEEK WRITTEN AS BLOCKS, ON THE PUBLIC COURSE PAGES (Q40): Why this week,
 * After this week you can, and the sources with their times, part by part.
 * Drawn from `publicBlockWeek(...)`, the projection that leaves out everything
 * behind sign-in, never from the week's blocks. A server component: no hooks,
 * nothing sent to a browser but its HTML.
 *
 * A week written before blocks is drawn by `WeekCurriculum`, unchanged.
 */

function SourceLine({ source }: { source: PublicSource }) {
  const url = safeSourceUrl(source.url);
  const who = [source.by, source.date].filter(Boolean).join(", ");
  return (
    <>
      <span className={styles.kind}>{source.kindLabel}</span>
      <span className={styles.what}>
        {source.lead ? `${source.lead} ` : ""}
        {url ? (
          <a href={url} className={styles.link} target="_blank" rel="noopener noreferrer">
            {source.title}
          </a>
        ) : (
          source.title
        )}
        {who ? <span className={styles.who}>{`, ${who}`}</span> : null}
      </span>
      {source.time ? <span className={styles.time}>{source.time}</span> : null}
    </>
  );
}

export default function PublicBlockWeek({ week }: { week: PublicBlockWeekData }) {
  return (
    <div className={styles.week}>
      {week.why.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Why this week</h2>
          <Prose prose={week.why} className={styles.prose} linkClassName={styles.link} tableClassName={styles.table} codeClassName={styles.code} />
        </section>
      )}

      {week.outcomes && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{week.outcomes.heading}</h2>
          <ul className={styles.outcomes}>
            {week.outcomes.items.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {week.parts.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Before the session</h2>
          {week.beforeTime ? <p className={styles.beforeTime}>{week.beforeTime}</p> : null}
          <ol className={styles.parts}>
            {week.parts.map((part) => (
              <li key={part.number} className={styles.part}>
                <h3 className={styles.partTitle}>
                  Part {part.number}: {part.title}
                </h3>
                {part.time ? <p className={styles.partTime}>{part.time}</p> : null}
                <ul className={styles.sources}>
                  {part.items.map((item, index) =>
                    item.type === "source" ? (
                      <li key={index} className={styles.source}>
                        <SourceLine source={item.source} />
                      </li>
                    ) : (
                      <li key={index} className={styles.source}>
                        <span className={styles.kind}>Choose one</span>
                        <span className={styles.what}>{item.title}</span>
                        {item.time ? <span className={styles.time}>{item.time}</span> : null}
                        <ul className={styles.packs}>
                          {item.packs.map((pack, packIndex) => (
                            <li key={packIndex} className={styles.pack}>
                              {/* A list's option is its own link, so its name is not said twice. */}
                              {item.form === "table" ? <span className={styles.packName}>{pack.name}</span> : null}
                              <span className={styles.what}>
                                <Runs runs={pack.read} linkClassName={styles.link} />
                              </span>
                              {pack.time ? <span className={styles.time}>{pack.time}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ),
                  )}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
