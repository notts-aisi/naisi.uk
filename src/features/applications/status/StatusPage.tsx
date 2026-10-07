import type { ReactNode } from "react";
import Link from "next/link";
import kit from "@/features/applications/kit/kit.module.css";
import { ArrowRightIcon, BackIcon } from "@/features/applications/apply/icons";
import type { StatusView } from "@/lib/applications/status/view";
import OfferBanner from "./OfferBanner";
import { InvitationReply, PlaceReply, ReplyTitle } from "./ReplyButtons";
import Steps from "./Steps";
import styles from "./status.module.css";

/**
 * "Your application": the one page that follows an application from the day
 * it is sent to the day its outcome is answered.
 *
 * It draws a `StatusView`, which `statusViewFor` works out from the person's
 * own application and nothing else. While everybody is waiting the page is
 * the same for all of them. After decision day it is the offer, the
 * invitation or the kind no that was published onto their own document.
 *
 * Nothing on this page is a form control but the reply buttons, so apart
 * from those it reads in full from the first HTML, before any script runs.
 */

const CONTACT = "ai-safety@uonsu.com";
const EVENTS = "/events";
const HUB = "/applications";

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

function Frame({
  eyebrow,
  pad,
  gap,
  children,
}: {
  eyebrow: string;
  pad?: "outcome";
  gap?: "outcome";
  children: ReactNode;
}) {
  return (
    <div className={styles.shell} data-pad={pad}>
      <div className={styles.column} data-gap={gap}>
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

const withDay = (label: string, day: string | null) => (day ? `${label} · ${day}` : label);

export default function StatusPage({
  roundId,
  view,
  viewingAs,
}: {
  roundId: string;
  view: StatusView;
  /** An admin is looking at this as the member, so nothing may be answered. */
  viewingAs: boolean;
}) {
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

  if (view.kind === "place" && view.via === "ranking") {
    const programme = view.programme;
    return (
      <div className={styles.shell} data-pad="offer">
        <div className={styles.bar}>
          <Link href={HUB} className={styles.back}>
            <BackIcon size={20} />
            <span>Your application</span>
          </Link>
        </div>
        <div className={styles.column} data-gap="offer">
          <div className={styles.banner}>
            <OfferBanner />
            {programme ? (
              <div className={styles.bannerName}>
                <span className={kit.mono}>{programme.name}</span>
              </div>
            ) : null}
          </div>
          <div className={styles.stack}>
            <div className={styles.row}>
              <Chip tone="ok">Accepted</Chip>
              <span className={`${kit.mono} ${styles.meta}`}>{withDay(view.label, view.decidedLabel)}</span>
            </div>
            <ReplyTitle as="h1" className={styles.bigTitle}>
              {programme ? `You’re in ${programme.shortName}.` : "You’re in."}
            </ReplyTitle>
            {programme?.facts ? (
              <div>
                <span className={`${kit.mono} ${styles.meta}`}>{programme.facts}</span>
              </div>
            ) : null}
          </div>
          <p className={styles.offerText}>
            You’ll be in a small group with a facilitator, on campus. Before you start, we’ll email you your
            group and when it meets.
          </p>
          <PlaceReply
            roundId={roundId}
            said={view.saidComing ? "You’ve told us you’re coming." : null}
            locked={viewingAs}
          />
          <p className={styles.questions}>
            Questions? <Contact />
          </p>
        </div>
      </div>
    );
  }

  const eyebrow = withDay(view.label, view.decidedLabel);

  if (view.kind === "place") {
    const programme = view.programme;
    return (
      <Frame eyebrow={eyebrow} pad="outcome" gap="outcome">
        <div className={`${styles.card} ${styles.stack}`}>
          <div>
            <Chip tone="ok">Accepted</Chip>
          </div>
          <div>
            <ReplyTitle as="h2" className={styles.cardTitle}>
              {programme ? `You’re in ${programme.shortName}.` : "You’re in."}
            </ReplyTitle>
            {programme?.shortFacts ? (
              <div className={styles.cardMeta}>
                <span className={`${kit.mono} ${styles.meta}`}>{programme.shortFacts}</span>
              </div>
            ) : null}
          </div>
          <div className={styles.body}>
            <p>You’ll be in a small group with a facilitator, on campus.</p>
          </div>
          <PlaceReply roundId={roundId} said="You’ve accepted your invitation." locked={viewingAs} />
        </div>
      </Frame>
    );
  }

  if (view.kind === "invitation") {
    const programme = view.programme;
    return (
      <Frame eyebrow={eyebrow} pad="outcome" gap="outcome">
        <div className={`${styles.card} ${styles.stack}`}>
          <div>
            <Chip tone="accent">Invitation</Chip>
          </div>
          <div>
            <h2 className={styles.cardTitle}>
              {programme ? `You’re invited to ${programme.shortName}.` : "You’re invited to another programme."}
            </h2>
            {programme?.shortFacts ? (
              <div className={styles.cardMeta}>
                <span className={`${kit.mono} ${styles.meta}`}>{programme.shortFacts}</span>
              </div>
            ) : null}
          </div>
          <div className={styles.body}>
            <p>
              {view.appliedFor ? `You applied for ${view.appliedFor}. ` : null}
              The pool was really strong and we don’t have space for you this time, but we think you’d be a
              great fit for {programme ? programme.shortName : "this programme"} instead.
            </p>
            <p>
              {!view.canAccept ? (
                <>
                  {view.replyByLabel ? (
                    <>
                      This invitation was open until <span className={styles.together}>{view.replyByLabel}</span>.
                    </>
                  ) : (
                    "This invitation is no longer open."
                  )}{" "}
                  Email <Contact /> and we’ll tell you whether the place is still free.
                </>
              ) : view.late && view.replyByLabel ? (
                <>
                  We asked for a reply by <span className={styles.together}>{view.replyByLabel}</span>. You can
                  still accept your invitation to let us know you’re coming.
                </>
              ) : view.replyByLabel ? (
                <>
                  Accept your invitation by <span className={styles.together}>{view.replyByLabel}</span> to let
                  us know you’re coming.
                </>
              ) : (
                "Accept your invitation to let us know you’re coming."
              )}
            </p>
          </div>
          <InvitationReply roundId={roundId} canAccept={view.canAccept} locked={viewingAs} />
        </div>
      </Frame>
    );
  }

  if (view.kind === "released") {
    const name = view.programme?.shortName ?? null;
    return (
      <Frame eyebrow={eyebrow} pad="outcome" gap="outcome">
        <div className={`${styles.card} ${styles.stack}`}>
          <div>
            <Chip>{view.how === "no-thanks" ? "Invitation turned down" : "Place given back"}</Chip>
          </div>
          <ReplyTitle as="h2" className={styles.cardTitle}>
            {view.how === "no-thanks"
              ? name
                ? `You said no thanks to ${name}.`
                : "You said no thanks to your invitation."
              : "You’ve told us you can’t make it."}
          </ReplyTitle>
          <div className={styles.body}>
            <p>
              {view.how === "no-thanks"
                ? "The place has gone back so someone else can take it."
                : name
                  ? `Your place in ${name} has gone back so someone else can take it.`
                  : "Your place has gone back so someone else can take it."}
            </p>
            <p>
              If that changes, email <Contact /> and we’ll see what we can do.
            </p>
            <p>Our events are open to everyone, so come along to one.</p>
          </div>
          <div>
            <Link href={EVENTS} className={styles.outlineSmall}>
              <span>See what’s on</span>
              <ArrowRightIcon />
            </Link>
          </div>
        </div>
      </Frame>
    );
  }

  // The kind no. Somebody every programme declined reads exactly the same
  // card as somebody with no offer: the page never says which it was.
  return (
    <Frame eyebrow={eyebrow} pad="outcome" gap="outcome">
      <div className={`${styles.card} ${styles.stack}`}>
        <div>
          <Chip>No place this term</Chip>
        </div>
        <div>
          <h2 className={styles.cardTitle}>We can’t offer you a place this term.</h2>
          {view.appliedFor ? (
            <div className={styles.cardMeta}>
              <span className={`${kit.mono} ${styles.meta}`}>Applied for {view.appliedFor}</span>
            </div>
          ) : null}
        </div>
        <div className={styles.body}>
          <p>
            {view.firstName ? `Thanks for applying, ${view.firstName}.` : "Thanks for applying."} We’ll email you
            when applications next open.
          </p>
          <p>Our events are open to everyone, so come along to one.</p>
        </div>
        <div>
          <Link href={EVENTS} className={styles.outlineSmall}>
            <span>See what’s on</span>
            <ArrowRightIcon />
          </Link>
        </div>
      </div>
    </Frame>
  );
}
