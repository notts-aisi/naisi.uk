/**
 * Version 15 of the Privacy Policy: the whole policy arranged by kind of use,
 * with a summary at the top ("In short"), and the last version anybody is
 * asked to accept.
 *
 * What changed from v14, in code terms:
 *
 *  1. **The last version anybody is asked to accept.** Until v14 the gate
 *     asked whenever an account's stored `policyVersion` was not exactly
 *     CURRENT_POLICY_VERSION, so every later version asked again.
 *     `needsPolicyAcceptance` in `src/lib/legal/acceptance.ts` now asks only
 *     when the stored agreement is missing or unreadable, names a privacy
 *     version below `LAST_PRIVACY_VERSION_ASKED` (15) or a terms version
 *     below the current one; both gated layouts and the accept page read it.
 *     Accepting still stamps CURRENT_POLICY_VERSION, and the coursework
 *     moment with it (`courseworkUseStampFor`). "Changes to this policy" says
 *     a change to how we use somebody's information is told on the site and
 *     by email before it takes effect.
 *  2. **The outside services have a page of their own**, /privacy/services,
 *     drawn from `src/content/legal/services.ts`, so adding a service changes
 *     that page and is told before it receives anything, rather than moving
 *     the version. Each service's lines are v14's.
 *  3. **Claude's best answers are admins' alone.** v14 said an admin or a
 *     programme's lead could ask Claude for a week's strongest answers and
 *     see them. The best answers route now turns away a lead who is not an
 *     admin, on the session and again at the coursework door, and the
 *     Coursework tab draws the week's panels for an admin only, so "What
 *     comes back is seen by admins only" holds for everything Claude returns.
 *  4. **Promises v14 made that v15 takes back**, each said with "may" where
 *     the code that would use it is not built yet: facilitators may see their
 *     own group's check-in totals; the people leading a programme may keep
 *     notes about a person, while notes written before v15 stay admins' alone
 *     (`src/lib/memberNotes/`); admins can see which events somebody signed up
 *     for and whether they came, and missing two in a row may count when
 *     places are decided, so the Check-in tab's own promise says so; a tick no
 *     longer "never counts" (the line under This week's work's ticks is gone);
 *     work still unsent when a week locks may be read; a conduct flag may show
 *     as a marker asking people to talk to an admin first; an event's
 *     organisers may see a few words about somebody asking for a place; and a
 *     change to the policy is a notice rather than an accept page. The weekly
 *     nudge's default no longer says "nobody is keeping score"
 *     (`src/lib/firestore/courseEmails.ts`).
 *  5. **New uses, said with "may"**: the team's ratings of written work,
 *     Claude reading survey answers and session reports and drafting a weekly
 *     note, session reports, check-ins at the end of a session, an event's
 *     survey sent when it ends, reminders before a session, full names,
 *     events for chosen people, lists admins make for choosing who a message
 *     reaches, telling us in advance about a missed session, and joining a
 *     programme after decision day.
 *  6. **Detail that v14 spelled out and v15 leaves to purpose, readers and
 *     retention**: which screen shows what, which tab a lead reads a thing
 *     on, the names of jobs and fields. What somebody can see, who else can,
 *     and how long it is kept are all still said, for every record v14 named.
 *
 * The accept page's "What changed" paragraph (`src/app/re-consent/page.tsx`)
 * says the same in a few lines.
 *
 * v14's own notes, and those of every version before it, stay at the top of
 * v14's file, which is FROZEN AS ACCEPTED: a digest in
 * `tests/privacy-policy.test.mjs` holds it byte for byte, and it renders
 * unchanged at /privacy/v/14. Never reach into an older version to share
 * markup with this one.
 *
 * EVERY SENTENCE HERE DESCRIBES CODE, OR SAYS "MAY". A sentence about
 * something not built yet says "may", so it is true on its first day and
 * stays true as that code lands. When code changes what it stores, who it
 * shows it to or what it sends beyond what a sentence here allows, the fix is
 * a notice and a new version, never an edit to this file once it has been
 * published.
 */
import type { ReactNode } from "react";
import Badge from "@/components/ui/Badge";
import styles from "../legal.module.css";

const TITLE = "Privacy policy";

const SECTIONS = [
  { id: "who-we-are", label: "Who we are" },
  { id: "your-account", label: "Your account" },
  { id: "applying", label: "Applying to a programme" },
  { id: "taking-part", label: "Taking part in a programme" },
  { id: "your-work", label: "Your work, progress and reminders" },
  { id: "feedback-and-notes", label: "Feedback, ratings and notes" },
  { id: "surveys", label: "Surveys and check-ins" },
  { id: "ai-review", label: "AI-assisted review" },
  { id: "events", label: "Events and attendance" },
  { id: "conduct", label: "Conduct" },
  { id: "emails", label: "Emails and notifications" },
  { id: "sharing", label: "Services we use, and sharing" },
  { id: "legal-bases", label: "Lawful bases" },
  { id: "retention", label: "How long we keep it" },
  { id: "your-rights", label: "Your rights" },
  { id: "cookies", label: "Cookies and local storage" },
  { id: "transfers", label: "International transfers" },
  { id: "security", label: "Security" },
  { id: "changes", label: "Changes to this policy" },
];

/** The page that lists every outside service, with what each receives. */
const SERVICES_HREF = "/privacy/services";

export default function PrivacyContentV15({
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
          <div className={styles.lede}>
            <h2 id="in-short">In short</h2>
            <ul>
              <li>
                <strong>Who we are.</strong> The Nottingham AI Safety
                Initiative (NAISI) is a student society at the University of
                Nottingham, affiliated with the University of Nottingham
                Students&apos; Union. We decide what happens to the personal
                data this website holds. Email{" "}
                <a href="mailto:ai-safety@uonsu.com">ai-safety@uonsu.com</a>{" "}
                about any of it.
              </li>
              <li>
                <strong>What we hold.</strong> What you give us: your account
                and profile, your applications, the work you do on a programme,
                your survey answers and your event sign-ups. And what the people
                running NAISI record about you: reviews of your applications,
                registers, who came to an event, feedback, ratings and notes.
              </li>
              <li>
                <strong>What we use it for.</strong> Running the society:
                deciding applications, running programmes and events, keeping
                in touch in the ways you choose, and choosing people for things
                later, such as a place on a programme, facilitating a group or
                the committee.
              </li>
              <li>
                <strong>Who sees it.</strong> Admins see most of it. The people
                leading a programme see what they need to run it. Facilitators
                see their own groups, by name, never your email address. Other
                people taking part see your name and what you share with them.
              </li>
              <li>
                <strong>Outside services.</strong> We use a few, listed under{" "}
                <a href={SERVICES_HREF}>Services we use</a>. Two of them, Claude
                (made by Anthropic) and Pangram, may help admins review
                applications and written work. They are never sent your name or
                email address, only admins see what they return, and nothing
                about you is decided by a machine alone.
              </li>
              <li>
                <strong>How long.</strong> Most records are kept while you have
                an account. Some go sooner: your name comes off survey answers
                after two years, and off the record of who came to an event
                after one.
              </li>
              <li>
                <strong>Your rights.</strong> You can ask for a copy of your
                data, including what other people wrote about you, and ask us
                to correct it, delete it or stop using it.
              </li>
              <li>
                <strong>Changes.</strong> If we change how we use your
                information, we tell you on the site and by email before the
                change takes effect.
              </li>
            </ul>
          </div>
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
                University of Nottingham Students&apos; Union. For UK data
                protection law, NAISI is the controller of the personal data
                processed through this website.
              </p>
              <p>
                This site is for university students and staff. We do not
                knowingly collect data from anyone under 16. If you think a
                child has given us their data, email us and we will delete it.
              </p>
              <p>
                Email{" "}
                <a href="mailto:ai-safety@uonsu.com">ai-safety@uonsu.com</a>{" "}
                with any privacy question, including to use the rights
                described below.
              </p>
            </section>

            <section id="your-account" className={styles.section}>
              <h2>Your account</h2>
              <p>
                <strong>Signing in.</strong> If you sign in with Google, we
                receive your Google name, email address and the address of your
                profile photo. The photo stays with Google: a browser showing
                it fetches it from Google, which tells Google that somebody
                loaded that page. If you make an account with an email address,
                we hold the address, a password you choose (Firebase Auth keeps
                it, and we can never read it) and a record of the sign-up: when
                you started it, whether you confirmed your address, whether you
                finished and how many verification emails we sent. That record
                stays even if you never finish, until you ask us to remove it.
                A session record keeps you signed in.
              </p>
              <p>
                <strong>Joining.</strong> Joining asks for a University of
                Nottingham email address, which you confirm from a link we send
                to it, and a profile: the name you go by, your status (for
                example undergraduate, master&apos;s, PhD or staff), your degree
                or area of work, when you expect to graduate, why you want to
                join and your interests. If you later change your degree or
                expected graduation, we keep what it said before and when you
                changed it, and admins can see that. We may also ask for your
                full name as well as the name you go by. Only the committee
                sees your full name; everyone else sees the name you go by.
              </p>
              <p>
                <strong>Membership.</strong> We keep your membership tier for
                each year (paid, comped, alumni or staff) and where we learned
                it: a list the Students&apos; Union gives us, or an admin adding
                you by hand. You can see your own tier on your profile. When
                the Students&apos; Union gives us a list, we keep the file as we
                received it (each person&apos;s name, the email addresses on the
                list and their tier), with a note of which account, if any, we
                matched them to, so a membership can be checked or corrected
                later. If you are on a list and have no account with us, you
                can ask us to remove your row. We use the list to record who
                holds membership, and whether you hold it may be shown to the
                people deciding sign-ups to an event (see{" "}
                <a href="#events">Events and attendance</a>).
              </p>
              <p>
                <strong>External collaborators.</strong> If you apply as an
                external collaborator, we hold what the form asks: your name
                and email address, where you work or study and your role there,
                the project you propose, your background, any LinkedIn or
                portfolio link, your interests, how you heard about us and
                whether you know somebody on the committee. We keep the
                decision and, where we said no, the reason we recorded.
              </p>
              <p>
                <strong>On the committee.</strong> If you choose to appear on
                the Members page, we show the title and short bio you give us.
                Tasks, comments and files you create or are added to in the
                committee&apos;s tools are seen by other committee members under
                the site&apos;s access rules. When a worksheet is sent to you,
                we record when you first opened it, how many times you moved
                between its pages, when you were last active on it and roughly
                how long you spent on it, sampled in half-minute steps while it
                is in front of you. The person who sent it, its author, your
                reviewers and admins can see those figures. We do not record
                which page you were on, what you typed or when you pasted.
              </p>
              <p>
                <strong>Notifications on your devices.</strong> If you install
                the site as an app and turn notifications on, your browser
                gives us an address for that device and two keys that let us
                encrypt a message to it. We keep them with your account, your
                browser&apos;s user-agent string and when the device last
                checked in, one record per device. Turning notifications off
                deletes it, and so does deleting your account.
              </p>
            </section>

            <section id="applying" className={styles.section}>
              <h2>Applying to a programme</h2>
              <p>
                Our fellowships and research incubators take applications
                through one form each term. Applying creates records about you,
                and some of them are written by other people.
              </p>
              <p>
                <strong>What you send.</strong> Everything you type into the
                form, including drafts, which are saved on our servers so you
                can come back to them on another device. A change counts only
                when you press Send again; until then the people reading your
                application see what you last sent. When you send again with
                something different, we keep the version before, up to ten
                earlier versions in all, deleted with your application. The
                form also asks which programmes you want, in your order;
                whether you would like to facilitate a group; when you are free
                each week; whether you have SU membership; and, if you want to
                tell us, anything we should know to make the programme work for
                you.
              </p>
              <p>
                <strong>Starting without an account.</strong> You can start the
                form before you have joined. Its first step then also asks for
                your university email address and your agreement to our Terms
                of Use and this policy, and it is your request to join as well
                as the start of your application. When you continue you make an
                account, and what you typed becomes your profile. Joining this
                way does not sign you up to the newsletter or to event
                announcements.
              </p>
              <p>
                <strong>Access requirements.</strong> Whatever you write in the
                box about what would make the programme work for you, we treat
                as sensitive, because people use it to tell us about
                disability, health or caring responsibilities. It is stored
                apart from your application, it is never scored, and it is
                never shown to reviewers or to a programme&apos;s lead. Only
                admins can open it, one application at a time, and we record
                each time one does. Leaving it blank never counts against you.
                For anything about health or disability in it we rely on your
                explicit consent, given by choosing to fill it in, and you can
                ask us to delete it without affecting your application.
              </p>
              <p>
                <strong>Who reads your application.</strong> Admins, and the
                lead and reviewers of each programme you ranked. They are
                students: admins and committee members the Students&apos; Union
                recognises. They see your name and everything you sent,
                including your answers for the other programmes you ranked, the
                earlier versions you sent and when you are free. Only admins
                see your email addresses and your answer about SU membership.
                If you accept an invitation to a programme you did not rank,
                its lead and reviewers can read your application from then on.
                If you said you would like to facilitate, the lead of each
                programme you named reads your answers about facilitating, with
                your name, your degree or area of work and your status or
                graduation year, and from decision day where you stand in a few
                words.
              </p>
              <p>
                <strong>Scores, comments and decisions.</strong> Where a
                programme uses scores, a reviewer may score your answers to its
                own questions from 1 to 5. Reviewers may also comment on your
                answers and on your application as a whole. Each
                programme&apos;s decision on you is recorded beside your
                application, never on it, with who made it, when and any reason
                noted. You are offered one place a term: the highest-ranked
                programme that accepts you. If none does, an admin decides what
                you will hear instead: an invitation to a programme you did not
                rank, or no offer this time. We do not send feedback on
                applications as standard; ask us and we will consider it.
              </p>
              <p>
                <strong>Decision day, and after it.</strong> Nothing about a
                decision reaches you before decision day. On the day an admin
                sends every outcome together: it is shown on your application
                page and emailed to your account&apos;s address whatever your
                notification settings, because it answers your application. An
                application every programme turned down outright, as spam or as
                not eligible, is not emailed unless an admin chooses to. After
                that:
              </p>
              <ul>
                <li>
                  If you are invited, or hold a place, we may ask you to reply
                  or confirm by a day, and email you a reminder once a day until
                  you do. Switching off course announcement emails on your
                  profile stops these reminders. If the day passes, nothing
                  happens by itself: your place stays yours until a person
                  decides to offer it to somebody else.
                </li>
                <li>
                  If somebody gives a place back, until the end of the
                  programme&apos;s first week it may be offered to somebody who
                  ranked the programme and was told no offer this time, unless
                  the programme turned them down. That offer is emailed whatever
                  your settings.
                </li>
                <li>
                  We may ask you to facilitate a group: because you said you
                  would like to, or, if you hold a place, because an admin
                  thinks you would be good at it. The ask is emailed whatever
                  your settings, with up to three reminders, and saying no
                  changes nothing about your place. We keep a record of each ask
                  (who asked, when, for which group, your answer and when, and a
                  copy of the email) without your email address; the
                  programme&apos;s lead, admins and you can see it.
                </li>
                <li>
                  If your group meets outside the times you gave, the email
                  telling you your group may start with a few sentences written
                  to you about it.
                </li>
                <li>
                  Once you know your group, you can tell us whether you can make
                  its time, and if not, why and what would work. Only the
                  programme&apos;s lead and admins see that, not your
                  facilitators.
                </li>
                <li>
                  When you reply (you are coming, you can&apos;t make it, you
                  accept an invitation, or no thanks), we record your answer,
                  when you gave it and any reason. Your reason is kept with your
                  application, where the people who read it can see it.
                </li>
                <li>
                  If you join a programme after decision day, we ask you what
                  the form would have asked.
                </li>
              </ul>
              <p>
                <strong>Your account while you apply.</strong> You can apply
                while your request to join is waiting, and send once your
                university address is confirmed. A place on a programme
                approves your request, and we record when and which admin
                approved it.
              </p>
              <p>
                <strong>What you can see.</strong> Your answers, when you last
                sent them, your choices and, from decision day, your outcome and
                your replies. Not the scores, the comments, each
                programme&apos;s decision or your earlier versions: ask us for
                any of them (see <a href="#your-rights">Your rights</a>).
              </p>
            </section>

            <section id="taking-part" className={styles.section}>
              <h2>Taking part in a programme</h2>
              <p>
                <strong>Your place and your group.</strong> We record your
                place, your group, when you were told it and any later move.
                Groups are made from the times people gave, and a person places
                everybody.
              </p>
              <p>
                <strong>Registers.</strong> Your group&apos;s facilitators take
                the register at each session: present, arrived late, left
                early, absent or excused. You can see your own once it is
                submitted. We may let you tell us in advance that you
                can&apos;t make a session, which records you as excused.
              </p>
              <p>
                <strong>Your calendar link.</strong> &quot;Add to calendar&quot;
                gives you a private link to your sessions: their days, times
                and rooms, with no names, no email addresses and never a meeting
                link. Your calendar&apos;s provider (Apple, Google or Microsoft,
                for example) fetches it from us now and then, under its own
                privacy policy. Anyone holding the link sees the same, so keep
                it to yourself; you can replace it at any time.
              </p>
              <p>
                <strong>What other people taking part see.</strong> Your name.
                On a programme anyone can join, a comment or star rating you
                leave on its material. In a group, the notes you share with it,
                with your name and the day. When a session is in pairs, your
                partner sees your first name and whether you are bringing a
                laptop. On an incubator, your group sees a pitch you send, with
                your name, and your team sees that you are in it and what you
                write on its page. Nothing else.
              </p>
              <p>
                <strong>What your facilitators see.</strong> Who is in their
                group, by name only: never an email address (they write to the
                group through the site). The register, your work and progress
                (see <a href="#your-work">Your work</a>), and before the first
                session whether you have said you are coming. Nothing else from
                your application, and no review scores.
              </p>
              <p>
                <strong>What the people leading a programme see.</strong>{" "}
                Everything a facilitator sees, for every group, and also: who
                can&apos;t make their group&apos;s time and why, the reasons
                people give for leaving, the pitches and teams on an incubator,
                who might facilitate, who finished, and the totals and comments
                of the programme&apos;s surveys, never with a name.
              </p>
              <p>
                <strong>Notes about a group.</strong> A group&apos;s
                facilitators may keep notes for each other about how it is
                going, and a note may mention you. Facilitators may also write a
                note about a named person after a session. The group&apos;s
                facilitators, the programme&apos;s lead and admins read both.
              </p>
              <p>
                <strong>Session reports.</strong> After a session, facilitators
                may report how it went, including who engaged well and who
                seemed to need a hand or hadn&apos;t done the reading. The
                programme&apos;s lead and admins read these. You don&apos;t see
                them on the site, but you can ask for what is written about
                you.
              </p>
              <p>
                <strong>Notes shared with your group.</strong> On a programme
                that places you in a group, each week&apos;s page has notes the
                group and its facilitators share. A note you add is shown with
                your name and the day to your group, its facilitators, the
                programme&apos;s lead and admins. While you are in the group you
                can delete your own notes; if you leave, they stay with the
                group.
              </p>
              <p>
                <strong>Incubators.</strong> You may pitch a project, alone or
                with a partner from your group; sending a pitch shares it with
                your group, with your names. You can say which of your
                group&apos;s pitches you would join, and nobody in your group is
                told which; the lead and admins see how many would join each
                one, not who. The lead or an admin puts people into teams, from
                pitches or from the projects you ranked, and we email you your
                team&apos;s name and who is in it. Your team&apos;s page (its
                project, a weekly update, its links and its hand-in) is seen by
                your team, the lead and admins, and anybody in the team can
                change it.
              </p>
              <p>
                <strong>Feedback on the material.</strong> You can give a piece
                of course material a star rating, and on a programme anyone can
                join, leave a comment the rest of your run sees. The lead sees
                each piece&apos;s average once three people have rated it,
                never who gave which.
              </p>
              <p>
                <strong>Leaving.</strong> If you leave, we record that you left
                and when, and you leave your group at once. A reason you give is
                read by admins and the programme&apos;s lead only, and is kept
                with your place, not your application. The register keeps what
                it said about you up to then, with the day you left, and what
                you wrote stays in our records for the lead and admins.
              </p>
              <p>
                <strong>Who finished, and certificates.</strong> After the last
                session we record as finished everyone who came to the number of
                sessions the lead set; the lead can change anybody&apos;s, and
                we record who changed it and when. Only the lead and admins see
                the list. If you finished, or facilitated a group, we send you a
                certificate: a page with your name, the programme, the term, how
                many weeks it ran and the day it was issued, and a PDF. It
                starts private: until you turn its link on, only you can open
                it, and you can turn it off again at any time. Add to LinkedIn
                sends nothing until you press it. If you did not finish, you are
                not sent one and not told.
              </p>
              <p>
                <strong>If you facilitate your own group.</strong> A facilitator
                can also hold a place in the group they run. You are then one of
                its people as well: on its register and counted for who
                finished. Your own work is read by the programme&apos;s lead and
                admins, not by the group&apos;s other facilitators, and they
                don&apos;t give you feedback on it.
              </p>
            </section>

            <section id="your-work" className={styles.section}>
              <h2>Your work, progress and reminders</h2>
              <p>
                <strong>What we record.</strong> What you tick, write and send
                on each week&apos;s pages, and when: the readings you tick, your
                reflections and written answers, the boxes you fill in, the
                packs you pick, your sealed predictions and the private notes
                you keep against the material.
              </p>
              <p>
                <strong>Who reads it.</strong> You, your group&apos;s
                facilitators, the programme&apos;s lead and admins, and nobody
                else taking part; the week&apos;s page says so. If you
                facilitate a group, your own work is read by the lead and admins
                only. Two things are narrower still. Your sealed predictions are
                read by you and admins alone, and each time an admin opens them
                we record it first; if we can&apos;t record it, they stay
                closed. Your private notes on the material are read by your
                group&apos;s facilitators and admins, and we use them to improve
                the course. A facilitator may read out a line of a reflection
                without saying whose it is.
              </p>
              <p>
                <strong>Changing your work.</strong> The week&apos;s page says
                until when you can change your work, and the people running
                your group can reopen it for you. Until you send it, the people
                who read it see only that you have started, never what it says.
                If your week locks before you send it, they may then read what
                you wrote.
              </p>
              <p>
                <strong>Using your work later.</strong> What you write on a
                programme after you first agreed to version 13 of this policy,
                or after you joined if that was later, may also be used when we
                consider you for something else with us, such as another
                programme, facilitating a group or the committee. Anything you
                wrote before that is used only within its programme.
              </p>
              <p>
                <strong>Reminders.</strong> Before your group&apos;s session we
                may email you about what is left of that week&apos;s work. These
                reminders are part of running the programme, so your
                notification settings don&apos;t switch them off, and they stop
                once the week is done.
              </p>
            </section>

            <section id="feedback-and-notes" className={styles.section}>
              <h2>Feedback, ratings and notes</h2>
              <p>
                <strong>Feedback.</strong> Feedback on your work is written by a
                person on the team running your programme, and shows their
                name. It appears on the week&apos;s page, and we may email you
                to say feedback is waiting.
              </p>
              <p>
                <strong>Ratings for the team.</strong> The people running a
                programme may rate your written work and comment on it for each
                other, alongside the feedback you see. You are never shown these
                ratings or comments. The tools under{" "}
                <a href="#ai-review">AI-assisted review</a> may also grade
                answers to help us choose what to read first; those grades are
                never shown to you, are never a mark, and are never kept on your
                record.
              </p>
              <p>
                <strong>Ratings at the end of a programme.</strong> When a
                programme ends, each group&apos;s facilitators rate the people
                taking part in it: how much they joined in, their grasp of the
                material, how much improving AI outcomes seems to drive them,
                and whether they would recommend them for a more demanding next
                step. On an incubator they also rate the person&apos;s research
                or technical skill, how independently they can steer their
                research and how strongly they support it continuing. Beside
                each rating we show how many sessions the person came to, from
                the register. Nobody rates themselves, and a facilitator who
                takes part in a group is rated by the programme&apos;s lead or
                an admin. These ratings are read by the programme&apos;s lead,
                admins and the person who gave each one, and never by the
                person rated. Unless you say no, they go to Kairos (see{" "}
                <a href="#sharing">Services we use, and sharing</a>).
              </p>
              <p>
                <strong>Notes about you.</strong> Admins, and the people leading
                a programme you are on, may keep notes about you, for example
                how you are taking part and what you do well. Each says who
                wrote it and when, and admins can keep some to themselves. Notes
                written before version 15 stay readable by admins only. You
                don&apos;t see notes on the site, but they are part of a copy of
                your data if you ask. Claude may draft a note (see{" "}
                <a href="#ai-review">AI-assisted review</a>); a person reads and
                edits it before it is kept, and a kept note says it was drafted
                by Claude.
              </p>
            </section>

            <section id="surveys" className={styles.section}>
              <h2>Surveys and check-ins</h2>
              <p>
                <strong>What we ask.</strong> We may ask you to fill in surveys
                before, during and after a programme (including short check-ins
                at the end of a session), after events you had a place at, and
                in follow-ups you agree to. They ask about you and your plans,
                what you learned, and how the programme or event went; the
                questions vary. An event&apos;s survey may be sent automatically
                after it ends. Follow-ups at 6 and 12 months go only to people
                who tick the box saying we may send them, which starts
                unticked; you can change your answer later.
              </p>
              <p>
                <strong>Confidential.</strong> Every survey is confidential: we
                keep your answers with your name, and each survey says so at the
                top. Only NAISI&apos;s admins can see who said what, and we
                record each time one of them does. The programme&apos;s lead
                sees the totals and comments of its surveys, and never sees your
                name or who answered and who did not, and cannot download the
                answers. When only a few people answer, the lead may still be
                able to tell which answer is yours. Facilitators may see their
                own group&apos;s check-in totals, never who said what and never
                the comments, and see nothing else of a survey. An event&apos;s
                organisers are told that its survey went and when, and nothing
                of its results. Nothing you say in a survey affects your place
                on a programme or an application.
              </p>
              <p>
                <strong>What a survey records.</strong> Your answers, when you
                sent them, whether you used your own link or were signed in, and
                whether your group had met by then. Nothing about how you filled
                it in, and none of your answers until you send them. We never
                keep your IP address with them.
              </p>
              <p>
                <strong>Questions that need an answer.</strong> Every question
                needs an answer unless it is marked optional. The boxes that ask
                your permission are always up to you: whether we may contact you
                for follow-ups, whether we share your details with Kairos, and
                whether we may quote you. If you sent a survey with questions
                left blank, an admin may send you a link to answer just those;
                it shows none of your earlier answers, and adds to them without
                changing them.
              </p>
              <p>
                <strong>How a survey reaches you.</strong> A survey&apos;s email
                is a notice, so your notification settings don&apos;t switch it
                off, and it carries a link of your own so you can answer without
                signing in. Anyone holding it could answer in your name, so keep
                it to yourself. At the end of an event, its QR code opens its
                survey. If you leave a programme while it has a survey about
                leaving, a link to it appears where you are told you left.
              </p>
              <p>
                <strong>Quoting you, and what we publish.</strong> Under a long
                answer there may be a box saying &quot;You can quote this,
                without my name&quot;, which starts unticked. NAISI&apos;s
                admins may publish, on a programme&apos;s page, numbers from
                that programme&apos;s own surveys, with how many people
                answered, and comments whose writers ticked that box, each with
                the term and no name. An admin can take them down at any time,
                and will if you email us.
              </p>
              <p>
                <strong>The anonymous form.</strong> One form never records who
                answers: the keep, change and drop form at the end of a
                programme. It never asks who you are, even when you are signed
                in, and keeps only the programme and the day with your answers.
                The programme&apos;s lead and admins read them, from the next
                day, in an order unrelated to when each came in.
              </p>
            </section>

            <section id="ai-review" className={styles.section}>
              <h2>AI-assisted review</h2>
              <p>
                We use two outside tools to help the people running NAISI read
                what is written to us. Neither decides anything.
              </p>
              <ul>
                <li>
                  <strong>Claude</strong>, an AI model made by Anthropic, can
                  read, compare, summarise and draft.
                </li>
                <li>
                  <strong>Pangram</strong>, from Pangram Labs, estimates whether
                  writing was produced with AI.
                </li>
              </ul>
              <p>
                <strong>Applications, and placing people.</strong> An admin may
                ask Claude to read an application, first on its own and then
                with the reviewers&apos; scores and comments, and write a short
                assessment; to compare the applications to a programme; before
                decision day, to suggest who might suit which of the programmes
                they ranked and who would make a good facilitator, including
                people who did not offer; and once places are decided, to
                suggest how to arrange the people holding places into groups
                and who might facilitate each. An admin may ask Pangram to check
                an application&apos;s longer answers. What is sent leaves out
                your name, your email addresses, your access requirements and
                your answer about SU membership; each applicant is a number and
                each reviewer a letter. For groups, Claude is told which of the
                proposed times each person can make, never the times you
                marked.
              </p>
              <p>
                <strong>Coursework, survey answers and session reports.</strong>{" "}
                Admins may ask Claude to help review coursework, survey answers
                and session reports: to grade answers, pick out the strongest
                and weakest, and say what people found hard and who might need a
                hand. Admins may ask Pangram to check longer answers for writing
                produced with AI. Once a week Claude may also draft a short note
                on how each person is doing, using only the work they submitted
                and the feedback, ratings and comments people on the team gave
                it. Only what you wrote after you first agreed to version 13 of
                this policy, or after you joined if that was later, is ever
                sent.
              </p>
              <p>
                <strong>What is sent, and what comes back.</strong> The tools
                receive the words with a number in place of each name, and no
                email address. What comes back is seen by admins only, and is a
                reason for a person to look, never a decision about you. It is
                kept with what it was about (the application, or the
                programme&apos;s run) and deleted with it. Nothing of it is
                filed on your profile, except a note an admin has read, edited
                and saved, which says it was drafted by Claude.
              </p>
              <p>
                <strong>Words that may reach you.</strong> Claude may draft a
                few sentences that an admin then sends you: a note in an
                invitation to a programme you did not rank, a note with your
                group if it meets outside your times, or a sentence asking you
                to facilitate. For these Claude is sent your application alone,
                with the programme&apos;s description, and never the
                reviewers&apos; scores or comments or the times you marked.
                Nothing Claude drafts reaches you until a person has read it,
                changed it as they see fit, and saved or sent it.
              </p>
              <p>
                <strong>No decision by a machine alone.</strong> No decision
                about you is made solely by automated means. Scores are given by
                named reviewers, and a programme&apos;s score for an application
                is the average of theirs; the site shows reviewers which
                applications scored highest, as a guide. Who finished starts
                from the number of sessions the lead chose, and the lead can
                change anybody&apos;s. On an incubator the site can put teams
                together when the lead asks, and the lead can move anybody
                before people are told. What Claude or Pangram says is one view
                a person weighs, and nothing is done because of it alone.
              </p>
            </section>

            <section id="events" className={styles.section}>
              <h2>Events and attendance</h2>
              <p>
                <strong>Signing up.</strong> When you sign up for an event, we
                keep your name and email address (your account&apos;s, if you
                are signed in), your answers to the event&apos;s questions, and
                where your sign-up stands: waiting for a decision, confirmed, on
                the waiting list, cancelled or turned down, with any change you
                ask for. Dietary and accessibility questions are optional, and
                we use your answers only to run that event; for anything about
                health in them we rely on your explicit consent, given by
                answering.
              </p>
              <p>
                <strong>Who sees sign-ups.</strong> Admins and the committee
                members the Students&apos; Union recognises see who signed up.
                The people organising an event may see who has asked for a
                place, with a few words about each: whether you are on a
                programme and in which group, whether you facilitate a group,
                and whether you hold SU membership.
              </p>
              <p>
                <strong>Events for chosen people.</strong> Some events may be
                for people we choose. They are not listed or announced: they
                show on your Home, and we email you an invitation. If an event
                is part of a programme you are on, its invitation is a programme
                email and reaches you whatever your settings.
              </p>
              <p>
                <strong>Coming to an event.</strong> If you come, we may record
                that you came, how and when: a committee member checks you in on
                the door list, or, at an event that lets you, you check yourself
                in from the link in your confirmation email or with the code at
                the door. Anyone holding your email&apos;s link could check in
                in your name, so keep it to yourself. Only admins and the
                committee members the Students&apos; Union recognises can see
                who came; the event&apos;s other organisers see how many came,
                never who. If you come without signing up, we take your name at
                the door, and an email address only if you want the event&apos;s
                survey; we use it for nothing else, and delete it when that
                survey closes or a week after the event, whichever is sooner.
              </p>
              <p>
                <strong>Attendance.</strong> Admins can see which events you
                signed up for and whether you came. Missing two events in a row
                that you had a place at may be taken into account when places
                are decided. Telling us beforehand that you can&apos;t make it,
                or giving your place back before the day, never counts, and the
                count starts again each academic year. Admins also see totals
                across a term&apos;s events (how many different people came, and
                how many came to two or more), counting you once by your account
                or email address; a walk-in with no account is never matched.
              </p>
            </section>

            <section id="conduct" className={styles.section}>
              <h2>Conduct</h2>
              <p>
                If there has been a conduct concern, an admin may flag an
                account and must record a reason: what happened, and when. Only
                admins can read the reason for a conduct flag. Where decisions
                about you are made, such as reading applications or deciding
                event sign-ups, other people may see only a marker asking them
                to talk to an admin first. A flag and its reason are personal
                data about you, and you can ask us for them.
              </p>
            </section>

            <section id="emails" className={styles.section}>
              <h2>Emails and notifications</h2>
              <p>
                <strong>Your choices.</strong> Your profile has four kinds of
                message: the newsletter, event announcements, course
                announcements, and tasks and worksheets. Each has its own email
                choice and its own notification choice, so a notification can
                still arrive for a kind whose email you switched off. The
                newsletter and event announcements start switched off until you
                choose them.
              </p>
              <p>
                <strong>Three kinds of email.</strong> Some follow your choices:
                the newsletter, announcements, and reminders that aren&apos;t
                part of running something you are in. Some answer something you
                did, such as a sign-up&apos;s confirmation, an application&apos;s
                receipt or a decision. And some are notices from the people
                running an event you signed up for or a programme you hold a
                place on, about running it: a room change, a survey, a reminder
                about this week&apos;s work. Notices reach you whatever your
                choices, say why they reached you, and carry no unsubscribe
                link. Unsubscribing from a programme&apos;s optional emails stops
                those and never its notices; to stop a programme&apos;s notices,
                leave the programme.
              </p>
              <p>
                <strong>Choosing who a message reaches.</strong> To choose who a
                message, survey or invitation reaches, we use what we already
                hold, such as your programme, your group, your role and the
                events you came to. Admins may also make lists of people for
                this; a list you are on is part of a copy of your data if you
                ask.
              </p>
              <p>
                <strong>The newsletter.</strong> Your address, your name if you
                gave one, whether you are subscribed to each list, and a record
                of each subscribe and unsubscribe.
              </p>
            </section>

            <section id="sharing" className={styles.section}>
              <h2>Services we use, and sharing</h2>
              <p>
                We do not sell your data, and we do not share it for
                advertising. We use the outside services listed on{" "}
                <a href={SERVICES_HREF}>Services we use</a> to run the site,
                each with what it receives. If we add a service, we update that
                page and tell you before it receives anything about you.
              </p>
              <p>
                <strong>Sharing with Kairos.</strong> Kairos supports AI safety
                groups at universities and is one of our funders. Unless you
                say no, when a programme ends we send Kairos a file with, for
                each person on it at the end: their name, the programme, how
                many sessions they came to, whether they finished, and the
                ratings they were given at the end. It never holds your email
                address, your survey answers or who gave a rating. Kairos uses
                it to see what its support achieves and to point promising
                people towards work in AI safety. Every programme survey ends
                with a box to say no, and the same choice is on{" "}
                <a href="/profile">your profile</a>; you can change it at any
                time, and the next file goes by it. Saying no changes nothing
                else: your survey answers still count in our totals. A file
                already sent is held by Kairos, and changing your mind later
                does not recall it.
              </p>
              <p>
                <strong>Funders and sponsors.</strong> We report totals to them,
                Kairos among them: how many people applied to, started and
                finished a programme, how answers to our surveys changed between
                the start and the end, and figures like those, each with how
                many people it counts. These never name anybody. For an
                incubator we may also pass on the links its people give us, in
                the survey at its end, to the work their team produced; that
                question says so.
              </p>
              <p>
                <strong>The Students&apos; Union and the law.</strong> We may
                share data with the University of Nottingham Students&apos;
                Union where we have to as an affiliated society (for example, to
                confirm membership numbers or report on activities), and with
                the police or regulators where the law obliges us to.
              </p>
            </section>

            <section id="legal-bases" className={styles.section}>
              <h2>Lawful bases</h2>
              <p>Under the UK GDPR we rely on:</p>
              <ul>
                <li>
                  <strong>Our contract with you as a member</strong> for your
                  account and member pages; handling your applications; running
                  a programme you hold a place on, including registers, your
                  work, feedback, reminders, check-ins, session reports and its
                  notices; and handling your event sign-ups and their notices.
                </li>
                <li>
                  <strong>Legitimate interests</strong> for running the society
                  day to day and keeping the site secure; assessing applications
                  fairly, including with AI-assisted review; the team&apos;s
                  ratings and notes about you, and using them and your work
                  (written after version 13) when we consider you for something
                  else later; taking missed events into account when places are
                  decided; counting who comes to events; reporting totals to
                  funders; sharing with Kairos, which you can stop at any time;
                  and the committee&apos;s tools. We have weighed these against
                  your interests, and we hold only what they need.
                </li>
                <li>
                  <strong>Consent</strong> for the newsletter, event
                  announcements, notifications on your devices, follow-up
                  surveys and quoting a comment of yours. You can withdraw it at
                  any time from your profile, through the link in the email, or
                  by emailing us.
                </li>
                <li>
                  <strong>Explicit consent</strong> for health or disability
                  information you choose to give in an access-requirements
                  answer or an event&apos;s dietary or accessibility questions.
                </li>
                <li>
                  <strong>Legal obligation</strong> where the law requires us to
                  share data.
                </li>
              </ul>
            </section>

            <section id="retention" className={styles.section}>
              <h2>How long we keep it</h2>
              <ul>
                <li>
                  <strong>Your account and profile:</strong> while your account
                  is active, and for a reasonable time after, so we can restore
                  it if you come back and answer questions that come up
                  afterwards.
                </li>
                <li>
                  <strong>Applications</strong>, with their scores, comments and
                  decisions: while your account exists, so a later application
                  from you can be read in context. When a term&apos;s
                  applications are finished with or destroyed, we keep a short
                  record of each application for admins only: what you applied
                  for, the decision, and the reviewers&apos; names with their
                  average scores and overall comments, with none of your own
                  writing and no email address.
                </li>
                <li>
                  <strong>Your course record</strong> (your place, the
                  registers, your work and the feedback on it, notes
                  facilitators wrote and session reports): while your account
                  exists.
                </li>
                <li>
                  <strong>Notes about you, and the team&apos;s ratings of your
                  work:</strong> while you are a member. Once a year an admin
                  goes through them by hand and deletes those about people who
                  have left the society.
                </li>
                <li>
                  <strong>Ratings at the end of a programme:</strong> two years
                  after its last session.
                </li>
                <li>
                  <strong>Survey answers:</strong> we take your name off two
                  years after the programme&apos;s last session (or the event),
                  and delete the record that the survey was sent to you with
                  your link. Your answers stay in the totals, no longer linked to
                  you. Answers to the anonymous form are kept until the
                  programme&apos;s run is deleted.
                </li>
                <li>
                  <strong>Who came to an event:</strong> names for a year after
                  the event, then only the count. A walk-in&apos;s email address
                  until that event&apos;s survey closes, or a week after the
                  event if sooner.
                </li>
                <li>
                  <strong>What AI tools returned:</strong> with what it was
                  about, and deleted with it.
                </li>
                <li>
                  <strong>A conduct flag:</strong> until an admin removes it.
                </li>
                <li>
                  <strong>Your choice about Kairos:</strong> while your account
                  exists, so a later programme goes by it too.
                </li>
                <li>
                  <strong>Logs:</strong> a log of the emails we send (subject,
                  recipient and whether it was delivered) and a list of
                  addresses that bounced or reported us as spam, so we stop
                  writing to them; a record of the spreadsheets staff download
                  that hold the most about people (who asked, what it covered,
                  how many people were in it and when), and of each time an
                  admin opened an access-requirements answer, sealed predictions
                  or survey answers; and a log of decisions on applications.
                  These record what staff did, not what you wrote, and are kept
                  as long as we need them to look into problems and show we
                  acted properly. Our hosting provider&apos;s request logs (IP
                  address, browser and time) are used only to fix errors and
                  stop abuse, never for analytics.
                </li>
              </ul>
              <p>
                <strong>Deleting your account.</strong> Email us and an admin
                will delete it without undue delay. There is no delete button
                once you are a member, because taking somebody&apos;s work out
                of the committee&apos;s tools is done by hand. Deleting it
                removes your account and profile, your subscriptions, your
                applications and drafts with their access requirements and the
                scores, comments and decisions about them, your places on
                programmes, your work and the feedback on it, the notes and
                ratings about you and those you gave, a conduct flag, your
                survey links and your name on your survey answers, your
                membership records, your choice about Kairos and a certificate
                whose link is off. Registers keep the rest of the group, without
                you.
              </p>
              <p>
                It leaves: the short record of each application described
                above; worksheets sent to you and their reviews; survey answers
                and the count of who came, no longer linked to you; a comment of
                yours quoted without your name (email us and we will take it
                down); a pitch you sent with a partner, and what you wrote on
                your team&apos;s page, without your name; tasks you were on;
                your event sign-ups, with any dietary or accessibility answers;
                files you uploaded; the email log and suppression list; staff
                logs; and a certificate whose link is on, because it exists for
                the people you gave the link to (email us and we will withdraw
                it). Some of this stays because removing it would break work
                other people are still doing; we clear it out by hand, and you
                can ask us to remove something sooner.
              </p>
            </section>

            <section id="your-rights" className={styles.section}>
              <h2>Your rights</h2>
              <p>
                Under UK data protection law you can ask us for a copy of the
                personal data we hold about you; ask us to correct it or
                complete it; ask us to delete it, where there is no overriding
                reason to keep it; ask us to restrict or stop using it; ask for
                it in a portable format, where we rely on consent or our
                contract with you; and withdraw consent at any time where we
                rely on it.
              </p>
              <p>
                Most of this you can do yourself: edit your profile and
                notification choices, and say no to sharing with Kairos, on{" "}
                <a href="/profile">your profile page</a>, and unsubscribe from
                optional email through the link in it. For anything else, email{" "}
                <a href="mailto:ai-safety@uonsu.com">ai-safety@uonsu.com</a>.
              </p>
              <p>
                A copy of your data covers what other people wrote about you as
                well as what you wrote: reviewers&apos; scores and comments,
                each programme&apos;s decision and any reason noted, notes
                facilitators and admins wrote, session reports, ratings, and the
                reason for a conduct flag. Where a record also names somebody
                else, we may need to leave their part out.
              </p>
              <p>
                If you think we have not handled your data properly, you can
                complain to the UK Information Commissioner&apos;s Office at{" "}
                <a href="https://ico.org.uk" target="_blank" rel="noreferrer noopener">
                  ico.org.uk
                </a>
                . We would rather have the chance to put it right first.
              </p>
            </section>

            <section id="cookies" className={styles.section}>
              <h2>Cookies and local storage</h2>
              <p>
                We do not use analytics, advertising or tracking cookies. The
                one exception is Google reCAPTCHA, which sets a cookie of its
                own while it runs on our registration, event sign-up and
                application forms (see{" "}
                <a href={SERVICES_HREF}>Services we use</a>). Every cookie the
                site itself sets is strictly necessary:
              </p>
              <ul>
                <li>
                  <code>__session</code> keeps you signed in and sends you to
                  the right pages. Set when you sign in, it lasts one day for
                  committee members and admins and five days for everybody else,
                  and is cleared when you sign out.
                </li>
                <li>
                  <code>__impersonator</code> marks a &quot;view as&quot;
                  session. It is set only in an admin&apos;s browser while they
                  view the site as another member, and lasts five days or until
                  they leave the session, whichever is sooner.
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
                  sign-in redirect. We compare it with the value Google sends us
                  so that the sign-in cannot be forged.
                </li>
              </ul>
              <p>
                Google&apos;s sign-in script is loaded from{" "}
                <code>accounts.google.com</code> on the sign-in and register
                pages, as soon as you press a link to one of them, and on the
                first step of the application form when somebody who is not
                signed in continues to making an account. Loading it tells
                Google that a browser opened one of those pages.
              </p>
              <p>
                In your browser&apos;s own storage the site keeps four small
                preferences that never leave your device:{" "}
                <code>naisi.sidebar.collapsed</code> (whether you collapsed the
                sidebar), <code>naisi.lastRoute</code> (the last page you had
                open, so the installed app can return you to it),{" "}
                <code>naisi.installCard.dismissed</code> (that you dismissed the
                prompt to install the app) and{" "}
                <code>naisi.auth.loaderOpen</code> (whether the sign-in panel
                was open). Signing in also stores your session in your
                browser&apos;s storage, which Firebase Auth keeps in IndexedDB.
              </p>
              <p>
                If you start an application before you have an account, what
                you type on the form&apos;s first step is kept in that browser
                tab and, if you continue with an email address, in your
                browser&apos;s storage too, so the tab our emailed link opens
                can find it. Both copies use a key beginning{" "}
                <code>naisi.apply.join</code> and hold only your answers to that
                step and when you last changed them: no password, no sign-in
                address and not whether you agreed to our terms. Nothing of it
                is sent to us until you have signed in. Both are removed when
                your request to join is sent; the tab&apos;s copy is ignored
                once it is a day old and goes when you close the tab, and the
                other is ignored once it is an hour old. You can clear all of it
                from your browser&apos;s site settings at any time.
              </p>
            </section>

            <section id="transfers" className={styles.section}>
              <h2>International transfers</h2>
              <p>
                Our services are global. Your data is stored in Google Cloud
                regions and may be processed outside the United Kingdom. Where
                it is transferred outside the UK, we rely on the safeguards each
                service offers, such as the UK International Data Transfer
                Addendum to the EU Standard Contractual Clauses, or the UK
                Extension to the EU-US Data Privacy Framework.
              </p>
            </section>

            <section id="security" className={styles.section}>
              <h2>Security</h2>
              <p>
                We rely on Google&apos;s infrastructure to encrypt data at rest
                and in transit, and on our database&apos;s rules to enforce who
                can read what. Member personal data is readable only by the
                committee members the Students&apos; Union recognises and by
                admins, and by the few people we have allowed to send
                worksheets, who see members&apos; names and photos to choose who
                gets one. Ordinary members see their own record and the tasks
                they are on. Course records about a named person are served only
                through checks on our servers, never handed to a browser that
                has no reason for them. Our email is signed with DKIM and
                aligned with DMARC on <code>naisi.uk</code>.
              </p>
              <p>
                Admins can open the site as you see it, to reproduce a problem
                you reported. It shows them nothing they could not already see,
                they cannot use it to make high-trust changes, and every such
                session is logged with who did it, whose account and when.
              </p>
              <p>
                No service is perfectly secure. If you spot a problem, please
                tell us at{" "}
                <a href="mailto:ai-safety@uonsu.com">ai-safety@uonsu.com</a>.
              </p>
            </section>

            <section id="changes" className={styles.section}>
              <h2>Changes to this policy</h2>
              <p>
                When we change this policy we update the date at the top. If a
                change affects how we use your information (a new use, a new
                outside service, or keeping something longer), we tell you on
                the site and by email before it takes effect, saying what
                changed. Anything that relies on your consent asks you for that
                one thing on its own. You were asked to accept this version; we
                will not ask you to accept later ones. The application
                form&apos;s last step says that sending your application is
                agreeing to this policy, with the date it was last updated.
                Earlier versions stay readable at{" "}
                <a href="/privacy/versions">/privacy/versions</a>.
              </p>
            </section>
          </div>

          <aside className={styles.contactCard}>
            <h2>Questions</h2>
            <p>
              Email{" "}
              <a href="mailto:ai-safety@uonsu.com">ai-safety@uonsu.com</a>{" "}
              with anything privacy-related, including requests to see, correct
              or delete your data. We aim to answer within 30 days.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
