/**
 * Version 7 of the Privacy Policy, written for a programme while it runs and
 * when it ends: the programme's lead, pitching week and teams on an incubator,
 * leaving, a place that comes back, who finished, certificates, the notes a
 * group and its facilitators share, the calendar link (`docs/courses-ops.md`),
 * and the survey at a programme's start (`docs/surveys.md`).
 *
 * What changed from v6, in the words a member would use:
 *
 *  1. **Certificates are sent, and start private.** v6 said a person mints
 *     their own and nothing is issued unless they choose to. When a programme
 *     ends, its lead or an admin will send one to everybody its record says
 *     finished, and to each of its facilitators: a facilitator who held a
 *     place and finished is sent both. Each starts private until its
 *     owner turns its link on. A certificate whose link is off goes with the
 *     account; one whose link is on stays, as a minted one did under v6.
 *  2. **Who finished.** The lead's number of sessions, the lead's changes
 *     recorded with who made them and when, who sees the number and the list,
 *     and what a member's own page then says (`src/lib/courses/finishing/`).
 *  3. **What facilitators see.** Names only and never an email address, and
 *     the group email that hands out none (the group roster route, and
 *     `displayNameOf` in `src/lib/courses/registerAccess.ts`). v6 said
 *     "contact details". Before the first session they also see who has
 *     said they are coming, the one thing from an application they see. They
 *     also read the notes their group's facilitators keep for each other (16).
 *  4. **Pitching week.** A pitch is seen by the person's group with their
 *     name, and the pitch form says so; nobody in the group is told who picked
 *     what; the lead and admins see how many would join a pitch, not who
 *     (`src/lib/courses/pitching/`).
 *  5. **Teams.** Made from the pitches or from a ranking on the application,
 *     moved by the lead, and told by an email that names the team and its
 *     people and nothing else about them (`src/lib/courses/teams/`).
 *  6. **Your team's page.** What anybody in a team writes there is seen by the
 *     team, the programme's lead and admins, and the page says so.
 *  7. **Leaving a programme.** The day; leaving the group at once; who reads a
 *     reason (admins and the programme's lead); that it is kept with the place
 *     on the run, never on the application, and goes with the account; the
 *     place given back on the form; the marks kept on the register; and what
 *     a person who left keeps (`src/lib/courses/leaveRun.ts`). Saying "I can't
 *     make it" from inside a group is the same as leaving.
 *  8. **A place that comes back.** Offered by the lead or an admin until the
 *     end of the run's first week, to somebody who ranked the programme and
 *     was told no offer this time; emailed whatever the notification settings
 *     say; no daily reminder (`src/lib/applications/freedPlaces/`).
 *  9. **What a programme's lead sees.** Offering a place that comes back,
 *     placing people in groups, every register of its groups, the pitches and
 *     the teams, a leaver's reason, and who finished. A register's notes about
 *     named people are not among what a lead reads: the register's GET sends a
 *     lead the marks and none of the notes. The lead does read the notes its
 *     groups' facilitators share (16) and the notes each group shares on its
 *     week pages (17), both on the programme's Attendance tab, and writes
 *     neither. The lead also reads the answers about facilitating of
 *     everybody who said they would like to facilitate the programme, whether
 *     or not they ranked it, on a list that shows their name, their degree and
 *     stage and where they stand in a few words, and nothing else of their
 *     application. From decision day the lead or an admin can ask them by
 *     email, whatever their settings say, with up to three reminders; the
 *     person answers on a page that shows the ask to nobody else, and each ask
 *     is kept with its email as it went and the answer, and no address
 *     (`src/lib/courses/facilitatorAsks/`). A facilitator can hold a place on
 *     the programme too: a yes from them puts them in the group they
 *     facilitate (`seatFor` in `src/lib/courses/groupFacilitators.ts`), they
 *     are on its register and count towards who finished like everybody in
 *     it, their own written answers are the programme's lead's and admins'
 *     to read and review and never their co-facilitators' (`facilitatesOnRun`
 *     and `readsFacilitatorsOwnWork` in
 *     `src/lib/courses/writtenAnswers/access.ts`), and they are taken off the
 *     group's facilitators before they leave or are removed (`leavePathFor`
 *     in `src/lib/courses/leaving.ts`).
 * 10. **What other participants see.** On an incubator, a pitch is seen by
 *     the group, and a team's page by the team. A comment on a piece of
 *     material is shown to the run only on a programme anyone can join; on a
 *     programme that places people in groups, the people in a group see the
 *     notes it shares instead (17).
 * 11. **Five downloads are logged, not two.** A programme's attendance, a
 *     survey's answers with names and the Kairos file join the membership
 *     list and a worksheet's answers, with what each new file holds and never
 *     holds.
 * 12. **How we use it.** Making teams, recording who finished and sending
 *     certificates are named among running our courses.
 * 13. **No automated decisions.** Who finished starts from the lead's number
 *     and the site makes teams only when the lead asks; a person decides both.
 * 14. **What a deletion removes and leaves.** Pitches, picks, a place in a
 *     team, a decision about finishing, an ask to facilitate with its answer,
 *     and a certificate whose link is off (`clearCoursePitches`,
 *     `clearCourseTeams`, `clearCourseFinishing` and `clearFacilitatorAsks` in
 *     `src/lib/firestore/accountDeletion.ts`); a pitch sent with a partner
 *     stays the partner's, without the name. The calendar link (18), the notes
 *     shared with a group (17) and the notes written for a group's other
 *     facilitators (16) go too (`deleteCalendarLink`,
 *     `deleteCourseGroupSharedNotes` and `deleteCourseGroupNotes`), and so do
 *     the name on a person's survey answers and the record of each survey sent
 *     to them, with its link (19, `takeNamesOffForAccount`); the answers stay
 *     in the totals.
 * 15. **Destroying a term's applications takes nobody off a programme.** A
 *     place on a run stays with the rest of the person's course record.
 * 16. **Notes facilitators share.** A group's facilitators keep notes for
 *     each other, which can name a person. The group's facilitators, the
 *     programme's lead and admins read them, and nobody in the group: the one
 *     reader (`src/lib/courses/groupNotes/readers.ts`) is called by the group
 *     page and the programme's Attendance tab alone. A note goes with the
 *     account of the facilitator who wrote it.
 * 17. **Notes shared with your group.** On a programme that places people in
 *     groups, each week's page shows the group's notes in place of the run's
 *     comments under each reading. A note is shown with its writer's name, its
 *     day and its week to the group, its facilitators, the programme's lead
 *     and admins, and the page names them under the notes
 *     (`src/lib/courses/sharedNotes/`). Only its writer deletes it, leaving
 *     keeps it with the group, and it goes with the writer's account.
 *     "Feedback on the material" says which kind of programme has which.
 * 18. **Your calendar link.** Add to calendar gives each person a private
 *     link to their sessions: the day, time and room of each, the programme's
 *     and the group's name, a cancelled session marked, "Join on naisi.uk" for
 *     an online week and never the meeting link, and no person's name or
 *     address. The person's calendar provider fetches it and keeps what it
 *     shows. A replaced link opens an empty calendar, and a session after the
 *     day somebody left is not in it (`src/lib/courses/calendarFeed.ts`,
 *     `src/lib/courses/calendarLink.ts`, and the feed route).
 * 19. **When you answer a survey.** At a programme's start and at its end
 *     admins may send everybody holding a place a survey, and follow-ups at 6
 *     and 12 months to people who said yes to them, each emailed as an
 *     important notice with a personal link each. What the programme impact
 *     questionnaire asks, by kind (`src/lib/surveys/templates.ts`); the level
 *     and subject of study offered from the profile, which the person can
 *     change (`src/lib/surveys/profileOffer.ts`); the survey at the end
 *     showing a person their own earlier answer; the follow-ups' box, unticked
 *     until ticked and changeable later (`src/lib/surveys/consent.ts`). It is
 *     confidential: the answers keep the person's name, only admins see who
 *     said what or who has answered, and facilitators see nothing of it. Every
 *     question can be skipped, none of the answers is kept until they are
 *     sent, and no record is kept of opening it or of an IP address. The name
 *     comes off two years after the programme's last session (the
 *     `surveys-names-off` job), and at once with the account. The sentence
 *     about anonymous surveys moves here from Feedback on the material,
 *     unchanged (`src/lib/surveys/`). The survey at the end asks the
 *     follow-ups box again of somebody the before survey never asked.
 * 20. **Written answers and their feedback.** Who reads a written answer (its
 *     writer, their group's facilitators, the programme's lead and admins; a
 *     facilitator's own, the lead and admins), the first-sent and edited
 *     times, the lock when it is opened and Reopen for edits, "Late" for
 *     those readers alone, feedback as a level for each row of the course's
 *     rubric and a comment with no mark, and the one email that says it is
 *     waiting (`src/lib/courses/writtenAnswers/`, `src/lib/courses/rubric.ts`,
 *     `src/lib/email/writtenFeedbackEmail.ts`, and the two written-answers
 *     routes).
 * 21. **Pathways and cases.** Some weeks give a person a pack to read (a
 *     pathway) and a case to give a talk on. What is handed out on paper in
 *     a session is recorded on the site, by the group's facilitators, the
 *     programme's lead or an admin, and those three see what everybody in the
 *     group was given; nobody else in the group sees it. A facilitator who
 *     takes part in the group they run is in that draw like anybody. A pack a
 *     person picks themselves is kept, and can change until their session
 *     starts; the group's facilitators, the programme's lead and admins can
 *     see which (This week's work's reader, `weekWorkOf`), except a
 *     facilitator's own pick, which their co-facilitators cannot. Saying they
 *     are ready for their talk is shown on their own pages and nobody else's.
 *     It goes with the account
 *     (`src/lib/firestore/coursePacksAndCases.ts`, the draw's route and the
 *     person's own route, `deleteCoursePacksAndCases`).
 * 22. **Boxes you fill in.** A week's fill-in boxes (week 6's action plan)
 *     save as the person types, and are read by them, their group's
 *     facilitators, the programme's lead and admins; a facilitator's own by
 *     the lead and admins alone; never by another fellow. After somebody
 *     leaves, the lead and admins can still read them and the group's
 *     facilitators and the person cannot. They go with the account
 *     (`src/lib/courses/fillInBoxes/access.ts`, the two fill-in routes).
 * 23. **Reflections, ticks and private notes, and who reads them.** A
 *     person's reflections and which sources they ticked are read, with their
 *     name, by their group's facilitators, the programme's lead and admins; a
 *     facilitator may read a line of a reflection out without saying who
 *     wrote it, chosen on a page that shows the words with no name; the
 *     private note under a reading is read by the group's facilitators and
 *     admins, never the lead, and never read out, and is used to improve the
 *     course. A facilitator's own reflections and ticks are the lead's and
 *     admins' to read, never another facilitator's, and their own private
 *     notes admins' alone (`src/lib/courses/facilitatorWeek/`, the group
 *     page and its reflections page, and the lead's two pages).
 * 24. **Sharing with Kairos.** Unless somebody says no, the name and
 *     programme record of everybody on a programme at its end go to Kairos,
 *     one of NAISI's funders, on legitimate interests: what goes, why, the
 *     way to say no at the end of every programme survey and on the profile,
 *     what saying no does and does not change, and how long the choice is
 *     kept (`src/lib/kairos/`). Totals go to funders and sponsors with no
 *     name (`src/lib/surveys/kairosReport.ts`), and so may the links to an
 *     incubator's work that its people give, as that question tells them
 *     (`src/lib/surveys/templates.ts`). The Kairos file is the fifth logged
 *     download.
 * 25. **Ratings at the end of a programme.** What a group's facilitators
 *     rate, who rates whom, who reads them, never shown to the person rated
 *     on any page or in any email, deleted two years after the programme and
 *     with an account (`src/lib/ratings/`).
 * 26. **The anonymous form.** The promise that an anonymous form would say so
 *     and how, with the policy first, is kept and replaced: the separate keep,
 *     change and drop form the survey at a programme's end links to. What it
 *     keeps (the three answers, the programme and the day: `ANSWER_FIELDS`),
 *     what it never reads (`tests/anonymous-feedback-no-trace.test.mjs`), the
 *     holding record and the night's move that leaves only the day
 *     (`src/lib/anonymousFeedback/move.ts`, the `anonymous-feedback-move`
 *     job), the recovery copies and request logs that still hold a time for a
 *     while, who reads it and from when (`src/lib/anonymousFeedback/readers.ts`),
 *     that it goes with the run's destroy, and that an account's deletion has
 *     nothing of it to remove (`src/lib/anonymousFeedback/`).
 * 27. **When you come to an event.** Check-in: who came, how and when, seen
 *     with names only by admins and SU-recognised committee, and as numbers
 *     by the event's other organisers; nothing recorded about not coming; a
 *     walk-in's name, and an email only for that event's survey, deleted a
 *     week after the event; the check-in link in the email that confirms a
 *     place; names off a year after the event (the `event-check-ins-tidy`
 *     job) and at once with the account (`src/lib/events/checkIns.ts`).
 * 28. **The survey about leaving** (Q46). Somebody who leaves a programme by
 *     their own hand while it has an open leaving survey has their own link
 *     to it made as they leave (`src/lib/surveys/leaving.ts`, called by
 *     `src/lib/courses/leaveRun.ts`), shown on the page that says they left,
 *     in the leaving email and on Home and My programmes until they answer
 *     (`src/lib/surveys/waiting.ts`); nobody presses send. What it asks, by
 *     kind (its template). It is confidential like every survey; the
 *     programme's lead reads its totals and comments as they come in, never
 *     a name, the comments in an order that does not follow when they came
 *     (`src/lib/surveys/leadResults.ts` and its page); when few have left, the
 *     lead may still tell whose an answer is, which the policy says. The page
 *     that says somebody left now shows that survey's card too.
 * 29. **Certificates, built.** The paragraph under "Certificates" (1) was
 *     worded as what will happen before anything was built, and now
 *     describes code; "we will send" still says what happens when each
 *     programme ends. Who is sent one, and the email: the people the
 *     programme's record says finished and its groups' facilitators, held to
 *     their standing, one email a person, both certificates for a facilitator
 *     who held a place and finished (`src/lib/courses/certificates/send.ts`).
 *     Private until its owner turns the link on, a view-as session never the
 *     owner, and the PDF its owner's alone (`record.ts`). The page shows the
 *     words kept when it was issued and the course's credit line, and nothing
 *     else (`face.ts`, `CertificateFace.tsx`). The code's 80 bits
 *     (`model.ts`). Add to LinkedIn's title, date and link (`linkedin.ts`). A
 *     certificate whose link is off deleted with the account and with a
 *     destroyed run, one whose link is on kept without them
 *     (`clearCourseCertificates`, `drainCertificates`). And nobody sent one
 *     for finishing stops being finished while it stands (`finishingAct.ts`).
 * 30. **Your team's page, built.** (6) said what would happen; the page now
 *     exists, so its bullet says each team has one. The same bullet adds what
 *     the page does: anybody in the team can change what is there; the
 *     hand-in says who handed it in, and the lead and admins also see who
 *     last saved each week's check-in; what somebody wrote stays with the
 *     team when they leave, and stays with their name taken off when their
 *     account is deleted (`src/lib/courses/teamPage/`, `clearCourseTeamEntries` in
 *     `src/lib/firestore/accountDeletion.ts`). "What a deletion leaves behind"
 *     lists it.
 * 31. **Surveys after events.** An admin may send the survey after an event to
 *     the people who came or to everybody whose place was confirmed, and to
 *     nobody else (`src/lib/surveys/events/audience.ts`). It is confidential:
 *     the answers keep the person's name, which admins alone see, and the
 *     event's organisers are told that it went and when, never its results
 *     (the event's Survey after tab, `src/lib/surveys/events/tab.ts`). What
 *     it asks; its QR code, which opens it signed in for somebody who came or
 *     signed up and asks anybody else to sign in; its email, a notice, to the
 *     account's address or to the address a guest or a walk-in gave the
 *     event; what is kept with the answers (`src/lib/surveys/events/store.ts`);
 *     names off two years after the event (the `surveys-names-off` job); its
 *     file. A walk-in's email now goes when that survey closes, or a week
 *     after the event if that comes first (`setWalkInEmailDeadlines` in
 *     `src/lib/events/checkIns.ts`).
 * 32. **Sealed predictions** (Zach's extra (d)). A course's credence card
 *     (`CourseDoc.predictionCard`, `src/lib/courses/predictions/`): each
 *     answer saves as it is typed until the card is sealed; sealed, nothing
 *     changes it, and nothing shows it to its owner until the week it opens
 *     in has opened to their group and they open it there, after answering
 *     the same questions again (`own.ts`, `taker.ts`, the predictions route).
 *     Read by its owner and by admins at any time, and by nobody else, a
 *     facilitator's co-facilitators included. Each admin opening is recorded
 *     first, with who, whose by account id, the run and when, and the card
 *     stays closed when it cannot be (`src/lib/firestore/recordOpenings.ts`,
 *     the opening route); an admin cannot open their own. The card goes with
 *     the account and with the run's destroy; the openings stay when an
 *     account is deleted and go with the run's destroy
 *     (`deleteCoursePredictions`, `src/lib/firestore/courseDeletion.ts`).
 * 33. **Pairs for a session.** When a week's In the session block says people
 *     are paired (`pairsAskOf` in `src/lib/courses/pairs/model.ts`), the
 *     group's live facilitators, the programme's lead or an admin record each
 *     person's pair and, where the week asks, whether they are bringing a
 *     laptop (the pairs route, behind the draw's gate). Each person sees
 *     their own pair, by first name, and who in it is bringing a laptop, on
 *     that week's page, and nothing of another pair (`readOwnPairs`); the
 *     group's facilitators, the lead and admins see every pair
 *     (`readGroupPairs`). A facilitator can be in a pair like anybody, seen by
 *     their co-facilitators. Somebody who leaves is shown in no pair, and it
 *     goes with the account (`deleteCoursePairs`).
 *
 * The accept page's "What changed" paragraph (`src/app/re-consent/page.tsx`)
 * says the same in a few lines.
 *
 * NOTHING HERE IS WORDED AS WHAT WILL HAPPEN any more. Certificates (1) and
 * a team's page (6) were worded that way, the way v6 worded certificates,
 * until they were built (29 and 30), and each now describes the code.
 *
 * v6 IS FROZEN AS ACCEPTED. It is the wording members agreed to at sign-in
 * while it was current, so it is a digest in `tests/privacy-policy.test.mjs`
 * and it renders unchanged at /privacy/v/6. Item 1 takes back v6's promise
 * that nothing is issued unless a person chooses to mint it, which is
 * precisely the kind of change nobody may make in place: editing v6 would
 * have altered what an archive URL shows without moving
 * CURRENT_POLICY_VERSION, so nobody would ever have been asked. A new version
 * is what asks.
 *
 * v1 to v6 are FROZEN: they still render unchanged at their archive URLs
 * (/privacy/v/1 through /privacy/v/6), so this file is a copy-and-edit of the
 * version before it rather than a refactor of it. Never reach into an older
 * version to share markup with this one.
 *
 * EVERY SENTENCE HERE ABOUT A COURSE OR A PROGRAMME DESCRIBES CODE. When that
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

export default function PrivacyContentV7({
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
                  If you later change your degree (or area of work) or your
                  expected graduation on your profile, we keep what it said
                  before and when you changed it, as part of your account
                  record. Admins see that on their page for your account.
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

              <h3>When you come to an event</h3>
              <ul>
                <li>
                  If you come to an event, we may record that you came, how
                  and when: you check yourself in with the code at the door,
                  or a committee member ticks your name on the door list. Only
                  NAISI&apos;s admins and the committee members the
                  Students&apos; Union recognises can see who came, as they can
                  see who signed up. The event&apos;s other organisers see how
                  many came, never who.
                </li>
                <li>
                  Not coming is recorded nowhere. It is never held against you,
                  and it never stops you signing up again.
                </li>
                <li>
                  If you come without signing up, we take your name at the
                  door, and an email address only if you want that
                  event&apos;s survey. We use the address for nothing else, and
                  delete it when that survey closes, or a week after the event
                  if that comes first.
                </li>
                <li>
                  When your place at an event is confirmed, the email that
                  tells you has a link that checks you in at the door, so you
                  can check in without an account. Anyone holding it could
                  check in in your name, so keep it to yourself.
                </li>
                <li>
                  We use the record to count who comes. Nobody is shown one
                  person&apos;s list of the events they came to.
                </li>
              </ul>

              <h3>When you answer a survey</h3>
              <ul>
                <li>
                  At the start of a programme and again at its end,
                  NAISI&apos;s admins may send a survey to everybody holding a
                  place on it, and 6 and 12 months later a follow-up to the
                  people who said yes to one. Every survey is confidential: we
                  keep your answers with your name, and each survey says so at
                  the top. Only NAISI&apos;s admins can see who said what.
                  Facilitators never see anything of a survey.
                </li>
                <li>
                  A programme&apos;s surveys ask about your level and subject of
                  study, what you had done in AI safety before and how you first
                  heard about NAISI; your career stage and plans, how likely you
                  think you are to work on AI safety and the kinds of work that
                  interest you; what you understand and know of the field, how
                  many people in it you could contact, and how sure you are of
                  your next step and of what you could contribute; what stands
                  in your way and the steps you have taken; and what you want
                  from the programme. At the end and in the follow-ups they
                  also ask how the programme went, what it changed, what else
                  shaped your plans, what you are doing now and what you plan
                  next. An incubator&apos;s also ask about your research skills
                  and what your team produced.
                </li>
                <li>
                  Where your profile holds them, the survey before a programme
                  starts its questions about your level and subject of study on
                  your profile&apos;s answers. You can change or clear either
                  before you send it, and only what you send is kept.
                </li>
                <li>
                  We keep your name with your answers so that we can compare
                  them with your answers to the same questions at the end of
                  the programme and in any follow-ups, and so that a reminder
                  goes only to people who have not answered. Only admins see
                  who has answered. The survey at the end shows you what you
                  said you wanted from the programme, so you can say whether
                  you got it; nobody else is shown it there.
                </li>
                <li>
                  The survey before a programme asks whether we may contact
                  you at 6 and 12 months with a short follow-up survey, in a
                  box that starts unticked, and only people who tick it are sent
                  the follow-ups. If you did not answer it there, the survey at
                  the end asks you the same. You can change your answer at any
                  time until your name comes off, on your survey&apos;s page,
                  through its link or signed in, and the next follow-up goes by
                  it. We keep what you said, and when, with the record that the
                  survey was sent to you.
                </li>
                <li>
                  Every question can be skipped. Nothing you say in a survey
                  affects your place on a programme or an application.
                </li>
                <li>
                  A survey records nothing about how you fill it in: not when
                  you opened it, how long you spent on it or which page you
                  were on, and none of your answers is kept until you send
                  them. We record when you sent them, whether you used your own
                  link or were signed in, and whether your group had met for
                  the first time by then. We never keep your IP address with
                  them, and the request logs our hosting provider keeps (see
                  Operational logs) are never matched to them.
                </li>
                <li>
                  A survey and its reminder are emailed as important notices,
                  so your notification settings do not switch them off. Each
                  email carries a link of your own, so you can answer without
                  signing in. Anyone holding it could answer in your name, so
                  keep it to yourself.
                </li>
                <li>
                  Every programme survey ends with what we share with Kairos,
                  one of our funders, and a box to say no to it, which starts
                  as you last left it. Whatever you choose there, your answers
                  are kept and counted the same. See Sharing with Kairos, under
                  Sharing and processors.
                </li>
                <li>
                  If you leave a programme yourself while it has a survey
                  about leaving open, a link of your own to that survey is made
                  when you leave. It is on the page that says you left, in the
                  email that tells you so, and on Home and My programmes until
                  you answer it. Nobody presses send, and it reaches nobody who
                  did not leave. It asks why you left, what would have helped
                  you stay and whether you would take part again.
                </li>
                <li>
                  Like every survey here, the survey about leaving is
                  confidential: only NAISI&apos;s admins can see who said what,
                  and facilitators never see anything of it. The
                  programme&apos;s lead sees its totals and comments as answers
                  come in, never your name, with the comments in an order that
                  does not follow when they came in. When only a few people
                  have left, the lead may still be able to tell which answer is
                  yours. Nothing you say in it changes your account or a future
                  application, and your name comes off it two years after the
                  programme&apos;s last session, as for every survey.
                </li>
                <li>
                  After an event, NAISI&apos;s admins may send a survey to the
                  people who came to it, or to everybody whose place on it was
                  confirmed, and to nobody else. It is confidential like every
                  survey: your answers keep your name, and only NAISI&apos;s
                  admins can see who said what and whether they came. The
                  event&apos;s organisers are told that it went and when, and
                  nothing of its results.
                </li>
                <li>
                  The survey after an event asks how it was, whether you would
                  come to another, what we should run next, how you heard about
                  it and what we should change.
                </li>
                <li>
                  At the end of an event its QR code opens the survey. Signed
                  in, you answer it there if you came or signed up, and its
                  email afterwards skips you; signed out, it asks you to sign
                  in. Its email is an important notice, like every
                  survey&apos;s, with a link of your own, sent to your
                  account&apos;s address, or if you have no account to the
                  address you gave when you signed up or at the door. With your
                  answers we keep when you sent them and whether you used your
                  link or were signed in.
                </li>
                <li>
                  One form is anonymous: the keep, change and drop form linked
                  from the end of the survey at a programme&apos;s end. It never
                  asks or records who answers, even when you are signed in:
                  everybody on the programme has the same link, and your
                  browser sends the answers without your sign-in. With your
                  three answers we keep only the programme and the day: no
                  name, account, email address, IP address or detail of your
                  device. The form says so at the top.
                </li>
                <li>
                  We keep the day, not the time. Until the day is over the
                  answers wait in a holding record, which our database stamps
                  with the time, as it does every record; soon after midnight a
                  job moves the day&apos;s answers together into the record we
                  keep, which holds the day and not the time, and deletes the
                  holding records. Recovery copies of our database, kept up to
                  14 days, can hold a holding record until they expire, and our
                  hosting provider&apos;s request logs (see Operational logs)
                  note the time and address of every request; those logs are
                  never matched to the answers.
                </li>
                <li>
                  Only the programme&apos;s lead and NAISI&apos;s admins read the
                  answers, from the day after they come in, in an order
                  unrelated to when each came in. The form closes when the
                  survey at the end does.
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
                  A record of the spreadsheet downloads the site generates.
                  Four kinds are logged today, a membership list, the
                  responses to a circulated worksheet, a programme&apos;s
                  attendance and a survey&apos;s answers, and each row holds
                  who asked for it, what it covered, how many people were in
                  it, and when. See{" "}
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
                  <strong>If you would like to facilitate.</strong> If you
                  said you would like to facilitate a group, the lead of each
                  programme you said you would facilitate, by name or by
                  choosing &quot;Either&quot;, can read your answers to the
                  questions about facilitating, even if you did not rank that
                  programme. They read them on a list of the people who would
                  like to facilitate it, which shows your name, your degree or
                  area of work, and your status or the year you expect to
                  graduate, and, from decision day, where you stand in a few
                  words, such as taking part in another programme or no offer
                  this time. The list shows nothing else of your application.
                </li>
                <li>
                  <strong>Reviewer scores and comments.</strong> Where a
                  programme uses scores, a reviewer can give each of your
                  answers to that programme&apos;s own questions a score from 1
                  to 5. A reviewer can also write a comment on any of your
                  answers, and an overall comment about your application.
                  Scores and comments are personal data about you. We do not
                  send feedback on applications, and we cannot promise it for
                  every one. If you would like some, email us and we will
                  consider it. Your right to a copy of the data we hold about
                  you, which includes these scores and comments, is under{" "}
                  <a href="#your-rights">Your rights</a>.
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
                  <strong>A place that comes back.</strong> If somebody gives
                  their place back after decision day, then until the end of
                  the programme&apos;s first week its lead or an admin can
                  offer that place to somebody who ranked the programme and was
                  told no offer this time, as long as the programme had not
                  turned them down. If that is you, the offer is written onto
                  your application and shown on your application page, and we
                  email it to you whatever your notification settings say, with
                  a day to reply by. You answer it as you would an invitation.
                  The daily reminder about an invitation is not sent for these
                  offers.
                </li>
                <li>
                  <strong>Being asked to facilitate.</strong> If you said you
                  would like to facilitate a group, then from decision day the
                  lead of a programme you said you would facilitate, or an
                  admin, may ask you to facilitate one of its groups. We email
                  you the ask whatever your notification settings say, because
                  it answers what you said on your application, and while it
                  waits for your answer we may send you up to three reminders,
                  at least twelve hours apart. You answer on our site, on a page
                  that shows the ask to you and nobody else, by the day and time
                  the ask gives. If you say yes, you become one of that
                  group&apos;s facilitators. We keep a record of each ask: who
                  asked you and when, which group it was for, the day and time
                  to answer by, whether the email went, any reminders, your
                  answer and when you gave it, and a copy of the email as it
                  was sent, with the name it was sent to. The record holds no
                  email address. The programme&apos;s lead and admins can see
                  these records, and you can see your own ask on its page. They
                  are kept with the rest of your course record, and deleted
                  with your account. If you hold a place on that programme,
                  saying yes also puts you in that group, as one of its
                  people: a facilitator who holds a place sits in the group
                  they facilitate.
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
                  something that works for you. If you are already in a group
                  when you say you cannot make it, that is the same as leaving
                  the programme, and your reason goes where a leaver&apos;s
                  does: see Leaving a programme, below.
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
                  <strong>Your calendar link.</strong> &quot;Add to
                  calendar&quot; on your programme page gives you a private
                  link to your sessions, which you can add to Apple Calendar,
                  Google Calendar, Outlook or any calendar that subscribes to a
                  link. It shows the day, time and room of each session of
                  your group (and of any group you facilitate), with the
                  programme&apos;s and the group&apos;s name, and marks a
                  session that is cancelled. An online week says to join on
                  naisi.uk, never the meeting link. It shows no names and no
                  email address. Once you add it, your calendar&apos;s
                  provider (Apple, Google or Microsoft, for example) fetches it
                  from us every so often and keeps what it shows, under its own
                  privacy policy, so a session that moves or is cancelled
                  changes in your calendar too. Anyone else holding the link
                  can see the same, so keep it to yourself. You can replace it
                  at any time from the same place, and the old link then shows
                  nothing. If you leave a programme, no session after the day
                  you left is in it. It is deleted with your account.
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
                  <strong>Notes facilitators share.</strong> A group&apos;s
                  facilitators can keep notes for each other about how their
                  group is going, and a note can mention you by name. The
                  group&apos;s facilitators, the programme&apos;s lead and
                  admins read them; nobody in the group does. A note goes when
                  the account of the facilitator who wrote it is deleted. If
                  you ask to see what is written about you, we will show you
                  these notes too.
                </li>
                <li>
                  <strong>Your written work.</strong> Your written answers, the
                  feedback on them, and your progress through each week&apos;s
                  materials. A written answer is read by you, your group&apos;s
                  facilitators, the programme&apos;s lead and admins, and by
                  nobody else taking part; the week&apos;s page says so beside
                  it. If you facilitate a group, your own answer is read by the
                  programme&apos;s lead and admins, and not by the group&apos;s
                  other facilitators. We record when you first send it, and
                  when you change it after that. You can change it until one of
                  your group&apos;s facilitators opens it (for a
                  facilitator&apos;s own answer, the programme&apos;s lead or an
                  admin), or feedback is sent on it; we record when it was
                  opened, and any of its readers can reopen it for you to
                  change. Its readers can see when you sent it, and whether
                  that was after it was due. Your own pages show when you sent
                  it, but never mark it late. Feedback is a level for each row
                  of the course&apos;s rubric and a short comment, with the name of
                  whoever gave it, and never a mark. One short email tells you
                  that feedback is waiting; the feedback itself stays on the
                  site. You can also keep
                  a private note against a piece of material: it is never shown
                  to the rest of your run or read out. Your group&apos;s
                  facilitators and admins can read it, with your name, and we
                  use what it says to improve the course; if you facilitate the
                  group, only admins read yours. We do not publish
                  anything you write to the rest of your group unless you
                  choose to share it, apart from a line of a reflection your
                  facilitators may read out without saying who wrote it (see
                  Reflections), and we will not use anything you write in
                  a course to make decisions about you outside the programme.
                </li>
                <li>
                  <strong>Pathways and cases.</strong> Some weeks give you a
                  pack to read, such as a pathway, and a case to give a short
                  talk on. When your facilitators hand these out on paper in a
                  session, which ones you were given is recorded on the site,
                  by them or by the programme&apos;s lead or an admin, and you
                  see yours on that week&apos;s page. Your group&apos;s
                  facilitators, the programme&apos;s lead and admins see what
                  everyone in the group was given; nobody else in your group
                  sees yours. If you facilitate the group you take part in,
                  your co-facilitators see what you were given, as they see
                  everybody&apos;s. When a week lets you pick a pack yourself,
                  we keep the one you picked, and you can change it until your
                  session starts. Your group&apos;s facilitators, the
                  programme&apos;s lead and admins can see which one you
                  picked, except that if you facilitate the group, your
                  co-facilitators cannot. You can say you are ready for your
                  talk, and that is shown on your own pages and nobody
                  else&apos;s.
                </li>
                <li>
                  <strong>Pairs for a session.</strong> When a week&apos;s
                  session is in pairs, your group&apos;s facilitators, the
                  programme&apos;s lead or an admin record on the site who is
                  in each pair and, where the week asks, who is bringing a
                  laptop. On that week&apos;s page you see who you are paired
                  with, by first name, and who in your pair is bringing a
                  laptop, and your partners see the same about you. Your
                  group&apos;s facilitators, the programme&apos;s lead and
                  admins see every pair in the group; nobody else in your group
                  sees your pair. If you facilitate the group, you can be in a
                  pair like anybody, and your co-facilitators see it. If you
                  leave the programme, you are no longer shown in a pair. It is
                  deleted with your account.
                </li>
                <li>
                  <strong>Boxes you fill in.</strong> Some weeks have boxes
                  for you to fill in, such as an action plan. What you write
                  saves as you type. It is read by you, your group&apos;s
                  facilitators, the programme&apos;s lead and admins, and by
                  nobody else taking part; the page says so under the boxes.
                  If you facilitate a group, what you write is read by the
                  programme&apos;s lead and admins, and not by the group&apos;s
                  other facilitators. If you leave the programme, the
                  programme&apos;s lead and admins can still read it, and your
                  group&apos;s facilitators and you no longer can. It is
                  deleted with your account.
                </li>
                <li>
                  <strong>Sealed predictions.</strong> On a programme whose
                  course has a card of predictions, a week&apos;s page gives you
                  that card to fill in: each question asks for a percentage, a
                  number on a scale or a sentence, and each answer saves as you
                  type. Once you seal your card, nobody can change it, you
                  included, and you cannot read it again until the week it
                  opens in has opened to your group and you open it there,
                  after answering the same questions again. You then see both
                  side by side, and neither changes after that. A card you
                  never seal can no longer be changed once that week has
                  opened, and you can still read it. Your card is read by you
                  and by admins, who can open anybody&apos;s at any time, and
                  by nobody else: not your group&apos;s facilitators, not the
                  programme&apos;s lead and not other fellows. If you
                  facilitate a group, its other facilitators do not read yours
                  either. Each time an admin opens a card, we record who opened
                  it, whose card it was by account id, the course run and
                  when, before anything on the card is read, and never what it
                  says; if that record cannot be written, the card stays
                  closed. An admin cannot open their own card that way. If you
                  leave the programme, you no longer see your card, and admins
                  still can. Your card is deleted with your account, and when
                  the programme&apos;s course run is destroyed. The records of
                  admins opening a card stay when an account is deleted, and
                  are deleted when the run is destroyed.
                </li>
                <li>
                  <strong>If you facilitate your own group.</strong> A
                  facilitator can also hold a place on the programme, in the
                  group they facilitate. If you do, you are one of the
                  group&apos;s people as well: you are on its register, and
                  whoever takes the register marks you, which can be you; you
                  count towards who finished; and your written answers are not
                  shown to the group&apos;s other facilitators, who do not give
                  you feedback on them: the programme&apos;s lead or an admin
                  does. Before you can leave the programme, or be taken off it,
                  the programme&apos;s lead or an admin takes you off the
                  group&apos;s facilitators.
                </li>
                <li>
                  <strong>Reflections.</strong> At stops in a week&apos;s
                  readings you answer set questions in boxes that save as you
                  type. You, your group&apos;s facilitators, the
                  programme&apos;s lead and admins can read your answers, and
                  nobody else on the programme can; the week&apos;s page says
                  so beside the boxes. A facilitator may read a line of one out
                  in the session without saying who wrote it, and the page
                  where they choose lines shows them the words with no name
                  beside them. Reflections get no feedback and no mark. If you
                  facilitate a group, your own reflections are read by the
                  programme&apos;s lead and admins, not by the group&apos;s
                  other facilitators, and nobody reads them out.
                </li>
                <li>
                  <strong>Ticks.</strong> Each source in a week&apos;s readings
                  has a tick for you. Your group&apos;s facilitators, the
                  programme&apos;s lead and admins can see which sources you
                  have ticked, with your name, and the week&apos;s page says
                  so; nobody else on the programme can. A tick never counts
                  against you. If you facilitate a group, the programme&apos;s
                  lead and admins see yours, and the group&apos;s other
                  facilitators do not.
                </li>
                <li>
                  <strong>Notes shared with your group.</strong> On a programme
                  that places you in a group, each week&apos;s page has notes
                  the people in your group and its facilitators share with each
                  other. A note you add is shown with your name, the day you
                  wrote it and the week it was written on, to everyone in your
                  group, its facilitators, the programme&apos;s lead and
                  admins, and to nobody else; the page says so under the notes.
                  While you are in the group you can delete a note you wrote,
                  and nobody else can. If you leave the programme, the notes
                  you shared stay with your group, as your marks stay on its
                  register. They are deleted with your account.
                </li>
                <li>
                  <strong>Pitching week.</strong> On an incubator, one week can
                  be its pitching week. You can pitch a project: a title, the
                  paper you would replicate and your twist on it, alone or with
                  a partner from your group. Sending a pitch is choosing to
                  share it: everybody in your group sees it, with your name and
                  your partner&apos;s, and the pitch form says so. You can also
                  say which of your group&apos;s pitches you would join. Nobody
                  else in your group is told which ones you picked. The
                  programme&apos;s lead and admins see each pitch and how many
                  would join it, but not who. If the lead makes a pitch into a
                  team, the people who said they would join it are put in that
                  team (see Teams).
                </li>
                <li>
                  <strong>Teams.</strong> On an incubator, the programme&apos;s
                  lead or an admin puts the people taking part into teams. The
                  site can make a team from a pitch (the people who pitched it,
                  then people who said they would join it) or, where the
                  programme&apos;s own questions on the application asked you
                  to rank its projects, from your ranking. The lead can move
                  anybody. We then email you your team&apos;s name and the
                  names of the people in it, and nothing else about them.
                </li>
                <li>
                  <strong>Your team&apos;s page.</strong> On an incubator, each
                  team has a page of its own: its project, a weekly check-in,
                  the team&apos;s links and its hand-in. What anybody in the
                  team writes there is seen by everybody in the team, the
                  programme&apos;s lead and admins, and the page says so beside
                  what you write. Anybody in the team can change what is
                  there. The hand-in says who handed it in, and the lead and
                  admins also see who last saved each week&apos;s check-in. If
                  you leave, what you wrote stays with your team; if your
                  account is deleted, it stays and your name comes off it.
                </li>
                <li>
                  <strong>Feedback on the material.</strong> You can give a
                  piece of course material a star rating. On a programme anyone
                  can join you can also leave a comment on it, which is shown
                  to the rest of your run; on a programme that places you in a
                  group, you share notes with your group instead (see Notes
                  shared with your group). Ratings and comments are stored
                  against your account and your name.
                </li>
                <li>
                  <strong>Leaving a programme.</strong> If you leave a
                  programme, we record that you left and when, and you leave
                  your group straight away. If you give a reason, only admins
                  and, where the programme has one, its lead read it. It is
                  kept with your place on the programme, not with your
                  application, and it is deleted with your account. If your
                  place came from the application form, leaving gives that
                  place back, so the people who read your application see that
                  you gave it back, but not your reason. Your marks up to then
                  stay on your group&apos;s register with the day you left,
                  where your facilitators, the programme&apos;s lead and admins
                  see them. After you leave, your programme page shows only
                  that you left, and the survey about leaving while it is
                  yours to answer (see When you answer a survey): your marks,
                  notes and reflections stay in our records for the
                  programme&apos;s lead and admins, and are no longer shown to
                  you. The notes you shared with your group stay with it (see
                  Notes shared with your group).
                </li>
                <li>
                  <strong>Who finished.</strong> Once a programme&apos;s last
                  session is over, we mark as finished everybody who came to at
                  least the number of sessions its lead has set. Arriving late
                  or leaving early counts as coming. The lead can then change
                  anybody&apos;s, and we record who changed it and when. Only
                  the lead and admins see that number, and the list with how
                  many sessions each person came to and how many written answers
                  they sent. Your programme page then tells you that you
                  finished, or that the programme has ended. Somebody who did
                  not finish is not told so. Who finished decides who is sent a
                  certificate.
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
                When a programme ends, we will send a certificate to everybody
                the programme&apos;s record says finished it (see Who
                finished), and to each person who facilitated one of its
                groups. A facilitator who held a place and finished is sent
                both. The programme&apos;s lead or an admin sends each one as
                an email with a link to its page on our site. The page shows
                your name, that you finished the programme or facilitated a
                group on it, the programme, the term, how many weeks it ran and
                the day it was issued. It shows no email address, no photo and
                nobody else&apos;s name. It starts private: until you turn its
                link on, only you can open it. While the link is on, anyone
                holding it can open the page and check the certificate, and
                you can turn it off again at any time. The link is not
                guessable and the page is not listed anywhere. You can also
                download the certificate as a PDF. A copy you have downloaded
                or passed on is yours, and outside our reach. Add to LinkedIn
                sends nothing until you press it; if you do, your browser takes
                the certificate&apos;s title, the date and its link to
                LinkedIn. Somebody who did not finish is not sent one, and is
                not told. Making a certificate is part of running the
                programme. Whether anybody else sees it is your choice.
              </p>

              <h3>Ratings at the end of a programme</h3>
              <p>
                Once a programme&apos;s last session is over, each group&apos;s
                facilitators rate the people taking part in it: how much they
                joined in discussion, their grasp of the material, how much
                improving AI outcomes seems to drive them, and whether they
                would recommend them for a more demanding next step. On an
                incubator they also rate how strongly they support the
                person&apos;s research continuing, their research or technical
                skill, and how independently they can steer it. Beside each
                rating we show how many sessions the person came to, read from
                the register, never typed in. Nobody rates themselves, and two
                facilitators of one group never rate each other: a
                facilitator, who takes part in the group they run, is rated by
                the programme&apos;s lead or an admin, who can also rate
                anybody else on the programme. Ratings are read only by the
                programme&apos;s lead, NAISI&apos;s admins, and the person who
                gave each one, who sees only their own. They are never shown
                to the person rated, on any page or in any email. Unless you
                have said no, the ratings you were given go to Kairos with your
                name (see Sharing and processors). We delete them two years
                after the programme&apos;s last session, and at once if the
                account of whoever gave or was given one is deleted.
              </p>

              <h3>Downloads</h3>
              <p>
                Staff sometimes need a spreadsheet: a register to take to a
                session, a roster, the applications for a round, a membership
                list. Five of those downloads are recorded, with who asked for
                it, what it covered, how many people were in it and when: the
                membership list, the answers to a circulated worksheet, a
                programme&apos;s attendance, a survey&apos;s answers with
                names, and the Kairos file; only admins can download the last
                two. The attendance file is for the programme&apos;s lead and
                admins. It holds each person&apos;s group, name and marks, how
                many sessions they came to and the day they left, if they did,
                and never an email address or a note. The survey file holds,
                for each person who answered, their name, when and how they
                sent their answers, whether their group had met by then, and
                the answers themselves, and never an email address. The file
                of a survey after an event has no column about a group, and
                names a guest by the name they gave the event. The Kairos
                file holds, for each person on a programme at its end who has
                not said no to sharing with Kairos, their name, the programme,
                how many sessions they came to, whether they finished and the
                ratings they were given at the end, and never an email address,
                who gave a rating or a survey answer. All five refuse to hand
                over the file if that record cannot be written. The event
                attendee list and the subscriber list are built in your
                browser and are not recorded. We are being careful with that
                sentence: it means we log five of the files the site
                produces. It does not mean we can track a file
                once it has been downloaded, and it does not cover somebody
                copying what is on their screen.
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
                  After decision day the lead can also offer a place that comes
                  back. The lead also reads the answers about facilitating of
                  everybody who said they would like to facilitate the
                  programme, whether or not they ranked it, and from decision
                  day can ask them to facilitate one of its groups. Once the
                  programme is running, the lead places its
                  people in groups, reads every register of its groups, the
                  notes its groups&apos; facilitators share, and the notes each
                  of its groups shares on its week pages, sees the pitches and
                  makes the teams on an incubator, reads the reason somebody
                  gives for leaving, and says who finished. The lead also reads
                  the reflections its groups&apos; people write and sees which
                  sources each of them has ticked, a facilitator&apos;s own
                  among them.
                  When it ends, the lead also reads the ratings given to the
                  people on it, and rates its facilitators.
                  Admins see every application but their own, with your email
                  addresses. On decision day they are the only ones who choose
                  what somebody no programme took will hear, and they send the
                  decisions. Only admins can open what you wrote under access
                  requirements, and each time one does it is recorded. A
                  programme&apos;s lead cannot.
                </li>
                <li>
                  <strong>Facilitators</strong> (students, in most cases only a
                  year or two ahead of you) see their own groups: who is in
                  them, by name only, attendance, written work, the reflections
                  the group&apos;s people write and which sources each of them
                  has ticked, the private notes they keep on what they read,
                  the participant
                  notes their colleagues wrote about people in that group, and
                  the notes the group&apos;s facilitators share with each
                  other. A facilitator never sees another facilitator&apos;s own
                  reflections, ticks or private notes. They never see your
                  email address: they can email
                  their group through the site without seeing anybody&apos;s.
                  Before the first session, they also see whether each
                  person in their group has said they are coming. Apart from
                  that one reply, they see nothing from applications, and no
                  review scores. When a programme ends they rate the people in
                  their group, and see only the ratings they gave, never
                  anybody&apos;s rating of them.
                </li>
                <li>
                  <strong>Other participants</strong> on your run see your
                  name. On a programme anyone can join, they also see any
                  comment or star rating you leave on a piece of course
                  material; on a programme that places you in a group, the
                  people in your group see the notes you share with it. On an
                  incubator, the people in
                  your group also see any pitch you send, with your name, and
                  the people in your team see that you are in it and anything
                  you write on your team&apos;s page. They see nothing else
                  about you.
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
                <li>Check people in at an event, and count who comes.</li>
                <li>
                  Run our courses: assess applications, place people into
                  groups that fit their availability, keep registers, give
                  feedback on work, make teams on an incubator, record who
                  finished and send certificates, and ask how the sessions are
                  going.
                </li>
                <li>
                  Show our funders and sponsors what our programmes achieve:
                  totals that name nobody, the links to an incubator&apos;s work
                  that its people give us, and, unless you say no, what we share
                  with Kairos (see Sharing and processors).
                </li>
                <li>
                  Send you transactional emails you have asked for, such as
                  RSVP confirmations, application receipts and reminders, the
                  decision on an application, the week&apos;s course materials,
                  that feedback on your written answer is waiting, and
                  account-related messages.
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
                  we hold to what is needed. Sharing with Kairos rests on this
                  basis too: it helps us make our case to our funders and
                  sponsors, it shares only what Sharing with Kairos lists, and
                  you can object to it at any time with the choice at the end of
                  every programme survey or on your profile, which stops it.
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
                applications which ones scored highest, as a guide. On a
                programme, who finished starts from the number of sessions its
                lead chose, and the lead can change anybody&apos;s; on an
                incubator, the site can put teams together from pitches or
                rankings when the lead asks, and the lead can move anybody
                before telling people their team. Every decision is taken by a
                person.
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
              <h3>Sharing with Kairos</h3>
              <p>
                Kairos supports AI safety groups at universities and is one of
                our funders. Unless you say no, when a programme ends we send
                Kairos a file with, for each person on it at the end: their
                name, the programme, how many sessions they came to, whether
                they finished, and the ratings they were given at the end
                (described under Ratings at the end of a programme). Kairos
                uses it to see what its support achieves and to point promising
                people towards work in AI safety. We share it because it helps
                us make our case to our funders and sponsors, so leaving it on
                helps NAISI. It never holds your email address, your survey
                answers, or who gave a rating.
              </p>
              <p>
                Every programme survey ends with a box to say no, and the same
                choice is on <a href="/profile">your profile</a>. You can
                change it at any time, and the next file goes by it. Saying no
                stops only what goes to Kairos with your name: NAISI&apos;s
                admins still see your survey answers, and they still count in
                our totals. We keep your choice, and when you made it, until
                your account is deleted. A file already sent is held by
                Kairos, and changing your choice later does not recall it.
              </p>
              <p>
                We also report totals to our funders and sponsors, Kairos among
                them: how many people applied to, started and finished a
                programme, how answers to our surveys changed between the start
                and the end, and figures like them, each with how many people
                it counts. These never name anybody. For an incubator we may
                also pass on the links its people give us, in the survey at its
                end, to the work their team produced; that question says so.
              </p>
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
                If you start an application before you have an account, what
                you type on the form&apos;s first step is kept in that browser
                tab, in its session storage under a key beginning{" "}
                <code>naisi.apply.join</code>: the copy in the tab is removed
                when your request to join is sent, it is ignored once it is a
                day old, and it goes when you close the tab.
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
                written work, feedback you gave us (survey answers, below, are
                the exception), and notes written about you. If you want any
                of it removed sooner, email us.
              </p>
              <p>
                <strong>Survey answers.</strong> We take your name off your
                answers to a survey on the day it tells you, two years after
                the programme&apos;s last session, and delete the record that
                it was sent to you, with your link to answer it and what you
                said about follow-ups. Your answers stay in its totals, no
                longer linked to you. For the survey after an event, that day
                is two years after the event.
              </p>
              <p>
                <strong>Ratings at the end of a programme.</strong> We delete
                them two years after the programme&apos;s last session, the day
                names come off its surveys.
              </p>
              <p>
                <strong>Your choice about Kairos.</strong> Kept for as long as
                your account exists, so a later programme goes by it too.
              </p>
              <p>
                <strong>Answers to the anonymous form.</strong> Kept while the
                programme&apos;s course run is on the site, and deleted when the
                run is destroyed. Nothing in them says whose they are, so
                deleting your account removes none of them.
              </p>
              <p>
                <strong>Who came to an event.</strong> We keep the record of who
                came with names for a year after the event, then take the names
                off and keep the count. A walk-in&apos;s email address is
                deleted when the event&apos;s survey closes, or a week after the
                event if that comes first.
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
                emails we sent and the record of downloads. Nobody is taken off
                a programme by it: a place on a course run, which notes the
                application form and programme it came from, stays with the
                rest of that person&apos;s course record.
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
                and drafts, the asks to facilitate a group sent to you and your
                replies to them, your progress, your written answers with the
                feedback on them, the packs and cases recorded for you and
                whether you said you were ready for your talks, your calendar
                link, the notes you shared with a group, notes you wrote for the
                other facilitators of a group, your name on your survey answers,
                the record of each survey sent to you with your link to answer
                it, a pitch you sent alone, your name on a pitch you sent with a
                partner, your picks in pitching week, your place in a team, any
                decision a lead recorded about whether you finished, a
                certificate whose link is off, your admission applications
                together with the access-requirements
                answer stored separately beside them, the decisions recorded
                about those applications, the review scores and notes written
                about those applications and any you wrote about somebody else,
                a conduct flag if there is one, every rating you gave or were
                given at the end of a programme, your choice about sharing
                with Kairos, your membership
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
                  Your answers to surveys, no longer linked to you: they stay
                  in the totals.
                </li>
                <li>
                  Your answers to the anonymous form: nothing in them says they
                  were yours, so there is nothing of yours to remove.
                </li>
                <li>
                  The record that you came to an event, no longer linked to
                  you: it stays in the count.
                </li>
                <li>
                  A pitch you sent with a partner: it stays theirs, without
                  your name.
                </li>
                <li>
                  What you wrote on your team&apos;s page: it stays with your
                  team, and your name comes off it.
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
                <strong>A certificate whose link is on is a deliberate
                exception.</strong> If its link is on when your account is
                deleted, its page is not removed, because it exists for the
                people you gave the link to and that is the moment you are
                least likely to still have an account with us. Email us and we
                will withdraw it, account or no account. A certificate whose
                link is off is deleted with your account.
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
                an application, and the record of the five downloads the site
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
                notification preferences, and say no to sharing with Kairos,
                from <a href="/profile">your profile page</a>, and unsubscribe
                from any marketing email through the link in that email. Important
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
                reason noted, the notes a facilitator wrote about you, the
                ratings you were given at the end of a programme, and the
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
                open the member area, or your collaborator space, you will be
                shown the new version and asked to accept or decline it.
                Declining signs you out, and you
                can then email us to have the account removed. The application
                form does not ask that question: its last step says that
                sending your application is agreeing to this policy, with the
                date it was last updated. Earlier versions stay readable
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
