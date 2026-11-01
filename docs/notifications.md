# Notifications

Every message this site sends a member goes out on one of three terms, and the
member sees one grid on `/profile` that says which of them apply to them. This
file is the reference for the whole feature (built September 2026): the three
classes, the four rows and two columns, what reads them, what sends today, and
what a new sender has to declare.

The model lives in `src/lib/firestore/notifications.ts`. That file is
authoritative for the shape and the defaults; everything below is a summary of
it plus the surfaces it feeds.

## The three classes, and the one rule that orders them

| Class | What it does | Examples |
| --- | --- | --- |
| **grid** | Consults the member's row for its category before it sends | the newsletter, the new-event announcement, cohort mail, task and worksheet mail |
| **transactional** | Never consults it, because the member asked for this message by doing the thing it is about | a magic link, an RSVP confirmation, a decision on their own application |
| **notice** | Deliberately ignores it: a person responsible for an audience is addressing that audience about something they signed up for | an organiser telling attendees the room moved, a facilitator writing to their group |

The rule: **every send belongs to exactly one class, the choice is made at the
call site, and the choice is invisible in a diff.** A route that emails a whole
cohort and a route that emails one applicant look identical; the only difference
is whether a preference was read three functions earlier. So the choice is
written down, per (file, symbol), with a reason, in
`tests/notification-classification.test.mjs`, and that guard walks the tree in
both directions. See [Adding a sender](#adding-a-sender).

**Suppression is bypassed by none of them.** `sendEmail` filters against
`suppressedEmails` before it renders and stays the one door out of the product
(`tests/email-suppression-chokepoint.test.mjs` pins that). A notice bypasses
PREFERENCES, never DELIVERABILITY: a bounce or a complaint is a fact about an
address, not a choice.

**Push cells gate push only.** A transactional email's push mirror consults its
row's push cell; the email is sent either way. The two cells of one row are two
answers, so a member who switches the email off and leaves the push on has said
"on my phone, not in my inbox", and the senders honour that literally.

## The four rows and two columns

Four rows (`newsletter`, `events`, `courses`, `tasks`), two columns (Email and
Push), every cell a boolean. Defaults are per row, not uniform, because two
different consent stories were already live when the grid landed.

| Row | Label | Email default | Push default | Why |
| --- | --- | --- | --- | --- |
| `newsletter` | Newsletter | **off**, opt-in | **off**, opt-in | Consent basis. Nobody consents to bulk mail by having an address, and this row also mints `subscriptions` records, so a default of on would be a consent claim we cannot evidence |
| `events` | Event announcements | **off**, opt-in | **off**, opt-in | The same, and also a `subscriptions` row |
| `courses` | Course announcements | **on** unless a stored `false` | **on** unless a stored `false` | The opt-in is the `cohort:<runId>` subscription row written when a member is placed in a group. The row is the refusal layered on top, so only a stored `false` counts |
| `tasks` | Tasks and worksheets | **on** unless a stored `false` | **on** unless a stored `false` | The opt-in is volunteering for the task. A default of off would silence, for everybody at once, mail members already receive |

The rule is one table, applied to both columns:
`OPT_IN_ROWS = ["newsletter", "events"]` resolve `Boolean(v)`;
`OPT_OUT_ROWS = ["courses", "tasks"]` resolve `v !== false`. `resolveRow()` is
the only place that decision is made, and a row in neither list resolves OFF, on
purpose: silence is the recoverable failure.

So **absent means different things per column of one row only by accident of the
row, never of the column**. On `newsletter` and `events`, absent means "has not
opted in" and nothing is sent. On `courses` and `tasks`, absent means "has not
answered" and mail is sent. Junk (a string, a null, a number) is not an answer
either way: it reads as the row's default.

Only the two opt-in rows mint subscription records, through
`SUBSCRIPTION_CATEGORIES` and `/api/subscriptions/sync`. `courses` and `tasks`
are addressed by uid or by cohort channel rather than by list membership, so a
per-address checkbox for either would create a top-level row nothing ever sends
to. Their membership, order, and the `CATEGORY_LABELS` strings for those two
rows are pinned: `scripts/e2e-fixtures/member-journey.mjs` regex-parses them out
of the module and refuses to seed a browser run when they drift.

## The stored shape

```
users/{uid}.profile.notifications = {
  channels:   { gmail, uniEmail },                    // address routing
  categories: { newsletter, events, courses, tasks }, // the EMAIL column
  push:       { newsletter, events, courses, tasks }, // the PUSH column
}
```

**Two parallel maps, and no `{ email, push }` container inside `categories`.**
Such an object is truthy, so every `Boolean(categories.x)` read in the tree would
report every row as wanted for every member, the two `!== false` reads would
never see a refusal again, and the leaf writers that set a category by dotted
path would silently replace it. Sibling maps keep every existing reader and
writer type-correct.

`channels` is EMAIL-ADDRESS ROUTING, which inbox a send lands in, and is not a
column. A push notification has no address, which is why push is a third map
rather than a channel: folding it in would break `addressesForSend`.

### Legacy shapes still read

`normaliseNotifications()` is the one reader, and it has three branches plus a
push resolution outside them:

1. **Modern**: a `notifications` map carrying `channels` or `categories`. Each
   cell through `resolveRow`.
2. **Legacy `newsletter`** (`{ subscribed, deliverToGmail, deliverToUniEmail }`),
   used only when no `notifications` field is written yet. `subscribed` becomes
   the newsletter row, events is false, and **courses and tasks resolve TRUE**.
   That is spelled out rather than defaulted: under the resolver a stored `false`
   is a refusal, the legacy shape has no slot for either row and so cannot
   express one, and returning false would invent a refusal nobody made.
3. **Neither**: `DEFAULT_NOTIFICATION_PREFS`.

**Push is resolved outside that either/or.** The two email shapes are competing
versions of one answer, so exactly one may win; push is an axis neither version
ever carried, so it is read once and attached to whichever branch returns. That
is what makes a legacy profile still come out with the opt-out push rows on, and
why a member who has only ever touched the push switches keeps their stored
`false`.

`push.courseDecisions` is the old name of the `courses` push cell, from when the
push map had topic-shaped keys of its own. It is READ as an alias and only when
`push.courses` is absent (a member who has answered under the new key has
answered), and it is never written again.

### Who writes it

- `/profile` writes the whole `profile.notifications` map on Save, and the push
  column writes a leaf at `profile.notifications.push` on every toggle. See
  [The profile grid](#the-profile-grid).
- `/api/unsubscribe` writes only the keys its token actually names, as dotted
  field paths, and iterates `UNSUBSCRIBABLE_CATEGORIES`: the categories leaf for
  each row it names, plus the PUSH leaf for the two subscription rows. See
  below.
- `/api/admin/migrate-notifications` writes `channels` plus the newsletter and
  events cells and nothing else. Backfilling a `courses` cell from the legacy
  shape would opt every legacy member out of cohort mail, because that shape
  cannot express an answer for a row it never had.
- `/api/admin/subscriptions/[id]/set-status` writes one leaf under
  `.categories.*`, for a subscription row an admin flipped.
- `completeRegistration` in `src/auth/signInWithGoogle.ts` writes the whole map
  once, from the register form, and mirrors the newsletter answer into the
  legacy `profile.newsletter` field.

In `firestore.rules` the owner may write the whole map or any single leaf under
`.categories.*` and `.push.*` on their own document, and `notifications` stays
ONE key of `profile` so the size caps are untouched.
`scripts/rules-tests/tests/users-push-preferences.test.mjs` runs those writes
as a member.

## The two server reads

Two helpers, one per column, and they differ in exactly one place.

| | Email | Push |
| --- | --- | --- |
| Helper | `wantsEmailForProfile(profile, row)` in `src/lib/email/preferences.ts` | `wantsPushFor(uid, row)` in `src/lib/push/preferences.ts` |
| Takes | the profile the sender is already holding | a uid, and reads the document itself |
| Absent or junk cell | the row's default | the row's default |
| No user document | the sender has already skipped them: no document, no address | the row's default |
| A read that FAILS | **the row's default**, so an opt-out row still sends | **no**, always |

The email helper takes a profile rather than a uid because every grid sender
already reads `users/{uid}` for the address and the name; a second read per
recipient to ask one boolean would double the cost of every send loop on the
platform.

**Why the failed-read rule differs.** `wantsPushFor` fails closed because a
dropped push loses nothing (the email it mirrors still goes) while a push to
somebody who switched them off is the exact thing the preference exists to
prevent. Neither half of that holds for email on an opt-out row: the email is not
a mirror of anything, so refusing it loses the message itself (a review request,
a worksheet deadline, an announcement to a cohort the member is enrolled in), and
the member has not refused it, because only a stored `false` is a refusal and a
failed read is not a stored false. Silencing mail nobody refused on the strength
of a transient Firestore error is the worse mistake and the one nobody would
notice. The opt-in rows keep failing closed for free, because their default is
off.

`hasOptedOutOfCourseAnnouncements()` in `src/lib/email/courseFacilitatorEmails.ts`
is that helper inverted, for the loops that hold a raw document and are asking
"has this person refused?".

## What sends today

| Row | Email | Push |
| --- | --- | --- |
| `newsletter` | `POST /api/newsletter/[id]/send`, the only sender of an issue; and a message in Messages by their settings whose writer chose this row | the newsletter send, alongside its email loop |
| `events` | the new-event announcement, on publish, inline or queued to the `event-announcements` job, for a listed event whose Announce is not switched off; an event for chosen people's invitation, to the people chosen who are not reached as a notice; and a message in Messages by their settings whose writer chose this row | the same announcement; never the invitation |
| `courses` | the cohort announcement composer, the admissions deadline reminder job, the admissions stage-release job, the daily invitation reminder job; and a message in Messages by their settings whose writer chose this row | an admissions decision, an allocation publish, the stage release |
| `tasks` | the five `/api/tasks/[id]/*` senders, the four worksheet circulation messages, the worksheet due-soon reminder, the register reminder to a group's facilitators (`courses-register-reminders`) | a mirror beside each of those but the register reminder, which is email only |

**The two opt-in rows share one push audience shape**, in
`sendPushToRowAudience` (`src/lib/push/rowAudience.ts`): every account with a
device whose cell for that row is on, enumerated from `pushSubscriptions`,
deduped by owner, one preference read each, refused whole over 500 device rows.
The newsletter send and the event announcement both call it, each naming its own
row, and each dispatches it CONCURRENTLY with its email leg because two bounded
loops in one request cost the larger rather than the sum.

Only `newsletter` and `events` may be addressed that way, which is why the
helper's row parameter is narrower than the four. Their cells resolve OFF when
absent, so a scan of every device reaches only the accounts that answered yes.
On `courses` and `tasks` an absent cell resolves ON, so the same scan would
notify every account that has ever enabled a device; those rows are addressed by
uid instead, by the mirrors beside their emails.

The newsletter notification carries the subject and lands on `/dashboard`. A
newsletter has no web view at all (the only render of one is
`POST /api/newsletter/preview`, gated to drafters and approvers), so the
destination is the member's own home rather than the message. The audience is
DEVICES whose last claimant holds the cell, not signed-in sessions: a push
subscription belongs to a browser profile and survives sign-out
(`src/lib/push/store.ts`), so a signed-out device lands on the sign-in page.
That is still this app and still the right door, where the marketing homepage
would say less and the drafter tool would refuse them outright.

**The send is claimed once.** `POST /api/newsletter/[id]/send` stamps
`sendClaimedAt` on the draft in one transaction that also requires `approved`
and no standing claim, in the same shape the publish route claims `announcedAt`.
Two approvers pressing Send at once therefore produce one send and one 409, and
both legs sit inside that one claim, so a push cannot repeat without an email
repeating. The write that sets `sent` deletes the field.

The subject and blocks that go out are re-derived from the snapshot that
transaction read, not from the read at the top of the route: an approved draft
is still editable, so a correction saved in that window is what gets mailed. A
draft emptied in the same window answers 400 and hands the claim straight back,
because nothing was sent.

Nothing expires a claim, on purpose: a rule that released it after N minutes
would re-mail the whole list on the day a send took longer than N. So a request
killed part way through leaves the draft `approved` and carrying
`sendClaimedAt`, and every retry is refused until an admin clears that field,
having read the send log to see who already has the mail.

The `courses` email senders resolve their audience through `resolveCohortAudience`,
which drops anybody whose row is a stored `false` before a message is rendered.
The two admissions jobs read the row per recipient, off the user document they
fetch for the name, and carry on with the opt-out unset when that read fails.

**The "you have feedback" email is transactional, and goes in a batch.**
Feedback on somebody's week is a signed comment that shows on their week page
as soon as it is saved, and saving it emails nobody. An admin sends the email
that says it is there from the programme's Overview, one message to each person
whose feedback the press left ticked however many pieces it announces, after a
test to themselves in the last day (`src/lib/courses/feedback/send.ts`). It is
about the person's own work, as the placement email is about their own place
and the certificates about their own certificate, so it consults no row and
carries no notice marker: it reaches only the people whose feedback the press
names, each at their own account's address. Its rows in the log carry
`kind: "course-feedback"`, its tests `course-test`. Until November 2026 the
same email went once per piece, straight from the review route; the
registry's entries moved with it, and the class did not change.

**Invitation reminders (`application-invitation-reminders`).** Once a day, from
10:00 London and never after 18:00, to everybody invited on decision day who
has not replied, from the day after they were told up to their own reply-by
day. Grid, courses row, email only: somebody who has switched course emails
off gets the invitation itself (transactional) and not the reminders, and a
user document that cannot be read is not a refusal. One a day is
`invitation.lastReminderOn` on the application, written before the send; the
job claims no scheduler marker. It registers with `enabledByDefault: false`.
The Send decisions page tells admins that invited people are reminded only
while one of the last three scheduled tick receipts lists this job as run, so
switching it on where the tick is not armed changes nothing on that page.

The `tasks` senders run **their gates in series, any one a skip**, and the
member's row is always the last. The order of the gates above it is per lane,
cheapest read first: the five task routes read the site-wide
`config/taskEmails` kill switch and then the row; `src/lib/worksheets/notify.ts`
reads the circulation's own switch for this event first, because it is already
loaded and costs nothing, then the kill switch, then the row; the due-soon
reminder job reads the kill switch once per run, then the circulation's
`dueSoon` toggles, then the row per recipient. The row gates EMAIL only; the
push mirror reads the push cell for itself, which is why a member who has
switched the email cell off still gets the notification.

Every push cell is read in exactly one place: `push.tasks` in
`src/lib/push/taskNotifications.ts`, `push.courses` in
`src/lib/push/courseNotifications.ts`, and `push.newsletter` and `push.events`
in `src/lib/push/rowAudience.ts`, which reads whichever of the two its caller
names.

## The marketing unsubscribe link's reach

`UNSUBSCRIBABLE_CATEGORIES = ["newsletter", "events", "courses"]`, and
`/api/unsubscribe` iterates that, never `ALL_CATEGORIES`.

`tasks` is deliberately absent. A member clicking unsubscribe at the foot of a
newsletter is refusing bulk mail; silencing their review requests, mentions and
worksheet deadlines on the same click would take away mail they need to do the
thing they volunteered for, without ever telling them. That row is switched off
on `/profile`, where the copy says what it stops, and nowhere else.

**The link refuses the ROW, not the email column, for the two subscription
rows.** `newsletter` and `events` both push now, so for each of those the route
writes `profile.notifications.push.<row> = false` beside the categories leaf. A
member who clicks the footer link, or Gmail's one-click List-Unsubscribe-Post
button, has said "stop sending me this"; leaving the push cell on would keep the
notification arriving from the very message they unsubscribed from, with nothing
on the page they landed on to suggest they had not finished.

`courses` is the deliberate exception, and its two cells are the reason. The
EMAIL cell gates cohort announcements; the PUSH cell gates an
admissions decision, a stage release and a course placement. Those are messages
about somebody's own application and their own place on a run, so a click at the
foot of a cohort email must not be read as a refusal of them. That cell is
switched off on `/profile` and nowhere else, exactly as `tasks` is.

The route also writes only the keys its token names. Rebuilding the whole
`categories` map and writing it back would collapse absent into `false` on every
row, which once `courses` joined the list meant an unsubscribe click on a
newsletter stamped a course-mail refusal the member never made. Adding the push
column keeps that rule: two dotted leaves per row, never a map.

**A programme's own link stops its optional mail, not its notices.** The
footer of a cohort announcement carries a token for that run's
`cohort:<runId>` list, and confirming it takes the person
off that list and writes no category at all. That stops the run's optional
mail; a notice about running the programme still reaches them while they hold a
place on it, because a notice is not read off the list (see "Who a notice to a
course run reaches"). So for a cohort list the two pages say exactly that: "We
won't send this programme's optional emails to this inbox. You'll still get
notices about running it while you hold a place on it." The confirmation page
drops the line about turning delivery back on from `/profile` or the homepage
for a cohort list, because neither can put somebody back on one; the line
under it, which says to email us, is the way back. Every other list keeps its
words.

## The notice lane

A notice reaches its audience on both channels whatever the grid says. Email goes
through `sendNotice` in `src/lib/email/notice.ts` (a wrapper over `sendEmail`,
never a second door); push goes through `sendNoticePush` in
`src/lib/push/noticeNotifications.ts`, the one push in the estate that reads no
preference at all.

### The surfaces

| Surface | Route | Who may send | Audience |
| --- | --- | --- | --- |
| `event-broadcast` | `POST /api/events/[id]/broadcast` | admins, SU-recognised committee, and the event's `authorUid` or anyone in its `collaboratorUids` while that account is still approved | the event's confirmed and waitlisted RSVP rows; the composer can untick waitlisted |
| `event-cancel` | `POST /api/events/[id]/cancel` | admins and `approveEvent` holders, matching publish and update | the same two statuses, always both |
| `course-group` | `POST /api/courses/groups/[groupId]/email` | admins, and a facilitator of THIS group while it is live | the group's active members |
| `course-room` | `POST /api/courses/groups/[groupId]/notice` | the same gate | the same members |
| `course-run` | `POST /api/courses/runs/[runId]/email` with `asNotice: true` | admins, and the run's `runFacilitatorUids` or `trackLeadUids` | everybody holding a place on the run whose group has gone out, whatever they unsubscribed from (see below) |
| `course-run` | `POST /api/courses/runs/[runId]/updates`, an update to everyone or to the facilitators | admins, the run's `trackLeadUids` and the lead of the programme that names the run | to everyone: everybody holding a place as above; to the facilitators: the facilitators of the run's live groups who still meet their bar, at their own addresses |
| `course-group` | `POST /api/courses/runs/[runId]/updates`, an update to one group | the same, and a facilitator of that group while it is live | everybody holding a place in that group whose group has gone out, whatever they unsubscribed from |
| `course-survey` | `POST /api/surveys/[surveyId]/send` and `.../remind` (docs/surveys.md) | admins | everybody holding a place on the survey's programme, each at their account's address with their own link; the reminder to those of them who have not answered |
| `course-follow-up` | the same two routes, for a follow-up survey at 6 or 12 months (docs/surveys.md) | admins | everybody whose row on the programme's before survey says yes to follow-ups now, each with their own link; the reminder to those of them who have not answered |
| `event-survey` | the same two routes, for the survey after an event (docs/surveys.md) | admins | the people who came to the event (each with an email: an account at its own address, a guest or a walk-in at the address they gave the event) or everybody whose sign-up was confirmed, less anybody who already answered with the QR code, each with their own link; the reminder to those it reached who have not answered |
| `course-check-in` | `POST /api/courses/groups/[groupId]/check-in`, opening the check-in at the end of a session (docs/surveys.md) | admins, and a facilitator of THIS group while it is live | the people the session's register marks present, late or left early, never the group's facilitators, each at their account's address with their own link; once, when it opens: somebody marked there later is reached with no email, and nobody is reminded |
| `course-week` | "Week N is open", 6 days before each of a group's sessions at 9am: the `courses-next-week-email` job, or, while that job is off, `POST /api/courses/groups/[groupId]/attendance/push` (finishing the register before it) and an admin's Resend on a finished register | the job; the group's facilitator or an admin pressing the register; an admin resending | everybody holding a place in the group whose group has gone out, whatever they unsubscribed from; once per group per session, by the group's claim |
| `course-week-reminder` | the reminders 3 days and 1 day before each of a group's sessions at 9am: the `courses-week-reminders` job | the job | each person holding a place in the group whose week (written as blocks, and published) is not done, listing what is left of it; one per person per reminder, by a scheduler marker; a week done, submitted or locked is never reminded about |
| `messages` | `POST /api/messages`, a message written in Messages that goes as a programme notice ([messages.md](messages.md)) | admins, a programme's lead and a group's facilitator, each to the tags the picker gives them | the people the writer chose, when every tag is about running a programme and the writer runs everybody it reaches: holding a place on a programme they run, facilitating or leading it, or in a group they facilitate; each at their account's own address (or a university address they verified), the writer too when they are in the tags. Otherwise the message goes by their settings, not as a notice |
| `event-invitation` | `POST /api/events/[id]/publish` and `POST /api/events/[id]/invitations` ("Invite the N new since"), for an event for chosen people that is part of a programme (see below) | publishing: admins and `approveEvent` holders; inviting more: those and the event's author and collaborators while they stand | the people holding a place on that programme among the people chosen, at their account's own address (else a university address it verified), whatever their events row says; never the event's author; email only |

**The week's emails** (`course-week` and `course-week-reminder`) are the
people running the programme telling the people on it what this week is and
what is left of their own work (privacy policy v15, "Reminders"), so they are
notices: the line above the words says why each reached them ("you are in
this course group"; "our records show this week's work isn't finished"),
there is no unsubscribe link, and nothing is pushed. They take no slot under
the caps below: each is sent by a claim, once per group per session or once
per person per reminder, and that claim is their bound. Their words are fixed
in `src/lib/courses/weekEmails/words.ts` and drawn by `src/emails/WeekEmail.tsx`;
"Week N is open" was next week's email, a grid send that honoured the courses
row and the run's list, until November 2026, and the weekly nudge beside it
is gone.

**An event for chosen people's invitation** (src/lib/events/invitations.ts)
decides its class person by person, through the picker's one resolver with
`policy: "per-person"`. When the event is part of a programme (only that
programme's lead or an admin may say so), the people holding a place on it
get the invitation as a notice on the `event-invitation` surface, because
the privacy policy says "If an event is part of a programme you are on, its
invitation is a programme email and reaches you whatever your settings".
Everybody else chosen, the programme's facilitators and lead among them, who
are not on it, gets it by their `events` row (grid, kind `event-invitation`,
with the events channel's unsubscribe link); somebody who has not said yes
is still invited, it is on their Home, and is not emailed. The choice is
resolved in the world of whoever chose the people, so the notice goes only
to the people that person runs under the programme: somebody who saved the
people without leading it reaches everybody by their row, and the editor's
count says so. The event's author is never emailed. No push leg on either class: the policy says email. The
caps are the lane's (3 an hour per presser and event, 10 a day per event),
claimed only by a press that sends a notice; a press is refused whole over
300 people or 200 messages, never trimmed.

An update (Q18) is kept on the site as well as emailed, and its email is a
notice for the reason the group email is one: the lead of a programme, an
admin or a group's facilitator is writing to the people they run it for. It
is email only, with no push leg, and it reuses the two course surfaces
rather than adding a third, so the marker says "you are on this course" or
"you are in this course group" as it does for the composers beside it. Its
"Send a test to me" is `course-test` to the presser alone, as theirs is.
Who reads an update on the site is decided apart from who is emailed it, in
`src/lib/courses/updates/readers.ts`.

### Who a notice to a course run reaches

Everybody holding a place on the run whose group has gone out, whatever they
unsubscribed from. Unsubscribing from a run's emails (the link at the foot of
an announcement) takes the person off the run's cohort list, and that stops the run's OPTIONAL mail and nothing else: a
notice is the people running the programme telling the people on it something
they need in order to take part, and it is not read off that list at all
(Zach, 31 October 2026). The unsubscribe page says so to whoever clicks (see
"The marketing unsubscribe link's reach").

`resolveNoticeAudience` in `src/lib/email/courseFacilitatorEmails.ts` is that
audience, and the run composer's notice lane, an update to everyone or to one
group, "Week N is open" and the reminders before a session all use it. It says
who in scope it left out and why (`dropped`: no account, no address, an inbox
shared with somebody already sent it, a suppressed address), which the
reminders stamp on each person's marker. It reads the run's ACTIVE `courseEnrolments` rather
than its cohort list, and holds them to everything that is not a preference,
exactly as the notice lane did when it went through the list:

- **The same people.** A learner's place (the only role a cohort row is ever
  written for: the enrol route, allocation publish and reinstate write one for
  a learner alone), whose placement Publish has told (`placementIsTold`).
  Somebody placed and not told yet hears about their group from Publish first;
  somebody who left is not active and is nobody to write to.
- **The same group narrowing**, for an update to one group, applied before the
  cap.
- **The same cap**: over 200 people in scope the send is refused whole, never
  trimmed.
- **The same address.** The address on their cohort row when they have one, on
  the list or not, because that is where the run has always written to them;
  with no row, their account's own address by the group email route's rule.
- **Deduped by address, with suppression applied.**

The optional mail keeps `resolveCohortAudience`, the cohort list intersected
with the active places, so an unsubscribe still stops it: the announcement
lane.

The event broadcast gate is wider than it was, on purpose: until this lane landed
the committee member who organised an event could not mail its attendees unless
the SU had separately recognised them. Being named on an event is a
responsibility rather than a standing credential, so the route asks a second
question of the person holding it: a pending or rejected account fails the
approved-account test even while its name is still on the event. An organiser
demoted from committee back to member passes it, and keeps the lane for the
events they authored: they are still an approved member and still the person
responsible for that event.

The post-publish change notice `EventEditor` sends after an edit to a published
event goes through the broadcast route, over the diff `update/route.ts` returns.
It reaches the waiting list as well as the people coming, and says so: the tick
that opens it names both, from the event's own counters, and its Send button
names the number the route counts itself when asked with `{ preview: true }`,
from the same audience the send uses. A preview passes the same gate, needs no
subject or message, writes nothing, takes no slot under the caps and sends
nothing.

### Counts, never addresses

RSVP addresses are PII that `firestore.rules` restricts to SU-recognised
committee and admins, and the broadcast gate now admits people who are neither.
So no caller supplies addresses or uids: every route derives its audience server
side and answers with counts, exactly as the course lanes already did. The
console lines carry an RSVP row id or a uid, never an address.

One `sendNotice` per address, a single string as `to`, no Cc and no Bcc. Batching
an event's attendees into one envelope would disclose every attendee's address to
every other attendee.

### The caps

`reserveNoticeSlots` in `src/lib/email/noticeCaps.ts` claims every window in ONE
transaction, so a refusal on either leaves both counters untouched, and the slot
is spent when the send is ATTEMPTED. A request that dies half way through a
forty-person dispatch has already delivered part of the mail, and its retry has
to be rationed like any other send.

| Lane | Hourly, per (sender, audience) | Daily, per audience | Recipient ceiling |
| --- | --- | --- | --- |
| event broadcast | 3 | 10 | 300, refused |
| event cancel | **none** | 10, the broadcast's own counter | 300, refused |
| course group email | 3 | 10 | 100 members, refused |
| course room notice | **none** | 10 | 100 members, refused |
| course run notice | 3 | 10 | 200 recipients, refused |
| course update | 3, per (writer, audience) | 10, its own counter | 200 recipients, refused |
| course check-in | **none** | 2, per group, its own counter | 40 people, refused |
| Messages | 3, per (writer, audience) | 10, per audience, its own counter | 300 emails, refused |
| event invitation | 3, per (presser, event) | 10, per event | 300 people and 200 messages, refused |

**Messages claims both windows for every send**, a message by their settings
as much as a notice: an audience is the choice of tags, spelled in one order
and hashed, so the same tags chosen in another order are the same audience.
Its ceiling counts emails rather than people, because a message by their
settings can go to both of a member's addresses.

**The check-in omits the hourly window** because it is claimed once per
session by the check-in itself (two presses make one), and its daily counter
bounds a group's evening of two sessions.

**Two lanes omit the hourly window, for the same reason.** The room notice has to
survive the evening where the room changes twice and the mode flips once, which
is what its 10-a-day per-group counter bounds instead. The cancellation shares
the broadcast's hourly key, so keeping it would mean an organiser who sent three
change notices during a chaotic afternoon is refused the one message nobody can
be left without: the most time-critical send in the lane rationed by the most
routine one. A cancellation happens once per event anyway, enforced by the
already-cancelled check rather than by a throttle.

The cancellation claims its slot BEFORE the status write, so a refused request
changes nothing at all. The alternative answer is "the event is cancelled and
nobody was told".

A ceiling is a **refusal, never a truncation**. A partial send is the worst
outcome available because it looks successful: an arbitrary 300 get the mail, the
report says 300 sent and none skipped, and the retry re-mails the same 300.

### The marker, the receipt, and what still applies

The email carries a visible marker above the body, built by `sendNotice` from the
surface and rendered by `src/emails/NoticeMarker.tsx`: an eyebrow reading "Sent
as an important notice" and one sentence saying why it reached them, that their
settings did not stop it, and that it is never marketing. A template chooses
where it sits; it never chooses what it says, which is why callers pass a render
function rather than a finished element.

There is no unsubscribe footer and no `List-Unsubscribe` header, and
`listUnsubscribe` is not in `sendNotice`'s signature. Offering to switch off
something that cannot be switched off is the one dishonest thing this lane could
ship.

The `emailSends` receipt carries `kind: "notice"` plus `surface`, one of the
strings above (and `survey-blanks`, docs/surveys.md), so the deliverability tab
can answer "how much un-switch-off-able mail went out, and from where" without
reading subject lines. Both are set by
`sendNotice` alone. The older `course-notice` kind stays defined for the room
notice's historical rows rather than being renamed: a year of them answers "how
much un-opt-out-able mail did this group send", and rewriting them would break
that question. New room notices carry `kind: "notice"` with
`surface: "course-room"` like every other lane.

Still gating a notice: suppression, a device actually being subscribed (a member
with no device gets the email alone), VAPID configuration, and a uid (a guest who
RSVP'd with an address and no account gets email only). A test send is never a
notice: it reaches its own sender, so nobody's preference is bypassed and the
marker's sentence would be false about it.

## The "new event published" announcement

`POST /api/events/[id]/publish` is the one moment the `events` row sends
anything. `src/lib/email/eventAnnouncement.ts` owns both audiences and runs them
concurrently.

- **Email** goes to the `subscriptions` junction, every confirmed-and-subscribed
  row on channel `events`, hydrated per member through `addressesForSend`, which
  applies the events cell and the per-address routing in one answer. The junction
  row IS the opt-in.
- **Push** goes to every account with a device whose `push.events` cell is on,
  through the shared `sendPushToRowAudience` the newsletter send also uses
  (`src/lib/push/rowAudience.ts`): enumerated from `pushSubscriptions`, deduped
  by owner. A different question, asked separately: a member can hold the email
  row and refuse the notification.
- An event with `visibility: "members"` drops GUEST rows (an address with no
  account) and counts them. The push audience is accounts by construction.
- **Who an event is for decides whether it is announced at all**
  (`announces` in `src/lib/events/reach.ts`). A listed event announces unless
  its organiser switched Announce off; only a stored `announce: false` is off,
  so every event made before the switch announces as it always did. An event
  that does not announce claims nothing (`announcedAt` stays absent) and
  sends nothing. An event for chosen people never announces, whatever is
  stored: its people are invited instead, above. The job refuses a queued
  event that has stopped announcing, terminally, and releases nothing.

**The two paths, and the switch that chooses between them.** The send used to
run only inside the publish request, against App Hosting's 60s timeout, which
is where its three ceilings come from and what this file called "the known
limit". It now has a second path, and `POST /api/events/[id]/publish` reads the
`event-announcements` scheduler job's switch ONCE, before its transaction, to
decide which one this publish takes.

| | Inline (switch off) | Queued (switch on) |
| --- | --- | --- |
| Where the send runs | in the publish request | on a scheduler tick |
| Ceilings | 500 junction rows, 200 messages, 500 device rows | 5000 junction rows, 5000 device rows, no message ceiling (the list is delivered over as many ticks as it takes) |
| Exactly once | the `announcedAt` claim | the claim, plus one marker per recipient per leg |
| What the response says | counts, or a refusal | `announcementQueued: true` |
| Where the outcome is read | the publish response | the event document, live |

**Switch off is the shipped default.** The job
registers with `enabledByDefault: false`, so with nothing stored the route
behaves exactly as it always has and nothing changes for anybody. Only switch it
on where the scheduler tick is actually armed: on a backend with no scheduler
secret the tick does not run, and turning the job on there would queue
announcements nobody ever delivers. The switch is on the Site status page, under
Jobs, as "Queued event announcements".

**Recovering an event queued and then stranded.** Switching the job OFF does not
un-queue what is already in the queue: an event published while it was on sits
at `announcementState: "queued"` and the editor keeps saying the next run will
take it. Nothing drains it but the job, on purpose, because the alternative is a
second sender nobody registered. Turning the job back on lets the next tick
deliver it.

**Once per event, under a claim, on both paths.** `announcedAt` is stamped on
the event document inside the transaction that publishes it, so two racing
publishes cannot both come out holding the announcement, and a later republish
is not news twice. On the queued path that same transaction also writes
`announcementState: "queued"` and `announcementQueuedAt`, so the hand-off cannot
survive a claim that did not. On the inline path the claim is made before the
send: an announcement that fails after the stamp is not retried, which is the
better failure, because the other way round mails the whole list twice.

**Exactly once per recipient, on the queued path, through markers.** One
`schedulerMarkers` document per recipient per leg,
`evannounce__{eventId}__{email|push}__{recipientKey}`, claimed before the send
and stamped after it. That is what makes the job resumable with no cursor of its
own: a tick that runs out of budget half way down the list leaves what it sent
stamped, and the next tick's claim on those fails with ALREADY_EXISTS. The
recipient key is `u{uid}` for a member and `g{hash}` for a guest row, never an
address: a marker is kept for 180 days in a collection whose whole purpose is to
say "this was sent", which is no place to accumulate a mailing list.

A message that goes out but whose marker will not take the stamp is the one
failure that would become a duplicate, so the stamp is retried once and the
marker is then settled terminally as `sent-unstamped` rather than left for the
re-claim rule (`stampSentOrSettle` in `src/lib/scheduler/markers.ts`).

**A tick reads the event's markers in bulk before it walks the list**, in one
equality-only query on `family` and `eventId`, and skips the recipients whose
marker is already settled without asking `claim()` about them. That is what
makes a long list finish rather than stall: every tick starts at the top of the
audience, and a settled recipient put through `claim()` costs a failed
`.create()` plus a transaction read for no progress at all, so past roughly 900
of them a tick spent its whole budget re-checking the same prefix and never
reached the tail. A marker that is claimed but UNSTAMPED is deliberately not in
the skip set: the in-flight rule and the re-claim window are `claim()`'s to
apply, and skipping those would be skipping the retry.

It costs one document read per marker per tick. At the 5000-row ceiling, drained
200 units at a time, that is 25 ticks over up to 10000 markers, on the order of
a hundred thousand reads for one announcement. That is the price of resuming
with no cursor, and a cursor is the fix if it ever matters.

**Nothing claims the EVENT, and three separate things make the overlap safe.**
Two ticks may both pick up one queued event and walk its audience, which the
tick's own re-arm makes ordinary. `"sending"` is a progress note, not a lock.
What holds instead:

- **Sends** are exactly-once, through the per-recipient markers above.
- **Counts** are increments. Each tick writes its own deltas with
  `FieldValue.increment` and never the accumulated totals, so a tick that read
  the totals before another tick committed cannot write that work away. The one
  absolute is `audienceSkipped`, which is a snapshot of the latest audience
  resolution rather than a running total.
- **State transitions are transactional.** `done` and `refused`, and the release
  of `announcedAt` with them, are decided inside a transaction that re-reads the
  document and writes only while the announcement is still pending.

**An unsettled unit keeps the event in the queue.** The scan finds `queued` and
`sending` and nothing else, so an event written `done` is one no later tick will
ever look at again. A send that failed, a claim another tick is holding in
flight, or anything that threw therefore leaves the event `"sending"` and
reports `hasMore`; the ordinary marker rules take it from there, and a marker
the claim helper gives up on after `maxAttempts` is settled as a failure, which
is what lets an event whose worst recipient cannot be reached still finish.

**The state fields, server-written only.** `announcementState` (`queued` |
`sending` | `done` | `refused`, absent on an event announced inline or never
announced), `announcementQueuedAt`, `announcementStartedAt`, and
`announcementResult` (`{ sent, skipped, audienceSkipped, suppressed, failed,
pushed, refusal, pushRefusal, released, finishedAt }`). The totals are persisted
at the end of EVERY tick that works on the event, so an announcement that took
four ticks still reports what all four did.

Three of those fields exist for a reason worth stating. `failed` counts
RECIPIENTS the announcement gave up on, once each, at the moment their attempt
budget runs out with nothing delivered; the attempts before it are retries, and
counting them made one unreachable address read as four unreached members. It is
a different unit from `sent`, which counts messages, and a partial delivery
belongs on the `sent` side: a member whose university address bounced while
their Gmail went through was told, so they count in `sent` and not in `failed`,
and the bounce shows up in the log and then on the suppression list and the
deliverability tab, which is where a per-address failure belongs. `skipped` counts
recipients the job CLAIMED and consciously did not reach and is incremented;
`audienceSkipped` counts the rows dropped when the audience was resolved (a
members-only guest row, an account that is gone) and is a SNAPSHOT, because the
audience is re-resolved on every tick and an incremented version would count the
same drops once per tick. `released` records whether the claim was handed back,
because the two refusals that reach nobody are not distinguishable by their
counts and only one of them can be retried by republishing. `firestore.rules`
pins all four against client writes: the job scans for `queued` and `sending`,
so a drafter who could write that state onto their own unpublished draft would
have the platform announce it to everybody with no approver involved.

**A pure refusal hands the claim back.** If the announcement refuses
deterministically before dispatching anything and nothing was sent, failed or
pushed, `announcedAt` is cleared and the fact is reported, because otherwise the
claim is spent and no supported action gets the announcement out. The queued
path applies the same rule, judged on the ACCUMULATED totals: an event that
mailed forty people on Monday and hit a refusal on Tuesday keeps its claim. A
throw is not released on either path: the dispatcher can reject after other
workers have delivered.

**The stale rule is about the EVENT, not the queue.** A queued announcement that
is a day late is still worth sending, because an event page that went live stays
news until the event happens; so there is no lateness bound on the queue at all.
What is refused is an announcement for an event whose `startAt` has passed, and
that refusal RELEASES NOTHING, because there is no later moment at which
announcing a past event becomes right. The job's `maxLateHours` (72) is the
fallback for an event with no start time at all, which nothing else could rule
on.

**What the publisher sees.** Inline, the publish response carries the counts or
the refusal and `EventEditor` renders them. Queued, the response can only say
"Published. The announcement is queued and goes out with the next scheduler run,
usually within fifteen minutes", and everything after that is read off the event
document by the listener the editor already holds: queued (naming the job, and
saying "while that job is switched on"), in progress with the running totals,
announced with the counts, reached nobody, or refused with the reason and, from
the stored `released` flag, whether the claim came back. The Publish confirm says which path it will take,
from a flag the manage page reads server-side (`config/scheduler` is closed to
every client), and how many it reaches: `GET /api/events/[id]/publish`, behind
the press's own gate, counts the people the email would go to and the accounts
a notification would go to (`announcementReach`, with the send's own audience
functions and the path's own email ceilings), counts only. A leg the send would
refuse, or could not read, has no number, and then the confirm says what it
said before there was one. The devices are counted under the request path's
500 on both paths, so on the queued path a device list between 500 and 5000
reads as no number although the job would notify it: the count can leave a
notification out, and never claims one.

Publishing itself never fails because the announcement did, on either path.
Raising the inline path's numbers means redoing the wall-clock arithmetic in
`src/lib/email/dispatch.ts`; the queued path's two ceilings bound unpaged READS
rather than sends, and paging the junction read is the fix if one is ever
approached. Both reads are made again on every tick that touches an event,
which is the price of holding no cursor: the tick's wall clock is checked
straight after each of them, and the device scan is not made until the email leg
has finished what it is going to do that tick, so a tick spent on email does not
also pay for a 5000-row read it will not use.

## The profile grid

One grid on `/profile` (`src/features/profile/ProfileForm.tsx`, with the pure
rules in `src/features/profile/notificationGrid.ts`), five rows and two columns.
The four category rows come from `ALL_CATEGORIES` rather than being restated, so
a fifth row cannot appear in the model and be missing from the page.

- **Column masters.** Each column header carries a switch that sets every cell in
  that column at once. A master is a convenience over the cells, never a third
  stored value: it writes the same per-row booleans, and it reads as on only when
  every cell under it is on. Not "some", and not a tri-state: "on when any is on"
  would let a member switch the master off, back on, and find rows enabled they
  never chose.
- **The two subscription rows expand per address** when the member has two
  verified addresses, one cell per (address, row), each labelled
  "`<row>` to `<address>`". `courses` and `tasks` are plain switches.
- **The push column is disabled whenever this browser's push state is not "on"**,
  with a hint per state (`unsupported`, `needs-install`, `denied`, `off`, and the
  probe not yet finished), each ending with the load-bearing half: a setting here
  still applies to your other devices. The switches still SHOW the stored value in
  every state, because the answer belongs to the account and the member may well
  be setting it for the phone in their pocket. Only the writing is disabled.
- **The "Important notices" row is locked**: both cells drawn on, disabled,
  writing nothing, with copy saying the people running an event you signed up
  for, or a programme you hold a place on, can send you messages about running
  it, and they reach you by email and notification whichever switches you set.
  A member who has switched everything else off, or unsubscribed from a
  programme's emails, should learn that while they are making the choice, not
  the first time somebody sends one.
- **Two write paths on one page.** The email cells are saved by the form's Save
  button, which writes the WHOLE `profile.notifications` map (then the
  un-awaited `POST /api/subscriptions/sync`); the push cells save themselves on
  toggle through a LEAF write at `profile.notifications.push`. Flipping a
  notification must not write somebody's half-typed preferred name.
- **The Save button carries the member's own details too**, in the same
  write: the name, the university email, and the degree and the graduation,
  each of those two only when it changed. A change of either from one answer
  to another also adds one entry to `studyChanges` on the member's document,
  holding what the answer was and the server's time, so an admin can read the
  earlier answer on that person's page (`/admin/members/[uid]`, and nowhere
  else). The users rule refuses a member's own write that changes either
  field without its entry, or that removes or rewrites an earlier one, so
  that part of the write is built in one function,
  `src/features/profile/studyChange.ts`, which the rules suite runs
  (`scripts/rules-tests/tests/users-profile-self-edit.test.mjs`). The push
  leaf write names neither field and is untouched by any of this. An admin's
  edit of somebody's profile is not the member's change and adds no entry.
- **The dirty flag** is what makes those two coexist. A push leaf write changes
  `users/{uid}`, the form's own snapshot listener fires with it, and refilling
  every field on each snapshot would throw away an unsaved edit. A one-shot
  hydrated latch would fix that and break something else: the form would never
  see a later write from `/api/unsubscribe`, a second tab or an admin route, and
  would revert it on the next Save. So the refill is skipped only while an edit
  is in flight, and every control the Save button owns calls `markDirty`.
- **A narrow grid moves the push note.** The three columns fit everywhere the
  wide layout is drawn, but between a 961px and a 1169px window with the
  sidebar open the Push track is 133 to 186px, and a 12px sentence of 170
  characters wraps there into two or three words a line, with the row growing
  to 240px to hold it. So when the GRID is under 48rem wide (the grid, not the
  window: the sidebar collapses per user, and a media query would move the
  note in the wide case for nothing) the note leaves the Push cell, which
  keeps only its switch, and is drawn under the row description with a "Push"
  eyebrow. One sentence is on screen at a time: the same container query hides
  the copy in the cell, and the stacked layout below 60rem puts it back there.

The per-device Enable control stays on the push card below
(`src/features/pwa/PushSettings.tsx`), which now holds nothing but this
hardware's controls. The card and the column read one state machine
(`src/features/pwa/pushDevice.tsx`) so they cannot disagree.

## Who a copy of the site may email

The same code runs as the live site, as staging, on a laptop and inside the
test harness, and all of them can reach the real sender. `sendEmail()` asks
`src/lib/email/audience.ts` who this copy may write to, for every message,
after the suppression list and before anything is rendered.

| Where the code is running | Who receives |
| --- | --- |
| The live site: `EMAIL_AUDIENCE=everyone` AND the production project | Everyone |
| The mail server is this machine (the harness's catcher) | Everything, because nothing can leave it |
| `EMAIL_AUDIENCE` lists addresses | Those addresses |
| The setting is missing, empty or unreadable | Nobody |

Five things a maintainer has to keep:

- **The harness's own addresses are no exception to the last two rows.** An
  address under `e2e.invalid` cannot receive mail, so a real mail server has
  nothing to do with a message to one but bounce it. It is handed over only
  where everything is: a mail server on this machine. A suite that executes
  the real send path sets its mail server to a loopback address, which is
  what its catcher is.
- **The setting is added on each backend itself, never in `apphosting.yaml`.**
  Both backends read that file, so a value written there is a value staging
  inherits. `tests/email-audience.test.mjs` fails if the file declares it.
- **The live backend needs `EMAIL_AUDIENCE=everyone` before this code reaches
  it.** Without the setting the live site holds its own mail. The Site status
  page says so in red, and every held send logs an error line.
- **`NODE_ENV` is never the test.** Staging builds in production mode.
- **A held recipient is not a failure.** The send resolves, the caller carries
  on exactly as it would on the live site, and an `emailSends` row at status
  `held` records what would have gone. That is what lets a large send be
  rehearsed on staging and counted afterwards. `SendResult.held` lists the
  addresses for a caller that wants to say so.

To see the answer without sending anything, open Site status or the
Deliverability tab: both carry a panel that reads the same rule back.

Not covered, on purpose: the sign-in provider's own verification and
password-reset mail (sent by the provider to the address the person typed), and
web push (it reaches only devices that subscribed on that copy of the site).

## Which address mail comes from

There are two, so somebody reading their inbox can tell the newsletter from
everything else the site sends, and filter either.

| What is sent | Comes from |
| --- | --- |
| An issue of the newsletter, and its test send | `NEWSLETTER_FROM_EMAIL` (newsletter@naisi.uk) |
| Everything else: confirmations, reminders, and every event, course, task and admissions message | `SMTP_FROM_EMAIL` (notifications@naisi.uk) |

Both are set in `apphosting.yaml`, which both backends read. `sendEmail()`
picks between them (`fromAddressFor` in `src/lib/email/send.ts`): a call that
passes `sender: "newsletter"` comes from the newsletter's address, and every
other call from the default. With `NEWSLETTER_FROM_EMAIL` unset or blank the
newsletter comes from `SMTP_FROM_EMAIL` too, so a copy of the site that has
not set it (a laptop, the test harness) sends exactly as it did before. Both
carry the same display name (`SMTP_FROM_NAME`, or a call's own `fromName`),
and replies to either go to `EMAIL_DEFAULT_REPLY_TO`.

The rule a maintainer keeps: only the newsletter's own two routes
(`POST /api/newsletter/[id]/send` and its test send) pass
`sender: "newsletter"`, and nothing else in `src` reads
`NEWSLETTER_FROM_EMAIL` or names either address. `tests/email-senders.test.mjs`
walks the tree for it, which is why every call to `sendEmail` writes its
arguments out where it is made: a call handed a variable or a spread is one
the walk cannot read, and the guard fails it rather than guessing. The course
announcement renders the newsletter's template and still comes from the
default address, because the template is how a message looks, not who sent it.

## Adding a sender

1. **Register it** in `tests/notification-classification.test.mjs` with a class,
   a row if it is grid, a written reason, and `calls` (how many times that file
   calls that symbol). The guard fails on an unregistered call site, on an entry
   whose file or symbol has gone, and on a call count that has moved, so a second
   send dropped into an already-registered file is the same conversation as a new
   one. If the wrapper you call is not in `TRACKED`, add it there: section 7
   checks that list against the tree in both directions.
2. **A grid entry's file must reference a marker**: `wantsCategory(`,
   `addressesForSend(`, `wantsEmailForProfile(`, `wantsPushFor(` or
   `hasOptedOutOfCourseAnnouncements(`. If the row is consulted somewhere else,
   name that file in `via` and the assertion runs against it, so the delegation is
   written down rather than assumed. Each marker's own file is itself checked for
   reaching the one table of defaults, so a sixth way of asking a row cannot
   appear that resolves it by hand.
3. **A notice entry's file must reach a door** (`sendNotice(` or
   `sendNoticePush(`), and a file whose entries are ALL notice must reference no
   grid marker at all. It is a per-file rule because two files genuinely carry
   both lanes.
4. **A file whose entries are all transactional must reference neither.**
5. **Leave `sender` out.** A new send comes from `SMTP_FROM_EMAIL` like every
   other message; only an issue of the newsletter passes `sender: "newsletter"`
   (see "Which address mail comes from").
6. **A send to people somebody chose takes them from the picker.** Resolve the
   writer's selection with `resolveAudience` ([messages.md](messages.md)), the
   call that counted it, so the number on the button is the number sent;
   `tests/send-recipient-scope.test.mjs` fails a sending file that imports the
   picker and goes round it.

## Deliberately not built

- **A members-only announcement to members who are not on the events list.** The
  announcement's audience is the `subscriptions` junction, so a member who never
  opted in hears nothing, including about a members-only event. Reaching them
  would mean a second audience with a second consent story.
- **A re-announce path.** `announcedAt` is cleared only on a pure refusal.
  There is no "announce this again" button, because every version of one is a way
  to mail the whole list twice by accident.
