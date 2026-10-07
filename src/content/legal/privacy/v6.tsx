/**
 * Version 6 of the Privacy Policy, written for the application form: one form
 * a term for the fellowships and the incubator (`docs/applications.md`).
 *
 * What changed from v5, in the words an applicant would use:
 *
 *  1. **The people who read your application see your name.** This is the
 *     material change, and the reason this is a new version rather than an
 *     edit. v5 said reviewers scored with names hidden unless a round's
 *     author switched that off, and that the form would say so when they had.
 *     An application form is made with names shown (`createForm` in
 *     `src/lib/applications/editor/write.ts`), every screen that reads an
 *     application shows whose it is, and the form itself does not say so. So
 *     this page is where an applicant is told.
 *  2. **Who reads an application is named.** Admins, and the lead and the
 *     reviewers of each programme the person ranked, or joined by accepting an
 *     invitation: the predicate is `canReadApplication` in
 *     `src/lib/applications/access.ts`. v5 described one final decider, which
 *     an application form does not have.
 *  3. **What the form asks.** Its own copy of the joining questions, the
 *     ranking, facilitating, availability in quarter hours, and SU membership.
 *     Its last step has the optional access-requirements box, kept apart from
 *     the application, which only an admin can open and whose every read is
 *     recorded (`src/lib/applications/review/accessRequirements.ts`).
 *  4. **Two copies, and the versions before.** A draft and the application of
 *     record, with what a later send replaces kept for the people reviewing,
 *     up to the limit in `SENT_HISTORY_LIMITS`.
 *  5. **Scores, comments and decisions are kept beside the application, never
 *     on it.** Nothing about a decision reaches the applicant's own record,
 *     their page or their inbox before decision day.
 *  6. **Decision day, reminders and replies.** One outcome, one email, a
 *     daily reminder for an unanswered invitation, what each reply records,
 *     and that a place approves a join request that was still waiting.
 *  7. **What stays afterwards.** The short record names what it holds for an
 *     application made on the form, that only admins can read it and when it
 *     is written; a deletion also removes the decisions; the log lines about
 *     a decision hold the applicant's account id, never a name, and stay;
 *     destroying a term's applications is described.
 *  8. **Smaller corrections that follow from the same system.** A score is an
 *     average and not a sum, a conduct flag is not shown on the review
 *     screens, and the examples of email we send name the decision.
 *  9. **Joining on the form.** Somebody with no account makes their request
 *     to join on the form's first step. What they type stays in the browser
 *     until they have signed in, and for somebody who continues with an email
 *     address a copy is kept, for an hour at most, where the tab the emailed
 *     link opens can read it (`keptAnswers.ts`). The spam check and Google's
 *     sign-in script load only at the point an account is made, and an
 *     account still waiting to be approved cannot send until its university
 *     address is verified (`sendHoldFor`).
 * 10. **Where the spam check runs.** The event sign-up form is named beside
 *     the registration and application forms, because it runs there too.
 *
 * v5 IS FROZEN AS ACCEPTED. It is the wording members agreed to at sign-in
 * while it was current, so it is a digest in `tests/privacy-policy.test.mjs`
 * and it renders unchanged at /privacy/v/5. Item 1 reverses a promise v5 made,
 * which is precisely the kind of change nobody may make in place: editing v5
 * would have altered what an archive URL shows without moving
 * CURRENT_POLICY_VERSION, so nobody would ever have been asked. A new version
 * is what asks.
 *
 * v1 to v5 are FROZEN: they still render unchanged at their archive URLs
 * (/privacy/v/1 through /privacy/v/5), so this file is a copy-and-edit of the
 * version before it rather than a refactor of it. Never reach into an older
 * version to share markup with this one.
 *
 * EVERY SENTENCE HERE ABOUT THE APPLICATION FORM DESCRIBES CODE. When that
 * code changes what it stores, who it shows it to or what it sends, the
 * sentence is wrong from that day, and the fix is a new version, never an
 * edit to this file once it has been published.
 */
import type { ReactNode } from "react";
import Badge from "@/components/ui/Badge";
import styles from "../legal.module.css";

const TITLE = "Privacy policy";

const SECTIONS = [
  { id: "who-we-are", label: "Who we are" },
  { id: "data-we-collect", label: "Data we collect" },
  { id: "courses", label: "Courses and programmes" },
  { id: "how-we-use-it", label: "How we use it" },
  { id: "legal-bases", label: "Legal bases" },
  { id: "sharing", label: "Sharing and processors" },
  { id: "cookies", label: "Cookies and local storage" },
  { id: "retention", label: "Retention" },
  { id: "transfers", label: "International transfers" },
  { id: "your-rights", label: "Your rights" },
  { id: "security", label: "Security" },
  { id: "changes", label: "Changes to this policy" },
];

export default function PrivacyContentV6({
  meta,
  banner,
}: {
  meta?: ReactNode;
  banner?: ReactNode;
}) {
  return (
    <section className={styles.page}>
      <div className="container">
        <div className={styles.inner}>
          <Badge>Legal</Badge>
          <h1 className={styles.heading}>{TITLE}</h1>
          {banner}
          <p className={styles.lede}>
            This page explains what personal data we collect when you use the
            NAISI website, why we collect it, and what choices you have. We
            have tried to keep it plain. If you apply to one of our courses or
            take part in one, the{" "}
            <a href="#courses">Courses and programmes</a> section is the one
            to read.
          </p>
          {meta}

          <nav className={styles.tocCard} aria-label="On this page">
            <div className={styles.tocTitle}>On this page</div>
            <ul className={styles.tocList}>
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div className={styles.sections}>
            <section id="who-we-are" className={styles.section}>
              <h2>Who we are</h2>
              <p>
                The Nottingham AI Safety Initiative (NAISI) is a student
                society at the University of Nottingham, affiliated with the
                University of Nottingham Students&apos; Union. For the purposes
                of UK data protection law, NAISI is the data controller for
                personal data processed through this website.
              </p>
              <p>
                This site is for university students and staff. We do not
                knowingly collect data from anyone under 16. If you think a
                child has given us their data, email us and we will remove it.
              </p>
              <p>
                You can reach us at{" "}
                <a href="mailto:ai-safety@uonsu.com">ai-safety@uonsu.com</a>{" "}
                with any privacy question, including requests to exercise the
                rights described below.
              </p>
            </section>

            <section id="data-we-collect" className={styles.section}>
              <h2>Data we collect</h2>
              <p>
                We only collect what we need to run the society and the site.
                The categories below cover everything we hold. Course
                applications and course participation add several more, and
                they have <a href="#courses">a section of their own</a>.
              </p>

              <h3>When you sign in with Google</h3>
              <ul>
                <li>
                  Your Google account profile, namely your display name, email
                  address, and profile photo URL.
                </li>
                <li>
                  A Firebase Auth session record so we can keep you signed in
                  across visits.
                </li>
                <li>
                  Your Google profile photo is shown wherever your avatar
                  appears, and that includes public pages if you opt into the
                  members directory. The image itself stays with Google: a
                  visitor&apos;s browser fetches it from Google&apos;s servers,
                  which tells Google that somebody loaded the page it is on.
                </li>
              </ul>

              <h3>When you create an account with an email address</h3>
              <ul>
                <li>
                  If you create an account with an email address rather than
                  through Google, we hold that address, a password you set
                  yourself (stored by Firebase Auth, never by us in readable
                  form), and a record of the signup itself: when you started
                  it, whether you confirmed your address, whether you finished,
                  and how many verification emails we sent. That record stays
                  even if you never finish signing up, until you ask us to
                  remove it.
                </li>
              </ul>

              <h3>When you register as a member</h3>
              <ul>
                <li>
                  A University of Nottingham email address that you verify
                  through a one-time magic-link sent to that address.
                </li>
                <li>
                  Profile fields you fill in, including preferred name,
                  affiliation status (for example undergraduate, master&apos;s,
                  PhD, staff), subject or area of work, expected graduation
                  month if relevant, why you want to join, and a free-text
                  interests field.
                </li>
                <li>
                  Your notification preferences, broken down by channel (Google
                  inbox, university inbox) and by category, with a separate
                  email choice and notification choice for each: the
                  newsletter, event announcements, course announcements, and
                  tasks and worksheets.
                </li>
              </ul>

              <h3>When you apply as an external collaborator</h3>
              <ul>
                <li>
                  Your name and email address, the institution or company you
                  are at and your role there, the project you are proposing and
                  your background, any LinkedIn or portfolio link you give us,
                  the areas you are interested in, how you heard about us, and
                  whether you already know somebody on the committee (and who,
                  if you tell us).
                </li>
                <li>
                  The decision on your application and, where it is turned
                  down, the reason we recorded.
                </li>
              </ul>

              <h3>When you RSVP to an event</h3>
              <ul>
                <li>
                  Your name and email address, along with the answers you give
                  to that event&apos;s signup questions (for example dietary
                  notes, accessibility needs, or any custom fields the
                  organiser added).
                </li>
                <li>
                  The status of your RSVP (pending, confirmed, waitlisted,
                  cancelled), and any later change requests you submit.
                </li>
              </ul>

              <h3>When you subscribe to our newsletter</h3>
              <ul>
                <li>
                  Your email address, optional name, and a per-channel record
                  of whether you are currently subscribed, plus an audit trail
                  of subscribe and unsubscribe events.
                </li>
              </ul>

              <h3>When you install the site as an app</h3>
              <ul>
                <li>
                  If you turn on push notifications, a push subscription from
                  your browser: an endpoint URL issued by your browser vendor
                  and two keys that let us encrypt a message to that device.
                  The record is tied to one browser on one device and carries
                  your account so we know where to send, together with your
                  browser&apos;s user-agent string and the last time that
                  device checked in. We hold one record per device you enable.
                  Turning notifications off deletes it, and so does deleting
                  your account.
                </li>
              </ul>

              <h3>When you join the committee</h3>
              <ul>
                <li>
                  Optional public-profile fields such as a title and short bio,
                  if you choose to appear on the Members page.
                </li>
                <li>
                  Tasks, comments, and file attachments you create or are added
                  to inside the committee tooling area of the site. These are
                  visible to other committee members under the access rules
                  described in our role model.
                </li>
                <li>
                  When a worksheet is sent to you, we record when you first
                  opened it, how many times you moved between its pages, when
                  you were last active on it, and roughly how long you spent on
                  it, sampled in half-minute steps while the page is in front
                  of you. The person who sent it, the worksheet&apos;s author,
                  your reviewers and site admins can see those figures. We do
                  not record which page you were on, what you typed, or when
                  you pasted.
                </li>
              </ul>

              <h3>Operational logs</h3>
              <ul>
                <li>
                  A log of emails we have sent you (subject, recipient, status)
                  and a suppression list of addresses that have hard-bounced or
                  marked our mail as spam, so we can stop sending to them.
                </li>
                <li>
                  A record of the spreadsheet downloads the site generates. Two
                  kinds are logged today, a membership list and the responses
                  to a circulated worksheet, and each row holds who asked for
                  it, what it covered, how many people were in it, and when.
                  See{" "}
                  <a href="#courses">Courses and programmes</a> for what that
                  does and does not cover.
                </li>
                <li>
                  Standard request logs generated by our hosting provider
                  (Google Cloud), such as IP address, user-agent, and request
                  timestamps. We do not use these for analytics; they exist to
                  help debug errors and protect the service from abuse.
                </li>
              </ul>
            </section>

            <section id="courses" className={styles.section}>
              <h2>Courses and programmes</h2>
              <p>
                We run application-based programmes (the research incubator and
                the fellowships) and open-entry ones (the pre-course). Applying
                and taking part both create records about you, and some of them
                are written by other students. This section lists all of them,
                who can see each one, and how long we keep it.
              </p>

              <h3>When you apply</h3>
              <p>
                The fellowships and the incubator share one application form
                each term. You tick the programmes you want, rank them, and
                answer the questions that go with the ones you ticked.
              </p>
              <ul>
                <li>
                  <strong>Your answers.</strong> Everything you type into the
                  application form, including drafts. Drafts are saved on our
                  servers, not just in your browser, so that you can come back
                  to a part-written application on another device. We keep two
                  copies of what you wrote: the draft you are working on, and
                  the application you sent. You can change your answers until
                  applications close, and a change counts only when you press
                  Send again: until then the people reading your application
                  see what you last sent, never the draft. When you send again
                  and something is different, the version you sent before is
                  kept with your application, so the people reading it can see
                  what it said before. We keep up to ten earlier versions: the
                  first one you sent, and the most recent ones after it. They
                  are deleted when your application is. A draft you never
                  send is still an application record until your account is
                  deleted or that term&apos;s applications are destroyed, and
                  you can ask us to remove it sooner.
                </li>
                <li>
                  <strong>About you.</strong> The first step asks what joining
                  asks: your preferred name, your status (for example
                  undergraduate, master&apos;s, PhD, staff), your degree or
                  area of work, when you expect to graduate, why you are
                  interested in AI safety, and your interests. If you already
                  have an account it opens filled in from your profile. What
                  you send is saved on the application as a copy of its own, so
                  that whoever reads it sees what was true when you applied,
                  and changing it there does not change your profile. The
                  university email address on your application, and whether it
                  has been verified, are copied from your account and cannot be
                  changed on the application itself. The application also
                  carries the name and email address your account had when you
                  started it.
                </li>
                <li>
                  <strong>If you have not joined NAISI yet.</strong> You can
                  start the form without an account. The first step then also
                  asks for your University of Nottingham email address and for
                  your agreement to our Terms of Use and this policy, and it is
                  your request to join as well as the start of your
                  application. When you continue you make an account, with
                  Google or with an email address. What you typed is then
                  saved as your profile, as it would be if you had registered
                  first (see{" "}
                  <a href="#data-we-collect">Data we collect</a>), and copied
                  onto your application. We email a link to your university
                  address so you can show it is yours, and until that address
                  has been verified you can save your application but not send
                  it. Joining this way does not sign you up to the newsletter
                  or to event announcements: both start switched off until you
                  choose them. Until you have signed in, what you type on that
                  step stays in your browser: see{" "}
                  <a href="#cookies">Cookies and local storage</a>.
                </li>
                <li>
                  <strong>Your programme preferences.</strong> Which programmes
                  you ticked, the order you ranked them in, and whether you
                  said you would like to facilitate a group.
                </li>
                <li>
                  <strong>Your availability.</strong> The grid where you mark
                  the times you are free, in 15 minute steps between 9am and
                  9pm on each day of the week. The people who read your
                  application can see it, and we use it to build groups.
                </li>
                <li>
                  <strong>Access requirements.</strong> The optional box asking
                  whether there is anything we should know to make the
                  programme work for you. On the application form for the
                  fellowships and the incubator it is on the last step. In
                  practice people use it to tell us about disability, health,
                  caring responsibilities or similar, so we treat whatever you
                  write there as sensitive. It is stored separately from the
                  rest of your application, in a different place in our
                  database, so that it cannot be swept into a scoring screen or
                  a spreadsheet by accident. It is not part of the application
                  you send: it is saved as you type, you can change it until
                  applications close without sending again, and once you have
                  sent your application an admin who opens it reads whatever
                  is there at that moment. Your access requirements are never
                  scored and never shown to reviewers. A programme&apos;s lead
                  cannot open them either. Only site admins can open it, they
                  have to open it deliberately, one application at a time, and
                  every time one of them does we record who read it and when.
                  Leaving it blank does not count against you. We do not ask
                  for your date of birth anywhere.
                </li>
                <li>
                  <strong>Whether you have SU membership.</strong> The last
                  step asks whether you have SU membership, yes or not yet.
                  Your answer is kept with your application. It is shown to
                  admins only, and it does not affect whether you are offered a
                  place. Your membership record (see membership below) is
                  separate, and is not shown to the people who read your
                  application.
                </li>
              </ul>

              <h3>When we review your application</h3>
              <ul>
                <li>
                  <strong>Who reads it.</strong> Admins, and the lead and the
                  reviewers of each programme you ranked. They are other
                  students: SU-recognised committee members and admins. They
                  see your name. Nothing hides who you are from the people who
                  read, score and decide your application. They read the
                  application you sent: what you told us about yourself, the
                  order of your choices, your availability, and every answer,
                  including your answers to the other programmes you ranked.
                  The application shows your email addresses to admins only. If
                  you are invited to a programme you did not rank and you
                  accept, that programme&apos;s lead and reviewers can read
                  your application from then on, and not before.
                </li>
                <li>
                  <strong>Reviewer scores and comments.</strong> Where a
                  programme uses scores, a reviewer can give each of your
                  answers to that programme&apos;s own questions a score from 1
                  to 5. A reviewer can also write a comment on any of your
                  answers, and an overall comment about your application.
                  Scores and comments are personal data about you. If you ask
                  us what a reviewer wrote about your application, we will tell
                  you.
                </li>
                <li>
                  <strong>The decision,</strong> its date, who made it, and the
                  reason where one was noted. The lead of a programme you
                  ranked, or an admin, records whether that programme will take
                  you. You are offered one place a term: if more than one
                  programme accepts you, it is the one you ranked highest. If
                  none of them takes you, an admin records what you will hear
                  instead: an invitation to a programme you did not rank, or no
                  offer this time. These decisions are kept in a record of
                  their own beside your application and are never written onto
                  it. The emails we send on decision day do not give a reason.
                  An internal reason that we have not shared is still yours to
                  ask for.
                </li>
              </ul>

              <h3>Decision day and your reply</h3>
              <ul>
                <li>
                  <strong>Nothing early.</strong> Until decision day your own
                  application record changes only when you change it. Nothing
                  about a decision is written onto it, shown on your page, or
                  emailed to you before then.
                </li>
                <li>
                  <strong>What you are told.</strong> On decision day an admin
                  sends every outcome together. Yours is written onto your
                  application and shown on your application page: a place on a
                  programme, an invitation to a programme you did not rank, or
                  no offer this time. We also send it in one email, to the
                  account email address on your application. That email goes
                  whatever your notification settings say, because it is the
                  answer to an application you sent. It comes from our address
                  on{" "}
                  <code>naisi.uk</code>, and a reply to it goes to{" "}
                  <a href="mailto:ai-safety@uonsu.com">ai-safety@uonsu.com</a>.
                  The one exception is an application that every programme it
                  ranked turned down outright, for example as spam or as not
                  eligible: its owner is not emailed unless an admin chooses
                  to, and the outcome is still on their page. We keep a note on
                  your application of whether the email was sent.
                </li>
                <li>
                  <strong>Reminders about an invitation.</strong> If you are
                  invited and have not answered, we may email you a reminder
                  once a day until you answer or the day to reply by has
                  passed. Switching off the email choice for course
                  announcements on your profile stops these reminders. We
                  record the date of the last one on your application.
                </li>
                <li>
                  <strong>Your reply.</strong> You answer on your own
                  application page: that you are coming, that you cannot make
                  it, that you accept an invitation, or no thanks. We record
                  your answer and when you gave it. Saying you cannot make it,
                  or no thanks, gives the place back and marks your application
                  as withdrawn. To do either you choose a reason from a short
                  list, or write a few words of your own. Your reason is kept
                  with your application, where the people who can read your
                  application can see it, because we may be able to offer
                  something that works for you.
                </li>
                <li>
                  <strong>Your account.</strong> You can apply while your
                  request to join is still waiting. A waiting account cannot
                  send its application until the university email address on
                  it has been verified. If you are then given a place, that
                  approves the request: your account becomes a member account
                  on decision day, or when you accept an invitation, and we
                  record when it was approved and under which admin&apos;s
                  name.
                </li>
                <li>
                  <strong>What you can see.</strong> While applications are
                  open, the form shows you what you have written and lets you
                  change it. Your application page shows when you last sent
                  it, the order of your choices and, from decision day, your
                  outcome and your own replies. It does not show the scores,
                  the comments, what each programme decided, or the earlier
                  versions you sent. Ask us and we will tell you, and ask us
                  too if you want a copy of your own answers once applications
                  have closed: see <a href="#your-rights">Your rights</a>.
                </li>
              </ul>

              <h3>While you are on a programme</h3>
              <ul>
                <li>
                  <strong>Attendance registers.</strong> Your facilitator marks
                  each session: present, arrived late, left early, absent, or
                  excused. You can see your own attendance once a session has
                  been submitted.
                </li>
                <li>
                  <strong>Participant notes.</strong> After a session your
                  facilitator can write a private note about a named
                  participant, for example about how someone is finding the
                  material or that they mentioned they would miss next week.
                  Facilitators are students. These notes are personal data
                  about you, and if you ask to see the notes written about you,
                  we will show you them.
                </li>
                <li>
                  <strong>Your written work.</strong> Answers to exercises,
                  your progress through each week&apos;s materials, and any
                  feedback a facilitator writes on your work. You can also keep
                  a private note against a piece of material: it is not shown
                  to the rest of your run, but your facilitator and site admins
                  can read it. We do not publish
                  anything you write to the rest of your group unless you
                  choose to share it, and we will not use anything you write in
                  a course to make decisions about you outside the programme.
                </li>
                <li>
                  <strong>Feedback on the material.</strong> You can give a
                  piece of course material a star rating and leave a comment on
                  it. Both are stored against your account and your name, and
                  the comment is shown to the rest of your run. We do not
                  currently run anonymous surveys on this site. If we add one,
                  the form will say that it is anonymous and how that is done,
                  and we will update this policy first.
                </li>
                <li>
                  <strong>Dropping out.</strong> If you leave a programme we
                  record that you left and, if you tell us, why.
                </li>
              </ul>

              <h3>Membership</h3>
              <ul>
                <li>
                  Your membership tier (paid, comped, alumni, staff) for a
                  given year, and where we learned it: a list the
                  Students&apos; Union gives us, or an admin adding you by
                  hand. You can see your own tier on your profile.
                </li>
                <li>
                  When the Students&apos; Union gives us a membership list, we
                  keep the file as we received it: for each person on it, their
                  name, the email addresses on the list, and their membership
                  tier, together with a note of which NAISI account, if any, we
                  matched them to. We keep it so a membership can be checked or
                  corrected later. If you are on that list and have no account
                  with us, you can ask us to remove your row.
                </li>
              </ul>

              <h3>Conduct</h3>
              <ul>
                <li>
                  If there has been a conduct concern, an admin can flag an
                  account and must record a reason. The flag and the reason
                  are visible to admins alone: neither is shown on the screens
                  where applications are read and scored. It is personal data
                  about you and you can ask us for it.
                </li>
              </ul>

              <h3>Certificates</h3>
              <p>
                When you complete the fellowship or the incubator you will be
                able to mint a certificate for yourself. Nothing is issued
                unless you choose to: if you would rather no page on our site
                named you, simply never mint one. If you do mint one, it
                creates a page that names you, the programme and the date,
                which anyone holding the link can open. The link is not
                guessable and the page is not listed anywhere. It stays until
                you ask us to withdraw it, which you can do at any time by
                emailing us, including after your account is deleted, because
                the people you sent the link to still need it. By applying to a
                programme you agree that we may offer this.
              </p>

              <h3>Downloads</h3>
              <p>
                Staff sometimes need a spreadsheet: a register to take to a
                session, a roster, the applications for a round, a membership
                list. Two of those downloads are recorded, with who asked for
                it, what it covered, how many people were in it and when: the
                membership list, and the answers to a circulated worksheet.
                Both refuse to hand over the file if that record cannot be
                written. The event attendee list and the subscriber list are
                built in your browser and are not recorded. We are being
                careful with that sentence: it means we log two of the files
                the site produces. It does not mean we can track a file once it
                has been downloaded, and it does not cover somebody copying
                what is on their screen.
              </p>

              <h3>Who can see what</h3>
              <ul>
                <li>
                  <strong>Reviewers</strong> (SU-recognised committee members
                  and admins, all of them students) read the applications that
                  ranked a programme they review, and the application of
                  anybody who joined it by accepting an invitation. They see
                  your name, the application you sent, and what it said in the
                  versions you sent before. They also see their
                  own and other reviewers&apos; scores and comments on it, what
                  has been decided for their programme, whether a programme
                  you ranked higher has accepted you, and whether your request
                  to join NAISI is still waiting. They do not see
                  your answer about SU membership, access requirements, the
                  membership tier, or a conduct flag, and unless they are an
                  admin the application does not show them your email
                  addresses.
                </li>
                <li>
                  <strong>The lead of each programme</strong> sees everything
                  a reviewer sees, and records the decision for that programme.
                  Admins see every application, with your email addresses, and
                  are the only ones who choose what somebody no programme took
                  will hear and who send the decisions. Only admins can open
                  what you wrote under access requirements, and each time one
                  does it is recorded. A programme&apos;s lead cannot.
                </li>
                <li>
                  <strong>Facilitators</strong> (students, in most cases only a
                  year or two ahead of you) see their own groups: who is in
                  them, contact details, attendance, written work, and the
                  participant notes their colleagues wrote about people in that
                  group. They do not see applications or review scores.
                </li>
                <li>
                  <strong>Other participants</strong> on your run see your
                  name, and any comment or star rating you choose to leave on a
                  piece of course material. They see nothing else about you.
                </li>
                <li>
                  <strong>Admins</strong> can see all of the above. Admin
                  actions on this material are logged.
                </li>
              </ul>
            </section>

            <section id="how-we-use-it" className={styles.section}>
              <h2>How we use it</h2>
              <p>We use your data to:</p>
              <ul>
                <li>
                  Authenticate you and let you back into your account on
                  return visits.
                </li>
                <li>
                  Review your membership application and, if approved, give
                  you access to the relevant member or committee surfaces.
                </li>
                <li>Run events, including managing RSVPs and waitlists.</li>
                <li>
                  Run our courses: assess applications, place people into
                  groups that fit their availability, keep registers, give
                  feedback on work, and ask how the sessions are going.
                </li>
                <li>
                  Send you transactional emails you have asked for, such as
                  RSVP confirmations, application receipts and reminders, the
                  decision on an application, the week&apos;s course materials,
                  and account-related messages.
                </li>
                <li>
                  Send you the newsletter and event announcements where you
                  have opted in to those.
                </li>
                <li>
                  Send push notifications to a device where you have turned
                  them on. Each category has its own notification choice, set
                  separately from its email choice on your profile, so a
                  notification can still arrive for a category whose email you
                  have switched off.
                </li>
                <li>
                  Operate the committee tooling (tasks, projects, drafts) for
                  members who have been added to those features.
                </li>
                <li>
                  Keep the site and the email pipeline healthy, including
                  honouring bounces and abuse reports.
                </li>
              </ul>
            </section>

            <section id="legal-bases" className={styles.section}>
              <h2>Legal bases</h2>
              <p>
                We rely on the following lawful bases under the UK GDPR:
              </p>
              <ul>
                <li>
                  <strong>Consent</strong> for sending you the newsletter and
                  any other marketing-style communication, and for push
                  notifications. You can withdraw consent at any time using the
                  unsubscribe link in any such email, the notification settings
                  on your profile, or by emailing us. Important notices about
                  something you have signed up for, such as an event you are
                  attending or a course group you are in, are sent under
                  performance of a contract rather than consent, so your
                  notification settings do not switch them off, and they are
                  never marketing.
                </li>
                <li>
                  <strong>Performance of a contract</strong> (the membership
                  relationship with NAISI) for the parts of the service that
                  exist to deliver the membership itself, such as processing
                  your application, giving you access to member surfaces,
                  running a programme you have a place on, and handling your
                  RSVPs.
                </li>
                <li>
                  <strong>Legitimate interests</strong> for running the society
                  day to day, keeping the site secure, contacting members about
                  things they would reasonably expect, assessing course
                  applications fairly, and operating the committee tooling. We
                  have weighed our interests against yours and limited the data
                  we hold to what is needed.
                </li>
                <li>
                  <strong>Explicit consent</strong> for special category data.
                  Where an access-requirements answer includes health or
                  disability information, we treat it as special category data
                  and rely on your explicit consent, given when you choose to
                  fill that box in. You do not have to fill it in, and you can
                  ask us to delete what you wrote there without affecting your
                  application. The same goes for the dietary and accessibility
                  answers you give on an event signup form: you choose whether
                  to answer, you can leave them blank, and we use what you
                  write only to run that event.
                </li>
              </ul>
              <p>
                <strong>No automated decisions.</strong> No decision about you
                is made solely by automated means. Scores are given by named
                reviewers, and a programme&apos;s score for an application is
                only the average of what those reviewers gave. Where a
                programme uses scores, the site shows the people reviewing its
                applications which ones scored highest, as a guide. Every
                decision is taken by a person.
              </p>
            </section>

            <section id="sharing" className={styles.section}>
              <h2>Sharing and processors</h2>
              <p>
                We do not sell your data and we do not share it for
                advertising. We use the following third-party processors to
                run the service:
              </p>
              <ul>
                <li>
                  <strong>Google (Firebase and Google Cloud)</strong> hosts the
                  site (Firebase App Hosting on Cloud Run), the database
                  (Firestore), file uploads (Cloud Storage), and authentication
                  (Firebase Auth). Google&apos;s privacy terms apply to their
                  processing. See{" "}
                  <a
                    href="https://firebase.google.com/support/privacy"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    firebase.google.com/support/privacy
                  </a>
                  .
                </li>
                <li>
                  <strong>Resend</strong> sends our transactional emails and
                  newsletter on our behalf. They process your email address,
                  name (if provided), and the message content for delivery,
                  bounce handling, and abuse reporting. See{" "}
                  <a
                    href="https://resend.com/legal/privacy-policy"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    resend.com/legal/privacy-policy
                  </a>
                  .
                </li>
                <li>
                  <strong>Google reCAPTCHA</strong> checks that the person
                  filling in our registration, event sign-up and course
                  application forms is not a bot. On the application form for
                  the fellowships and the incubator it runs only on the first
                  step, while somebody who is not signed in is making an
                  account, and never for somebody who is already signed in.
                  While it is running, Google receives information about your
                  browser and how you interacted with the page, and sets its
                  own cookie. We see only Google&apos;s pass or fail verdict.
                </li>
                <li>
                  <strong>YouTube (Google)</strong> hosts the thumbnail image
                  on an email from us whose body embeds a video, the newsletter
                  included. If your mail client loads remote images, it fetches
                  that thumbnail from YouTube, which tells Google the message
                  was opened and roughly where from. Blocking remote images in
                  your mail client stops it.
                </li>
                <li>
                  <strong>Your browser vendor</strong> (for example Google,
                  Apple or Mozilla) delivers push notifications to a device
                  where you have turned them on. The message is encrypted to
                  that device before it leaves us.
                </li>
              </ul>
              <p>
                We may also share data with the University of Nottingham
                Students&apos; Union where we are required to as an affiliated
                society (for example, to confirm membership numbers or report
                on activities), and with law enforcement or regulators where we
                are legally obliged to do so. Where the Students&apos; Union
                gives us a membership list, we use it to mark who has paid and
                for nothing else.
              </p>
            </section>

            <section id="cookies" className={styles.section}>
              <h2>Cookies and local storage</h2>
              <p>
                We do not use analytics, advertising, or tracking cookies. The
                one exception is Google reCAPTCHA, which sets a cookie of its
                own while it is running on our registration, event sign-up and
                course application forms (see{" "}
                <a href="#sharing">Sharing and processors</a>).
                Every cookie the site itself sets is strictly necessary:
              </p>
              <ul>
                <li>
                  <code>__session</code> keeps you signed in and routes you to
                  the right pages. Set when you sign in, it lasts one day for
                  committee members and admins and five days for everybody
                  else. Cleared when you sign out.
                </li>
                <li>
                  <code>__impersonator</code> marks a &quot;view as&quot;
                  session. It is set only on an admin&apos;s browser while they
                  are viewing the site as another member, and lasts five days
                  or until they leave the session, whichever comes first.
                </li>
                <li>
                  <code>__auth_next</code> remembers which page to send you to
                  once you have signed in. Ten minutes.
                </li>
                <li>
                  <code>__google_credential</code> hands the result of a Google
                  sign-in from the redirect back to the page. Sixty seconds.
                </li>
                <li>
                  <code>g_csrf_token</code> is set by Google during the Google
                  sign-in redirect. We compare it with the value Google sends
                  us so that the sign-in cannot be forged.
                </li>
              </ul>
              <p>
                Google&apos;s sign-in script is loaded from{" "}
                <code>accounts.google.com</code> on the sign-in and register
                pages, and as soon as you press a link to one of them, so that
                the Google button is ready by the time the page appears. It is
                also loaded on the first step of the application form, when
                somebody who is not signed in continues to making an account,
                and not before.
                Loading it tells Google that a browser opened one of those
                pages.
              </p>
              <p>
                In your browser&apos;s own local storage the site keeps four
                small preferences, none of which leave your device:{" "}
                <code>naisi.sidebar.collapsed</code> (whether you have
                collapsed the committee-area sidebar),{" "}
                <code>naisi.lastRoute</code> (the last page you had open, so
                the installed app can return you to it),{" "}
                <code>naisi.installCard.dismissed</code> (that you have
                dismissed the prompt to install the app), and{" "}
                <code>naisi.auth.loaderOpen</code> (whether the sign-in panel
                was open). Signing in also stores your session tokens in your
                browser&apos;s own storage, which Firebase Auth keeps in
                IndexedDB. You can clear all of it from your browser&apos;s
                site-data settings at any time.
              </p>
              <p>
                If you start an application before you have an account and
                choose to continue with an email address, what you typed on the
                form&apos;s first step is kept in your browser&apos;s local
                storage, under a key beginning{" "}
                <code>naisi.apply.join</code>, so that it is also there in the
                tab our emailed link opens. It is your answers to that step and
                when you last changed them, and nothing else: no password, no
                sign-in address, and not whether you agreed to our terms. Those
                answers are not sent to us until you have signed in. The copy
                in your browser is removed when your request to join is sent,
                and it is ignored once it is an hour old.
              </p>
            </section>

            <section id="retention" className={styles.section}>
              <h2>Retention</h2>
              <p>
                We hold your account data while your account is active and for
                a reasonable period after it becomes inactive, so we can
                restore it if you come back and so we can answer any questions
                that come up afterwards.
              </p>
              <p>
                <strong>Course applications and course records.</strong>{" "}
                Applications are kept against your account for as long as it
                exists, so you can see what you sent us and so we can make
                sense of a later application from the same person. We do not
                strip them after a fixed period. The scores, comments and
                decisions about an application are kept for as long as it is.
                The same goes for the rest of your course record: attendance,
                written work, feedback you gave us, and notes written about
                you. If you want any of it removed sooner, email us.
              </p>
              <p>
                <strong>When a term&apos;s applications are destroyed.</strong>{" "}
                This is the one exception to keeping them. An admin can destroy
                a whole application form, for example one made as a test or by
                mistake. That removes the form and its questions, every
                application on it with the access-requirements answer stored
                beside it, the scores and comments written about them, the
                decisions, and the log lines about those decisions and about
                each time an admin opened an access-requirements answer. The
                short record described below is written for each applicant
                before anything is removed, and it stays. So do the log of
                emails we sent and the record of downloads.
              </p>
              <p>
                <strong>Asking us to delete your account.</strong> Email us and
                we will delete it, without undue delay. There is no
                self-service delete button once you are a member or an approved
                collaborator, because taking somebody&apos;s work out of the
                committee tooling is done by hand: an admin runs the deletion.
              </p>
              <p>
                <strong>What a deletion removes.</strong> Your account record
                and profile, your newsletter subscriptions and their history,
                your collaborator application if you made one, any outstanding
                email-verification links, your course enrolments, applications
                and drafts, your progress and your answers to exercises, your
                admission applications together with the access-requirements
                answer stored separately beside them, the decisions recorded
                about those applications, the review scores and notes written
                about those applications and any you wrote about somebody else,
                a conduct flag if there is one, your membership
                records and the lines naming you on a Students&apos; Union
                membership file, and your sign-in record. Your marks and the
                notes about you are stripped out of attendance registers, which
                stay for the rest of the group.
              </p>
              <p>
                <strong>What a deletion leaves behind.</strong> These are not
                removed:
              </p>
              <ul>
                <li>
                  A short record of each application you made: what you applied
                  for, the decision, and the scores and notes the reviewers
                  wrote. For an application made on the application form, that
                  is the programmes you ranked in your order, when you applied,
                  what you were told on decision day and where your application
                  stood when the record was written, and each reviewer&apos;s
                  name with their average score and their overall comment,
                  together with the averages across them. It holds none of
                  your own writing: no answers, no availability, no email
                  address and no reason you gave for giving a place back, and
                  none of the comments reviewers left on single answers. An
                  application you started and never sent is recorded too, as
                  one that was not sent. The record is written when an admin
                  marks a term as finished or destroys its applications, and
                  only admins can read it. We keep it deliberately, so that a
                  later application from the same person can be read in
                  context. The
                  reviewers&apos; scores and notes about an application stay in
                  that record after the account is deleted.
                </li>
                <li>
                  Worksheets that were sent to you: your answers, and the
                  reviews written on them.
                </li>
                <li>
                  Tasks you were on, with their comments, activity and
                  attachments.
                </li>
                <li>
                  Event RSVPs, including the name, email address and any
                  dietary or accessibility answers you gave when you signed up.
                </li>
                <li>
                  Files you uploaded. Nothing in file storage is removed by an
                  account deletion.
                </li>
                <li>
                  The log of emails we sent you, and a suppression entry if
                  your address ever bounced or reported us as spam, kept so we
                  do not write to it again by mistake.
                </li>
                <li>The audit-style records described below.</li>
              </ul>
              <p>
                <strong>A certificate you minted is a deliberate
                exception.</strong> If you chose to mint one, its page is not
                removed when your account is deleted, because it exists for the
                people you sent the link to and that is the moment you are
                least likely to still have an account with us. Email us and we
                will withdraw it, account or no account.
              </p>
              <p>
                Some of what you contributed stays after your account goes,
                because removing it would break work other people are still
                doing. We remove it when we clear it out by hand, and you can
                ask us to remove specific items sooner.
              </p>
              <p>
                Audit-style records are kept for as long as needed to
                investigate issues and meet our accountability obligations, and
                are not removed when an account is deleted. These are records
                of what staff did rather than of what you wrote: the email send
                log, the subscription event log, the impersonation log used for
                committee oversight, the log of course actions including who
                read an access-requirements answer and each decision made about
                an application, and the record of the two downloads the site
                logs. They name the person who took the action and what it
                concerned. A log line about a decision on an application, or
                about an admin opening an access-requirements answer,
                identifies the applicant by their account&apos;s id and not by
                name, names the programme where there is one, and says what
                was done. It never holds the answer that was opened. Where an
                admin took an acceptance back, the line holds the reason they
                typed. Those lines stay when the applicant&apos;s account is
                deleted, and go only if that term&apos;s applications are
                destroyed. Apart from that reason, the logs hold no course
                answers, marks or notes, and no scores or reviewers&apos;
                comments.
              </p>
            </section>

            <section id="transfers" className={styles.section}>
              <h2>International transfers</h2>
              <p>
                Our processors are global services. Your data is stored in
                Google Cloud regions and may be processed outside the United
                Kingdom. Where it is transferred outside the UK, we rely on
                appropriate safeguards (such as the UK International Data
                Transfer Addendum to the EU Standard Contractual Clauses, or
                the UK Extension to the EU-US Data Privacy Framework) as
                offered by each processor.
              </p>
            </section>

            <section id="your-rights" className={styles.section}>
              <h2>Your rights</h2>
              <p>
                Under UK data protection law you have the right to:
              </p>
              <ul>
                <li>Ask for a copy of the personal data we hold about you.</li>
                <li>Ask us to correct data that is wrong or incomplete.</li>
                <li>
                  Ask us to delete your data, where there is no overriding
                  reason for us to keep it.
                </li>
                <li>
                  Ask us to restrict or object to how we use your data.
                </li>
                <li>
                  Ask us to provide your data in a portable format, where the
                  basis for our processing is consent or contract.
                </li>
                <li>Withdraw consent at any time where we rely on consent.</li>
              </ul>
              <p>
                Most of these are self-serve. You can edit your profile and
                notification preferences from{" "}
                <a href="/profile">your profile page</a>, and unsubscribe from
                any marketing email through the link in that email. Important
                notices carry no unsubscribe link, because there is nothing
                there to switch off. Deleting your account
                is by request: email{" "}
                <a href="mailto:ai-safety@uonsu.com">ai-safety@uonsu.com</a>{" "}
                and we will delete it. There is no delete button on the site,
                because removing a member&apos;s work from the committee tooling
                is done by hand.
              </p>
              <p>
                A request for a copy of your data covers what other people have
                written about you as well as what you wrote yourself. For
                courses that means the scores and notes a reviewer recorded on
                your application, what each programme decided about it and any
                reason noted, the notes a facilitator wrote about you, and the
                reason behind a conduct flag. Ask us and we will tell you.
                Where a record names somebody else as well as you we may need
                to redact their part of it.
              </p>
              <p>
                If you believe we have not handled your data properly, you can
                complain to the UK Information Commissioner&apos;s Office at{" "}
                <a
                  href="https://ico.org.uk"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  ico.org.uk
                </a>
                . We would, of course, prefer the chance to put things right
                first.
              </p>
            </section>

            <section id="security" className={styles.section}>
              <h2>Security</h2>
              <p>
                We rely on Google&apos;s infrastructure for at-rest and
                in-transit encryption, and on Firestore&apos;s rule engine to
                enforce access. Member personal data is readable only by
                committee members the Students&apos; Union has formally
                recognised, and by admins, and by the small number of people we
                have given permission to circulate a worksheet, who can see
                members&apos; names and photos in order to choose recipients.
                Ordinary members can only see their own record and the tasks
                they have been added to. Course
                material about a named person (applications, access
                requirements, registers, participant notes) is served only
                through checks on our servers, never handed to a browser that
                has no reason for it. Email is signed with DKIM and aligned
                with DMARC on the <code>naisi.uk</code> domain.
              </p>
              <p>
                Site admins can open the site as you see it, to reproduce a
                problem you have reported. Doing so does not give them anything
                they could not already see, they cannot use it to make
                high-trust changes, and every session is logged with who did
                it, whose account, and when.
              </p>
              <p>
                No service is perfectly secure. If you spot a problem, please
                tell us at{" "}
                <a href="mailto:ai-safety@uonsu.com">ai-safety@uonsu.com</a>{" "}
                so we can fix it.
              </p>
            </section>

            <section id="changes" className={styles.section}>
              <h2>Changes to this policy</h2>
              <p>
                When we change this policy we will update the date at the top
                of the page. We do not have to tell you by email. For changes
                that materially affect how we use your data, the next time you
                sign in you will be shown the new version and asked to accept
                or decline it. Declining signs you out, and you can then email
                us to have the account removed. The application form does not
                ask that question: its last step says that sending your
                application is agreeing to this policy, with the date it was
                last updated. Earlier versions stay readable
                at{" "}
                <a href="/privacy/versions">/privacy/versions</a>.
              </p>
            </section>
          </div>

          <aside className={styles.contactCard}>
            <h2>Questions</h2>
            <p>
              Email{" "}
              <a href="mailto:ai-safety@uonsu.com">ai-safety@uonsu.com</a>{" "}
              with anything privacy-related, including requests to access,
              correct, or delete your data. We aim to respond within 30 days.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
