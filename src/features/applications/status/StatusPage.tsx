import type { ReactNode } from "react";
import Link from "next/link";
import kit from "@/features/applications/kit/kit.module.css";
import type { StatusView } from "@/lib/applications/status/view";
import Steps from "./Steps";
import styles from "./status.module.css";

/**
 * "Your application": the one page that follows an application from the day
 * it is sent to the day its outcome is answered.
 *
 * It draws a `StatusView`, which `statusViewFor` works out from the person's
 * own application and nothing else. While everybody is waiting the page is
 * the same for all of them.
 *
 * Nothing on this page is a form control, so it reads in full from the first
 * HTML, before any script runs.
 */

const CONTACT = "ai-safety@uonsu.com";

function Contact() {
  return (
    <a href={`mailto:${CONTACT}`} className={styles.link}>
      {CONTACT}
    </a>
  );
}

function PencilIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 19h4L19 9l-4-4L5 15z" />
    </svg>
  );
}

function Chip({ tone, children }: { tone?: "ok" | "accent"; children: ReactNode }) {
  return (
    <span className={styles.chip} data-tone={tone}>
      {children}
    </span>
  );
}

/** The eyebrow and "Your application", above everything but an offer. */
function Heading({ eyebrow }: { eyebrow: string }) {
  return (
    <div>
      <div className={`${kit.mono} ${styles.eyebrow}`}>{eyebrow}</div>
      <h1 className={styles.title}>Your application</h1>
    </div>
  );
}

function Frame({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <div className={styles.column}>
        <Heading eyebrow={eyebrow} />
        {children}
      </div>
    </div>
  );
}

/** A card that says one thing plainly, with at most one way on. */
function Plain({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={`${styles.card} ${styles.stack}`}>
      <h2 className={styles.cardTitle}>{title}</h2>
      <div className={styles.body}>{children}</div>
    </div>
  );
}

export default function StatusPage({ roundId, view }: { roundId: string; view: StatusView }) {
  const applyHref = `/apply/${encodeURIComponent(roundId)}`;

  if (view.kind === "none") {
    return (
      <Frame eyebrow={view.label}>
        <Plain title="No application here">
          <p>
            This account hasn’t applied for {view.label}. If you started one on a different account, sign in
            with that one and it will be here.
          </p>
          {view.window === "not-yet" ? (
            <p>
              {view.opensLabel ? (
                <>
                  Applications open on <span className={styles.together}>{view.opensLabel}</span>.
                </>
              ) : (
                "Applications aren’t open yet."
              )}
            </p>
          ) : null}
          {view.window === "closed" ? (
            <p>
              {view.closesLabel ? (
                <>
                  Applications closed on <span className={styles.together}>{view.closesLabel}</span>.
                </>
              ) : (
                "Applications have closed."
              )}
            </p>
          ) : null}
          {view.window === "open" ? (
            <div className={styles.actions}>
              <Link href={applyHref} className={`${kit.primary} ${styles.primary}`}>
                Apply for {view.label}
              </Link>
            </div>
          ) : null}
        </Plain>
      </Frame>
    );
  }

  if (view.kind === "draft") {
    return (
      <Frame eyebrow={view.label}>
        {view.open ? (
          <Plain title="You haven’t sent your application yet">
            <p>
              It’s saved but not sent, so we can’t read it yet.
              {view.closesLabel ? (
                <>
                  {" "}
                  Send it by <span className={styles.together}>{view.closesLabel}</span>.
                </>
              ) : null}
            </p>
            <div className={styles.actions}>
              <Link href={applyHref} className={`${kit.primary} ${styles.primary}`}>
                Carry on with your application
              </Link>
            </div>
          </Plain>
        ) : (
          <Plain title="Your application wasn’t sent">
            <p>
              You started an application and didn’t send it, so we don’t have one from you. If that’s not
              right, email <Contact />.
            </p>
          </Plain>
        )}
      </Frame>
    );
  }

  if (view.kind === "withdrawn") {
    return (
      <Frame eyebrow={view.label}>
        <Plain title="This application was withdrawn">
          <p>
            It isn’t being considered this term. If that’s not right, email <Contact />.
          </p>
        </Plain>
      </Frame>
    );
  }

  if (view.kind === "unclear") {
    return (
      <Frame eyebrow={view.label}>
        <Plain title="We need to check something">
          <p>
            Something about your result isn’t showing properly here. Email <Contact /> and we’ll tell you
            where things stand.
          </p>
        </Plain>
      </Frame>
    );
  }

  if (view.kind === "sent") {
    return (
      <Frame eyebrow={view.label}>
        <div className={styles.card}>
          <div className={styles.rows}>
            <div className={styles.row}>
              <Chip tone="ok">Sent</Chip>
              {view.sentLabel ? <span className={`${kit.mono} ${styles.meta}`}>{view.sentLabel}</span> : null}
            </div>
            {view.order.length > 0 ? (
              <div className={styles.group}>
                <div className={`${kit.mono} ${styles.label}`}>Your order</div>
                <ol className={styles.order}>
                  {view.order.map((name, at) => (
                    <li key={name}>
                      <span className={styles.rank}>{at + 1}</span>
                      <span>{name}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {view.facilitating ? (
              <div className={styles.group}>
                <div className={`${kit.mono} ${styles.label}`}>Facilitating</div>
                <div className={styles.value}>{view.facilitating}</div>
              </div>
            ) : null}
          </div>
          <hr className={styles.rule} />
          <Steps steps={view.steps} />
        </div>

        {view.unsentChanges ? (
          <p className={styles.problem}>
            {view.canChange ? (
              <>
                You’ve changed your answers since you sent this
                {view.sentLabel ? (
                  <>
                    {" "}
                    on <span className={styles.together}>{view.sentLabel}</span>
                  </>
                ) : null}
                . Send it again and we’ll read the new version. Until you do, we have the one you sent.
              </>
            ) : (
              <>
                You changed some answers after you sent this and didn’t send again, so we have the version you
                sent
                {view.sentLabel ? (
                  <>
                    {" "}
                    on <span className={styles.together}>{view.sentLabel}</span>
                  </>
                ) : null}
                .
              </>
            )}
          </p>
        ) : null}

        {view.canChange ? (
          <div className={styles.actions} data-gap="tight">
            <Link href={applyHref} className={styles.secondary}>
              <PencilIcon />
              <span>Change my answers</span>
            </Link>
            <p className={styles.note}>
              {view.closesLabel ? (
                <>
                  You can change them until <span className={styles.together}>{view.closesLabel}</span>.
                </>
              ) : (
                "You can change them until applications close."
              )}
            </p>
          </div>
        ) : (
          <p className={styles.note}>
            {view.closesLabel ? (
              <>
                Applications closed on <span className={styles.together}>{view.closesLabel}</span>, so your
                answers can’t be changed now.
              </>
            ) : (
              "Applications have closed, so your answers can’t be changed now."
            )}
          </p>
        )}
      </Frame>
    );
  }

  // Decision day has published something on this application.
  return (
    <Frame eyebrow={view.label}>
      <Plain title="Decisions are out">
        <p>
          Check your email for yours. If nothing has arrived, email <Contact /> and we’ll tell you where things
          stand.
        </p>
      </Plain>
    </Frame>
  );
}
