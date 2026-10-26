# Courses platform: operations runbook

Operational reference for the parts of the courses platform that live outside
the codebase: secrets, the external scheduler, and the order things have to be
deployed in.

> Status: this file starts with the scheduler tick, which is the first piece of
> courses V3 infrastructure that needs work in the Google Cloud console, and
> now also carries the draft course and run reads, the membership cutover, the
> SU list import and the logged export.

> continues with FINISHING A REGISTER and next week's email, which goes when
> the register is pushed or, once its job is switched on, on a schedule, and
> the membership cutover, import and export. Later PRs extend it with the
> rules-and-indexes deploy order.

---

## The scheduler tick

### What it is

One endpoint, `POST /api/scheduler/tick`, called by an external scheduler every
15 minutes. It runs the registered jobs in
[`src/lib/scheduler/registry.ts`](../src/lib/scheduler/registry.ts) in order,
inside a single time budget.

Nothing about it is a queue. Every job works out what is due from live data at
tick time, so a tick that never fires costs latency and never work: the next one
rediscovers the same due work. What stops a rediscovered send going out twice is
a **marker** in `schedulerMarkers`, written before the send and stamped after it
(see [`src/lib/firestore/schedulerMarkers.ts`](../src/lib/firestore/schedulerMarkers.ts)).

There is no cron inside App Hosting. Cloud Run scales to zero and holds no
timers, so the schedule has to come from outside the container.

### Required environment

| Variable | Availability | Where it comes from |
| --- | --- | --- |
| `SCHEDULER_SECRET` | `RUNTIME` only | Secret Manager, per project |
| `NEXT_PUBLIC_APP_URL` | `BUILD, RUNTIME` | already in `apphosting.yaml` |

The `apphosting.yaml` entry must read exactly:

```yaml
  - variable: SCHEDULER_SECRET
    secret: SCHEDULER_SECRET
    availability: [RUNTIME]
```

`RUNTIME` and no `NEXT_PUBLIC_` prefix, both load-bearing. Only `NEXT_PUBLIC_`
variables are inlined into the client bundle at build time, and a bearer token
that reaches a browser is not a bearer token. `availability` controls the
**server**: `BUILD` means present during `next build`, `RUNTIME` means present
in the running container. A `RUNTIME`-only variable is not reachable by anyone
loading the site.

Note that the `availability` restriction exists only in `apphosting.yaml`. A
variable added through the Firebase console UI is always `[BUILD, RUNTIME]`, so
**do not add `SCHEDULER_SECRET` in the console**, which would build it into
something it has no business being in. It belongs in the yaml, as a secret
reference.

`NEXT_PUBLIC_APP_URL` is needed because the tick re-arms itself by calling its
own public URL. The host header is not usable: on App Hosting a server component
sees the internal Cloud Run revision URL, not the public domain.

### One-time setup, per project

Do this once for each project that runs the site.

```sh
# 1. Mint a secret. Any long random string; 32 bytes of base64 is plenty.
openssl rand -base64 32

# 2. Store it. The CLI prompts for the value.
firebase apphosting:secrets:set SCHEDULER_SECRET --project <default|dev>

# 3. Let the backend read it.
firebase apphosting:secrets:grantaccess SCHEDULER_SECRET \
  --backend <BACKEND_ID> --project <default|dev>
```

Then create the Cloud Scheduler job in the same GCP project:

```sh
gcloud scheduler jobs create http <JOB_NAME> \
  --project=<PROJECT_ID> \
  --location=<REGION> \
  --schedule="*/15 * * * *" \
  --time-zone="Etc/UTC" \
  --uri="https://<public-domain>/api/scheduler/tick" \
  --http-method=POST \
  --headers="X-Scheduler-Key=<the secret>,Content-Type=application/json" \
  --message-body='{"depth":0}' \
  --attempt-deadline=60s
```

`Etc/UTC` on purpose: the receipt bucket is floored in UTC, so a London-local
schedule would produce two identical buckets on the October clock change and
skip an hour in March.

Create the prod job **paused** and unpause it as the last step of cutover.

Cutover order, because two of these are switches rather than deploys:

1. deploy, with `admissions-deadline-reminders` still dark (it ships that way);
2. unpause the Cloud Scheduler job and watch heartbeat receipts for 24 hours;
3. prove the reminders job on dev with **Run now** on a round with a due date;
4. only then turn **Application deadline reminders** on from Site status, on the
   environment you mean to send from.

### Verifying it

Everything below is answerable from **/admin/site-status**, which is the point
of the panel. If you find yourself in Cloud Logging to answer one of these, the
panel has a gap worth filling.

1. Is the scheduler running? Recent ticks shows a row every 15 minutes.
2. Is a job on? The Jobs list has a switch each, plus one global switch.
3. Did anything throw? A job that threw shows its error inline.
4. Is a send stuck? Stuck sends lists markers that gave up, each with a Retry.

**Before any job that mails a human is registered, watch heartbeat receipts
accumulate on dev for 24 hours.** The heartbeat job exists for exactly this: it
sends nothing and proves the whole path (secret, receipt, config, budget, panel)
end to end.

A quick manual check with the secret to hand:

```sh
curl -i -X POST https://<public-domain>/api/scheduler/tick \
  -H "X-Scheduler-Key: <the secret>" \
  -H "content-type: application/json" \
  -d '{"depth":0}'
```

A wrong or missing key answers **404**, not 401. That is deliberate: a 401
confirms both that the path exists and that the guard is a key check. If you get
a 404 with a key you believe is right, check the secret is granted to that
backend and that the rollout since granting it has finished.

#### What a failed tick looks like, and what recovers it

Not the scheduler's own retry. Cloud Scheduler retries a non-2xx, but the retry
arrives inside the same 15-minute bucket, resolves to the same receipt id, hits
ALREADY_EXISTS and returns `{"deduped": true}` having done nothing. That is the
dedupe working as designed: it cannot tell a retry of a failed delivery from a
duplicate of a successful one, and of the two mistakes, doing the work twice is
the worse one.

**What recovers a failed tick is the next delivery, 15 minutes later.** No job
loses work when one tick dies, because no job has a queue: each derives what is
due from live data at tick time, and the markers stop anything already done
being done again.

On the panel, a tick that died mid-list is a **Recent ticks row with no finish
time** (`finishedAt` is null, so the duration column has nothing to show). The
receipt is opened before the first job runs precisely so that this row exists at
all. One of them is a container that went away; a run of them in consecutive
buckets is a job wedging the tick every time, and the job list on that row names
the last job that reported.

### Kill switches

`config/scheduler` holds `{ enabled, jobs: { <jobId>: { enabled, lastRunAt,
lastError } } }`. **Missing means enabled** for the site-wide switch, and for a
job it means **that job's own default**, which is enabled for everything except
a job that mails people. A fresh project therefore runs, and a job registered by
a later PR is never silently off on an environment nobody has touched the panel
on.

The exception is declared in the registry as `enabledByDefault: false` and is
set on every job that emails people: `admissions-deadline-reminders`,
`admissions-stage-release`, `application-invitation-reminders`,
`courses-next-week-email`, `courses-register-reminders`,
`worksheet-due-reminders` and `event-announcements`. A job that emails a live
audience must not arm itself the moment it deploys, so each ships dark and the
owner switches it on from the panel, per environment. The panel says so on the
job's row.

`event-announcements` carries one extra condition, and so does
`courses-next-week-email`: they are the two jobs whose switch changes what a
REQUEST does. `POST /api/events/[id]/publish` reads the first to decide whether
to send the new-event announcement inline or queue it (see
docs/notifications.md). `POST /api/courses/groups/[groupId]/attendance/push`
reads the second to decide whether finishing a register still sends the
group's next-week email (see "Finishing a register" below). So each may only be
armed where the tick is actually armed. On a backend with a `SCHEDULER_SECRET`
and nothing calling it, turning either on would take the send off the request
and leave it with a job nobody runs.
`courses-unmarked-registers` is NOT on that list (it raises tasks rather than
mail), so it must be switched off on the panel before a deploy reaches an
environment with real facilitators and re-armed only once dev has shown it
working.

A stored row only counts as somebody having touched the switch when it actually
carries an `enabled` boolean: **Run now** writes `lastRunAt` onto a job's row
without one, and that must not arm a job that ships dark.

- Global off: ticks still arrive and still leave a receipt (so the panel does
  not go blank and read as "the scheduler has died"), but no job runs.
- Per job off: that job is skipped and says so on its receipt row.

Both switches live on the panel. Turning the global switch off also blocks
**Run now**, on the grounds that a site-wide off is usually off because
something is actively going wrong. **Run now** deliberately ignores a job's OWN
switch (the admin is looking straight at that switch when they press it), so it
is the lane for proving a dark job on dev without arming it.

### Markers, and what to do about a stuck one

A job claims a marker with `.create()` **before** the send and stamps `sentAt`
**after** it. Claim first is the right order: the reverse turns any crash into a
duplicate send, and duplicates are the failure people complain about publicly.
The cost of this order is that a crash between claim and stamp leaves work
undone, which is why there is a recovery rule:

- an unsent marker whose claim is older than the job's `reclaimAfterMinutes` is
  re-claimed by a later tick;
- after three claims with no stamp it is stamped `failedAt` and appears under
  **Stuck sends**;
- **Retry** clears it, and the next tick works the send out from scratch.

Work that is simply too late (the tick was down for days) is stamped
`skippedReason: "stale"` rather than sent, per the job's `maxLateHours`. A
"closes in 7 days" email that lands nine days after the deadline is worse than
no email.

**Not every gap is a stuck marker.** Work that was never reached leaves no
marker at all, so it cannot appear here: the unmarked-register scan considers
at most 200 live runs and at most 50 groups per run, and anything past either
cap is never chased and never recorded. Both caps are far above the shapes the
platform plans, and hitting one is logged (`candidate run cap reached` and
`group cap reached` in Cloud Logging, filtered on
`scheduler:courses-unmarked-registers`), which is the only place it shows.

Marker families and where they live:

| Family | Id | Written by |
| --- | --- | --- |
| `remind__` | `{roundId}__{uid}__{dueAtKey}` | admissions deadline reminders |
| `stagerel__` | `{roundId}__{stageId}__{uid}` | application stage release notices (one per recipient; the `{roundId}__{stageId}` form, with no uid, is the stale verdict for a whole stage) |
| `unmarked__` | `{groupId}__{sessionKey}` | unmarked-register follow-ups |
| `regremind__` | `{groupId}__{sessionKey}__{uid}` | the one reminder each facilitator gets about an unfinished register |
| `breakret__` | `{runId}__{groupId}__{slotStartKey}` | back-after-the-break notices |
| `wsremind__` | `{circulationId}__{uid}__{dueKey}` | worksheet due-soon reminders (not a courses job, but it shares this collection, so an operator sweeping markers meets it here) |
| `evannounce__` | `{eventId}__{email\|push}__{recipientKey}` | queued new-event announcements (not a courses job either; one marker per recipient per leg, and `recipientKey` is `u{uid}` for a member or `g{hash}` for a guest row, never an address) |

House rule: **scheduler-tick markers live in `schedulerMarkers`; human-triggered
course send markers stay in `courseNudges`.** The facilitator's attendance push
is a human action and keeps its `gnudge__` marker where it is.

One tick job claims a `courseNudges` marker, on purpose: `courses-next-week-email`
claims the SAME `gnudge__{runId}__{groupId}__{slotStartKey}` document the push
claims, because the two are two lanes of one email and the claim that keeps
them from both sending has to be one document. The marker says which lane
took it (`via: "push"` with `sentByUid`, or `via: "schedule"` with
`sentByJob`). It never reaches **Stuck sends**: a scheduled send that failed
part way is recovered the way a push's is, by an admin's **Resend** on the
register (see "Finishing a register").

### The registered jobs

`JOBS` in [`src/lib/scheduler/registry.ts`](../src/lib/scheduler/registry.ts) is
ordered **alphabetically by job id**. Not an aesthetic: that array is the one
line every job-adding PR touches, so alphabetical gives each new entry exactly
one correct position and the parallel merges stop arguing. Nothing depends on
the order, because the budget is checked before each job runs and a job the
tick could not reach is reported as skipped for budget on its receipt.

#### `admissions-deadline-reminders`

Emails everybody still holding an **unsubmitted draft** on an open admission
round, on the dates that round's reminder schedule works out from its deadline.

| | |
| --- | --- |
| Handler | [`src/lib/scheduler/jobs/admissionsReminders.ts`](../src/lib/scheduler/jobs/admissionsReminders.ts) |
| Marker | `remind__{roundId}__{uid}__{dueAtKey}` |
| Audience | `admissionApplications` where `roundId` matches and `status == "draft"` |
| Cap | 200 sends per tick |
| Stale after | 24 hours |
| Template | `admissions-deadline-reminder`, editable under Admin → Email designs |

**A round carries a free list of reminder slots**, up to six, each one a number
of days before the deadline and a London wall clock on that day. A new round
starts with three presets (seven days out at 10:00, three days out at 10:00,
and deadline day at 12:00) and an author edits, deletes and adds rows from the
round page's **Deadline reminders** section. An empty list means this round
sends none: the tick skips it and Send now refuses it. A list that is there but
unreadable (a hand edit, a partial restore) is read the same way, as empty
rather than as the presets, so a document in a state nobody intended goes quiet
instead of mailing everyone holding a draft three times. The list is the same
shape, and the same editor, as a worksheet circulation's due-soon slots
([`src/lib/reminders/slots.ts`](../src/lib/reminders/slots.ts)); the field on
the round document is still called `reminderOffsets`.

**A slot is labelled from its own numbers**: "3 days before the closing date at
10:00", "On the closing date at 12:00". It used to be three fixed rows with
fixed names over an editable number of days, so a row edited from seven days to
four still read "A week out". A label written from the numbers cannot be wrong
about what it sends.

**Nothing is scheduled.** Each tick reads every open round's `closesAt` and its
slots and derives the due instants again: `closesAt` minus the slot's days, in
**civil** days, then set to that slot's London wall clock. So moving a deadline
moves its reminders with it, and there is nothing to reschedule.

**The marker keys on the resolved civil date**, never on the slot id. Two
consequences, both deliberate:

- editing the schedule cannot re-send a date that has already gone out (nudging
  "10:00" to "12:00" on the morning it went is the same key, so nobody is
  mailed twice);
- two slots that resolve to the same day are **one** email, sent at the
  earlier of the two times.

A slot id is opaque: nothing reads one, and the three ids the fixed rows used
to carry (`t7`, `t3`, `dday`) are still perfectly good ids, so a round authored
before the free list existed keeps its rows, its dates and its markers.

**Stale work is dropped whole, not mailed late.** A due date more than 24 hours
old is recorded with `skippedReason: "stale"` and nobody is emailed: a "closes
in 7 days" email that lands three days after the deadline is worse than
silence. That stamp is **one marker per round and date**, with `nobody` in the
uid slot, rather than one per applicant, because the verdict is
identical for everybody on that date and is re-derived on every tick.

**A stale date is not on Stuck sends, and there is no button for it.** Stuck
sends lists markers stamped `failedAt`; a stale one is stamped
`skippedReason: "stale"` with `failedAt` null, so it never appears there.
Neither the tick nor **Send now** will send that date afterwards either: both
re-derive it from the same clock and reach the same verdict. The only signal
that a date went by unsent is the **stale** count on a Send now receipt (and
the job's log line).

If a date really has been missed and the email is still worth sending, the
remedy is a manual one-off, outside the scheduler entirely: read the wording
under Admin, Email designs (its Send test mails it to you, not to the round),
and have the committee send that note by hand to the people who need it. An
explicit admin override that puts a stale date back in play is a plausible
follow-up; it does not exist today.

**Who is skipped.** A suppressed address, an explicit courses opt-out
(`profile.notifications.categories.courses === false`; an unanswered preference
is not a refusal), or an applicant with no address on file. Each is stamped with
its reason rather than left unmarked, so the tick does not re-decide it every
fifteen minutes.

**It ships switched off.** `admissions-deadline-reminders` is registered with
`enabledByDefault: false`, so on a fresh environment it is dark and the panel
says why on its row. **The owner turns it on from Site status once the round is
open and a run has been proven on dev.** Until then the tick skips it and
**Send now** refuses, naming the switch, so the manual lane cannot bypass the
dark period by accident.
**Run now** on the panel still runs it, which is how you prove it on dev without
arming it.

**Send now.** The round page's Deadline reminders section has a **Send due
reminders now** button (admins and `approveCourse` holders). It calls
`POST /api/admissions/rounds/[roundId]/reminders/send-now`, which runs the SAME
handler scoped to that round: it claims the same markers, so pressing it twice
sends nothing the second time, and it honours the same 24-hour rule, so it
cannot be used to mail a reminder late. It refuses a round that is not open, refuses
while the site-wide scheduler switch is off, and refuses while the reminders
job's own switch is off. The receipt it shows is
`sent / skipped / stale`, plus `failed` when it is not zero, and "There may be more: press again" when the run stopped at its ceiling.

Use it when a tick has slipped on one of the dates. It is also what makes this
whole lane safe to cut under time pressure: without the scheduler, deadline
reminders are a committee member pressing one button on each of the days the
round's schedule names.

#### `admissions-stage-release`

Tells everybody still live on an admission round when the **next part of its
form** opens.

| | |
| --- | --- |
| Handler | [`src/lib/scheduler/jobs/admissionsStageRelease.ts`](../src/lib/scheduler/jobs/admissionsStageRelease.ts) |
| Marker | `stagerel__{roundId}__{stageId}__{uid}`, one per recipient |
| Audience | `admissionApplications` where `roundId` matches and `status` is `draft` or `submitted` |
| Cap | 200 sends per tick |
| Stale after | 72 hours |
| Template | `admissions-stage-released`, editable under Admin, Email designs |
| Push | Yes, alongside the email, under the member's `courses` push switch |

**It announces; it does not release.** The release is derived at read time by
`isStageReleased`, on every serialisation of every stage, so a stage whose
release instant has passed is already serving its questions whatever this job
does. A tick that never ran, a scheduler somebody switched off, a send that
bounced: none of them can hold a question back. That is the whole point of
putting the boundary in a predicate, and it is why this job is safe to leave
switched off.

**Who hears about it.** Everybody on the round holding a `draft` (still
writing) or a `submitted` application (sent an earlier stage, and now has more
to write). Withdrawn and decided rows are out.

**The announcement goes by email AND push.**
The push carries the round's name and the stage's title, links
to the same form the email's button does, and goes through the same shared
mirror as the decision push, so it obeys the member's **Course and application
updates** switch on /profile and reaches only devices that person enabled. It
is sent inside the same per-recipient marker as the email, after a send this
job has counted and before that person's stamp, which is what makes "once per
recipient" cover both channels: a retried tick repeats neither. A push that
fails is logged and counted and costs the push alone. It never marks a send
failed, never leaves a marker unstamped, and therefore can never re-mail a
round. Nobody the email skipped (opted out, suppressed, no address) is pushed,
so the 200-per-tick send ceiling bounds the push volume too. Push is dormant in
any environment without VAPID secrets ([docs/pwa.md](pwa.md)); the email is
unaffected there.

**A stage that opens WITH the round is never announced.** `releaseAt: null`
means "this stage is the form": it becomes readable the moment the round opens,
which is when the round's own announcement and apply link are the news. Such a
stage claims no marker and sends nothing.

**One marker per RECIPIENT**, `stagerel__{roundId}__{stageId}__{uid}`, claimed
before that person's send and stamped after it. Exactly the deadline
reminder's shape, and for the same two reasons.

The first is the attempt budget. A claim is capped at three attempts, and a
round bigger than one tick's 200-send ceiling needs a re-claim per partial run.
A stage-wide marker therefore spent its whole budget on ordinary partial runs:
a round over roughly ninety live applications was given up on after three
healthy ticks, stamped `failedAt` with a "no send" error it had not had, and
the last applicants were never told. The second is write throughput. The
stage-wide shape carried a resume cursor on one document, written once per
recipient, against Firestore's ceiling of about one write per second per
document; the write was swallowed on failure, so under load the cursor quietly
stopped advancing and a re-claim re-mailed people who had already had the
email. Both are gone: there is no cursor, and each person carries their own
attempt budget.

**A single failed send IS retried**, on the next tick, for that person alone. A
failed send leaves that recipient's marker unstamped (`stampError` writes only
`lastError`), which is what the re-claim rule picks up after
`reclaimAfterMinutes`. Nobody else is touched, and nobody is mailed twice. A
recipient who is still failing after three claims is stamped `failedAt` and
appears under **Stuck sends** with a Retry button.

**Stale work is dropped whole.** A release more than 72 hours old is recorded
on ONE stage-level marker, `stagerel__{roundId}__{stageId}` with no uid, as
`skippedReason: "stale"`, and nobody is mailed. Three days rather than the
reminders job's one, because this is news rather than a countdown. That marker
is written already settled and is never claimed: it records a verdict rather
than authorising a send, so it spends no attempt on anything. Once a stage is
stamped stale, **neither the tick nor the Release now button will announce it
afterwards**: both re-derive the same verdict from the same clock. **Retry on a
stale marker will not announce the stage either**: the button puts the marker
back in play, and the next run re-derives "too late" and settles it again, so
the only thing Retry changes is the marker. The stage is still released and its
questions are still being served. If the announcement is still worth making,
send it by hand (the wording is under Admin, Email designs; its Send test mails
it to you, not to the round).

**Lateness is measured from when the stage could first be SEEN**, which is the
later of its release instant and the round's `opensAt`. A stage scheduled for a
date before the round opened was visible to nobody on that date, and measuring
from the schedule alone would have stamped it stale on the day it first
appeared.

**It ships switched off.** `enabledByDefault: false`, same reasoning as the
deadline reminders: it emails applicants, and a missing `config/scheduler` row
must not arm it on whatever data an environment happens to hold. Arm it from
Site status once a round's stages are authored and a run has been proven on
dev. **Run now** on the panel still runs it while it is dark, which is how you
prove it without arming it.

**Release now.** The round console's stage card has a **Release now** button
(admins and `approveCourse` holders). It is a POST and only ever a POST: a read
path that could publish an intake's questions is the one thing this tree cannot
have. It stamps `manualReleasedAt`, which brings a release forward and can
never push one back, and then runs THIS job scoped to that one stage, claiming
the same per-recipient markers. So a hand release and a tick a minute later
cannot both mail anybody, and a second press reports the release it already
made, moves no timestamp and sends nothing.

It refuses a round whose application window is not open (draft, archived,
not yet opened, closed, or cancelled), mirroring the predicate the job itself
gates on: releasing a stage there either does nothing or quietly publishes the
questions the moment the window opens, neither of which is what the button
says.

The button honours both switches, so while the scheduler is off site-wide or
this job is dark it releases the stage and says plainly that nobody was
emailed. The release is committed before the send is attempted, so a Resend
outage can only cost the email. The receipt names WHICH kind of nothing
happened: announced, already announced, the round not in its window, the stage
not read as newly opened, too late, the scheduler or the job switched off, no
live applications, or a send that failed. Each is its own sentence, because an
admin told "already announced" about a round whose window is shut goes looking
for an announcement nobody made.

#### `heartbeat`

Sends nothing and claims no marker. Leave it on: it is how you tell a scheduler
that is running from one that is silently down.

`src/lib/scheduler/registry.ts` is the list, and it is ordered **alphabetically
by job id**. That is a mechanical rule, not a curated order: several PRs splice
into the same array in the same fortnight, and alphabetical is an order every
branch computes the same way, so a rebase stays a rebase. Every handler carries
a wall-clock budget of its own, so no job needs to be earlier in the list to be
safe. The heartbeat is somewhere in the middle now; a tick that runs out of
budget before reaching it still writes a receipt with its row on it, marked
skipped, so "is the scheduler running" is still answered by the panel.

#### `courses-next-week-email`

Sends each group next week's time, room and reading a set number of days
before each of its sessions (`nextWeekEmailDaysBefore`, 2 by default, set under
Course settings), at that session's own time of day in London, whatever
happens to the register. **Ships switched off.** While it is off, finishing a
register (then called Push attendance) sends the email instead; switching it
on moves the email here and makes the register's button "Finish the register",
which emails nobody. See "Finishing a register" below for how the two lanes
never both send.

| | |
| --- | --- |
| Claim | `courseNudges/gnudge__{runId}__{groupId}__{slotStartKey}`, shared with the push |
| Due | from the send instant until the session starts; the group's first session never |
| Runs scanned | status `applications-open`, `applications-closed` or `running`; archived groups skipped |
| Recipients | the group's members on the run's cohort channel, opt-outs and suppression honoured: the push's audience |
| Held card | `tasks/course-register__{runId}__{groupId}__{sessionKey}__email`, for the run's lead and every admin |
| Config | `nextWeekEmailDaysBefore` (2), `weeklyFeedbackUrl` |

**Days on the calendar, the session's own wall clock.** Two days before a
Tuesday 6pm session is the Sunday at 6pm, on either side of a clock change.
Counting 48 elapsed hours would send at 5pm or 7pm on the weekend the clocks
move.

**Held, not skipped.** Every tick between the send instant and the session's
start asks again, so:

- a week that is not **published** holds the email (published stands in for a
  week being ready), and the first tick after it is published sends it, if the
  session is still ahead;
- a week published only after its session has started is never sent about;
- an email with an **empty value** the template uses (the group's room, the
  week's reading, its title or summary) is held whole rather than sent without
  the sentence, and one card goes on the boards of the programme's lead and the
  admins saying what is missing. Filling it in sends the email on the next tick
  and archives the card. The weekly feedback form and a recipient's name are
  the two values an email may go without.

**Never a meeting link.** An online week says "Online"; a room with a link in
it is not printed, which holds the email until the room is a room.

**It may only be switched on where the scheduler is running**, because
switching it on also stops the push from sending. Prove it on dev with **Run
now** on a run whose next session is inside the window, then switch it on.

#### `courses-register-reminders`

Emails a group's facilitators ONCE when a session's register is still not
finished `unmarkedRegisterGraceHours` (36 by default) after the session ENDED.
**Ships switched off.** Each facilitator's own "Tasks and worksheets" email
switch is its off switch; a facilitator whose account no longer has standing
is skipped.

| | |
| --- | --- |
| Marker | `schedulerMarkers/regremind__{groupId}__{sessionKey}__{uid}`, one per facilitator |
| Window | sessions whose END is between the hours and the hours plus 24 |
| Runs scanned | status `applications-open`, `applications-closed` or `running`; archived groups skipped |
| `maxLateHours` | 72 |
| Config | `unmarkedRegisterGraceHours` (36) |

A skipped facilitator is stamped on their marker with the reason (`opted-out`,
`no-standing`, `no-address`, `suppressed`), so "why did Sofia not get it" is a
marker to read rather than a log to search.

#### `courses-unmarked-registers`

Raises a task for every group whose register is still not finished
`registerTaskHours` (60 by default) after the session ended. Assigned to the
lead of the programme that names the run, while that account still meets the
bar a lead is appointed behind, and to every admin; a run no programme names
goes to the admins alone. `committee` visibility, `source: "course-register"`,
due at the session's end plus the hours, born notified so it emails nobody.

| | |
| --- | --- |
| Marker | `schedulerMarkers/unmarked__{groupId}__{sessionKey}` |
| Task id | `tasks/course-register__{runId}__{groupId}__{sessionKey}` |
| Window | sessions whose END is between the task's hours and those hours plus 24 |
| Runs scanned | status `applications-open`, `applications-closed` or `running` |
| `maxLateHours` | 72 |
| Config | `registerTaskHours` (60), `unmarkedScanBudgetMs` (12000), `maxFollowUpTasksPerTick` (25) |

**The window is a band, not a threshold.** "Older than the grace" would
re-derive every unmarked session of the whole term on every tick; the marker
would suppress the writes and the reads would still happen. A 24-hour band over
a tick every 15 minutes gives each session about ninety-six chances to be seen,
which covers a scheduler that has been down for most of a day. The cost: a
register still unpushed a week later has one card and gets no second one, so
the board is the only record.

**It scans every live status, not `running` alone.** The pre-course holds its
six sessions while the admission round is still open, so its run sits at
`applications-open` throughout. Scanning `running` only would miss the one
cohort the job exists for: brand-new facilitators marking their first register.

**Unmarked means NOT PUSHED**, which subsumes "no register document" and "a
register with no marks". The push is the thing the card asks for, and a
half-marked register has had none of a pushed one's effects. A session switched
to **Didn't happen** is complete and is never chased.

**It is resumable.** `maxFollowUpTasksPerTick` caps writes, and writes are not
where a tick runs out of time: a quiet week writes nothing at all and still
walks every run, every group and every session in the band. So the scan carries
its own budget (`unmarkedScanBudgetMs`, floored by whatever the tick has left)
and a cursor over the run list at `config/schedulerCursors`. Out of time means
"stop, remember the last run finished end to end, report `hasMore`". A run
interrupted part-way through is rescanned from its first group next time, which
costs reads and writes nothing.

**If a card lands at a weird id.** A task's id says nothing about who made it.
When a task already sits at the job's deterministic id, the job reads the
document back and accepts it as
its own only when the source, the cohort pointer and an admin completer all
agree; otherwise it mints at `…__alt` and logs
`follow-up id occupied by a foreign task`. If both ids are taken the marker is
left unsent, so it reaches **Stuck sends** rather than pretending a card exists.

**Closing a card by hand.** Push the register and it archives itself. If the
register genuinely cannot be pushed, archive the task from the board: nothing
re-raises it, because the marker is already stamped.

**Losing the cursor is safe.** Clearing `config/schedulerCursors` by hand means
"start from the top", which costs one repeated scan; every unit of work is
marker-guarded, so a second look writes nothing.

**A run that keeps throwing is stepped over.** One bad run never stops the pass:
the scan logs it, counts it in the row's `failures` map on
`config/schedulerCursors`, and carries on down the queue. A run that has thrown
on three consecutive passes is skipped from then on, logged as `stepping over a
run that keeps failing` on every pass it happens and counted on the receipt. The
count clears itself the moment the run scans cleanly; to force a retry after
fixing the run, delete this job's row from `config/schedulerCursors`. Nothing
else recovers it, so a receipt reporting `runs stepped over` week after week is
a thing to go and look at rather than background noise.

**Switch it off on the panel until dev has seen it work.** The job has no
per-job default-off flag of its own yet, so the first tick after a deploy runs
it for real against whatever cohorts are live. Turn it off on the site status
page **before** the deploy reaches an environment with real facilitators on it,
and only turn it back on once dev has shown all four scenarios: a session
crossing the 64-hour mark raising exactly one card; a second tick over the same
session raising none; finishing the register archiving the card it raised; and
a task id that is already taken going to the `__alt` fallback rather than
overwriting anything.

### Budget, re-arm, and the Cloud Run caveat

The backend's request timeout is 60s (`apphosting.yaml`,
`runConfig.timeoutSeconds`). The tick declares `maxDuration = 45` and gives the
job list 28s of that, leaving room to write its receipt and hand off.

When a job reports `hasMore`, the tick calls itself again with `depth + 1`, up
to depth 3. The re-arm gets its own receipt because the receipt id carries the
depth: without it the re-arm would floor to the same 15-minute bucket, hit
ALREADY_EXISTS and return having done nothing, so a backlog would wait a full 15
minutes for the next external call.

The re-arm is **awaited with a short handoff window**, not fired and forgotten.
Outside a request, a Cloud Run container's CPU is throttled to near zero, so a
detached `fetch` after the response has been sent may never open its socket, and
the re-arm silently never happens. Awaiting keeps the parent's CPU allocated
until the child request has at least been accepted.

The trade-off, stated plainly: the child does not answer until it has finished
its own work, so the parent cannot wait for it (that would chain four full ticks
into one request and bust the platform timeout). It waits 8 seconds and aborts,
which Cloud Run may propagate to the child as a client disconnection. If it
does, the backlog waits for the next 15-minute call. That is safe by
construction (every job derives its due state at tick time and every send is
marker-guarded), so a dropped re-arm costs latency, never correctness. The
receipt records what happened either way, under **More** on the Recent ticks
table.

**Ticks overlap, and that is expected.** The parent stops answering when the
handoff window closes but the child keeps working, so a re-arm chain that starts
near the end of a bucket is still running when the external scheduler delivers
the next tick. Nothing prevents that and nothing should: the alternative is a
lock, and a lock that outlives a crashed container is how a scheduler goes quiet
for a day.

The rule that follows, for anyone writing a job handler: **every handler must be
safe to run concurrently with itself.** Claim a marker before the side effect,
one marker per unit of work, and let the `.create()` decide who owns it. A
handler that instead reads a list, does the work and writes a "done" flag at the
end will double-send the first time two ticks meet.

### If the scheduler is down on a day something is due

Every job ships with a manual path, and that is deliberate: this whole lane is
survivable to cut under time pressure.

- **Run now** on the panel runs one job immediately.
- Deadline reminders additionally have a Send now on the round page, so a
  slipped tick is a click on three named dates rather than a missed deadline.

### Rules and indexes

`schedulerMarkers` and `schedulerRuns` are both `allow read, write: if false`,
shut to every client, admins included, because a client able to write a marker
could permanently and silently suppress a send, and a client able to write a
receipt could make the next real tick believe it had already run. With
`if false` on both, the blocks are identical to Firestore's implicit deny, so no
rules deploy is strictly owed for them; they are written out so the lockdown is
stated rather than assumed.

`config/schedulerCursors`, where a resumable job leaves its place, is one more
document in the existing server-only `config` collection and rides that
collection's explicit `allow read, write: if false` block. No new collection, no
rules change, and nothing in it names a person.

One composite index is owed before the panel's per-job marker drill-down works:

```
schedulerMarkers: job ASC, claimedAt ASC
```

Deploy with the rest:

```sh
npx firebase deploy --only firestore:rules,firestore:indexes --project <default|dev>
```

Composite indexes take a few minutes to build and the query fails until they
are `READY`.

### Retention (a one-time owner step, per project)

Both collections grow forever on their own. A tick every 15 minutes is about
35,000 receipts a year, and a marker is written for every unit of timed work the
platform ever does.

The code already writes the field the cleanup keys on:

| Collection | Field | Written when | Horizon |
| --- | --- | --- | --- |
| `schedulerRuns` | `expiresAt` | the receipt opens | 90 days |
| `schedulerMarkers` | `expiresAt` | the marker settles (`sentAt` or `skippedReason`) | 180 days |

A marker still in flight, and one stamped `failedAt` waiting on **Stuck sends**,
deliberately get no `expiresAt`: neither may vanish from under the person it is
waiting for. Retry clears the field along with the skip that set it.

Markers get twice the receipt horizon because they answer a question that
arrives late: "did this person actually get their email", asked in February
about a January send.

**The field does nothing until a TTL policy exists**, and creating one is an
owner-level step (`datastore.owner`, or Firestore Database Admin) that is not
part of a deploy. Do it once per project, on both:

```sh
gcloud firestore fields ttls update expiresAt \
  --collection-group=schedulerRuns --enable-ttl --project=<PROJECT_ID>

gcloud firestore fields ttls update expiresAt \
  --collection-group=schedulerMarkers --enable-ttl --project=<PROJECT_ID>
```

The same two switches live in the Firebase console under Firestore, TTL. Either
way it is a setting on the project and not part of a deploy. Check it with:

```sh
gcloud firestore fields ttls list --project=<PROJECT_ID>
```

Deletion begins within 24 hours of a document's `expiresAt` and is a background
sweep, not an instant. A row with no `expiresAt` is never collected: delete
such rows by hand if they matter.

---

## Draft course and run reads (V3 W3 PR20)

### What changed

A course with `status: 'draft'` and a run with
`status: 'draft'` are readable only by staff, and the authored programme
page follows the course it belongs to:

| Collection | Who may read a DRAFT |
| --- | --- |
| `courses` | admins, `draftCourse` or `approveCourse` holders, the `authorUid`, anyone in the course's `collaboratorUids` |
| `courseRuns` | admins, `draftCourse` or `approveCourse` holders, the run's `authorUid` |
| `coursePages` | admins, `draftCourse` or `approveCourse` holders, at EVERY status |

Every other status is readable by any signed-in account for the first two.
For `courseRuns` the predicate is `status != 'draft'`, not "published or
archived": there is no `published` member of `CourseRunStatus` (it is `draft`,
`applications-open`, `applications-closed`, `running`, `completed`,
`cancelled`), and `archived` is a separate boolean orthogonal to status. A
pending applicant can read an `applications-open` run, which is
what the funnel needs.

`coursePages` is the flat staff predicate rather than a status test because
the page document carries no status of its own: the status lives on the parent
course, and resolving it would need a `get()` billed once per candidate
document on a list, which is the pattern the rest of `firestore.rules`
refuses. Nothing loses a surface. The only client-direct reader is
`useCoursePage`, mounted by `CoursePageEditor` at
`/admin/courses/[courseId]/page`, whose gate is `requireCourseAuthorPage()`
(admin, `draftCourse` or `approveCourse`), exactly the predicate. The
logged-out marketing page is served by `fetchCoursePage.ts` on a server
component through the Admin SDK, which bypasses rules.

### Three consequences worth knowing before you debug something

**1. A course collaborator without a course permission cannot read a draft
run.** `collaboratorUids` lives on the COURSE document; a run carries only
`authorUid`. Honouring collaborators on the run would need a `get()` on the
parent course from inside a read rule, which is billed once per candidate
document on a list and is the pattern the rest of `firestore.rules` refuses.
Nothing loses a surface today: every client-side reader of a run document
(`RunEditor`, `WeekEditor`, `AdminCourseList`) sits under `/admin/courses`,
whose gate is admin OR `draftCourse` OR `approveCourse`, so a permissionless
collaborator cannot reach any of them anyway. If that changes, denormalise the
roster onto the run as a server-pinned array rather than adding the `get()`.

**2. An unfiltered client list over `courses` or `courseRuns` fails for a
caller with no course permission.** Firestore judges a list on the query's
potential result set, not on the rows that come back, so an unfiltered query
is refused even when every stored document happens to be published. This is
fine today because no such list is issued: `useCourses()` and
`AdminCourseList` both run inside `/admin/courses`, and every public and
learner surface reads through the Admin SDK fetchers in
`src/features/courses`, which bypass rules. A future member-facing list must
constrain on status, and the constraint DIFFERS by collection because the two
rules do: `where("status", "==", "published")` for `courses`, and
`where("status", "!=", "draft")` for `courseRuns`, which has no `published`
member to ask for. Either narrows the candidate set to documents the rule
already allows. `RoundEditor` is the one caller that can
run as a permissionless account (an appointed admissions reviewer who is SU
committee and holds no course key): its unfiltered `courseRuns` read fails
for that person, it catches its own rejection, and the run pickers it
feeds render only for `canAuthor`, so nothing that person is shown depends on it.

**3. A read of a course or run document that does not exist returns
`permission-denied` to a non-staff caller, not `exists === false`.** Both
rules dereference `resource.data` to test the status, and on a missing
document `resource` is null, so the clause cannot pass and Firestore refuses
rather than returning an empty snapshot. A staff caller is unaffected, because
the permission clauses that follow are resource-independent and one of them
still matches. So a client that distinguishes "no such course" from "not
allowed" by catching the error has to stop: for a plain member the two are
the same response, and the honest message is "we couldn't load that course".

### What signed-in accounts can read

`courseRuns/{runId}/weeks` is `allow read: if isSignedIn()`. The week documents
are read client-direct by `useWeek`,
`ProgressBody` and `useGroupWeeks`, the last of which issues an unfiltered
`getDocs` over the subcollection, and a week document carries no status of its
own to test.

### Deploying it

The usual ordering worry (deploy rules before the
code that needs them) does not apply: nothing in the app needs this rule to
function. It is a rules-only deploy:

```sh
npx firebase deploy --only firestore:rules --project <default|dev>
```

No index is owed.

**Rollback** is a rules-only deploy of the previous file; there is no data
migration and no code depends on the rule. If a surface breaks after the
deploy, the symptom is a `permission-denied` on a `courses`, `courseRuns` or
`coursePages` read, and the first question is whether the caller holds
`draftCourse` or `approveCourse`, followed by whether the failing read is an
unfiltered list, and then whether the document exists at all (consequence 3).

## FINISHING A REGISTER, and next week's email

A facilitator marks their register during the session, and every tap saves:
the page says "Saved 7:58pm" after each one. Nothing has left the building at
that point: the register is a draft and nobody outside the room can see it.
The button under it ends the register, and **what it is called and what it
does depend on one switch**, the `courses-next-week-email` job's on Site
status:

| The switch | The button | What pressing it does |
| --- | --- | --- |
| Off (how it ships) | **Push attendance** | locks the register, rebuilds everyone's totals, shows people their marks, closes the follow-up card, and emails the group about its next session |
| On | **Finish the register** | the same, and emails NOBODY: the job sends next week's email a set time before each session, whatever happens to the register |

The register's page says which, in the board's words, every value read from
records: the group, when next week's email goes, who is reminded and who gets
a task if nobody finishes.

While the push sends the email, the page also says what each press will email
before anybody presses. The foot under the register and the confirm in front
of its button read one answer, which the register's GET works out for every
register on the page from the push's own decision (`src/lib/courses/pushEmail.ts`):
the session after the one being finished, in the group's whole schedule with
each week's changes applied, and whether its email can go and to how many. So
the confirm names the group and how many it reaches ("Everyone in Group B gets
one email about week 4 on Tue 10 Nov: 3 people.", or "2 of the 3 people in
Group B get one email ..." when somebody has switched course emails off or
their address is suppressed), says that the email about a cancelled session
tells them it is off, and says why nobody is emailed when nobody is: the
group's last session, a week not published yet ("Nobody is emailed: week 4
isn’t published yet, so the group won’t be sent a reminder."), an email that
has already gone, nobody in the group set up to receive email. The push asks
the same decision again when it is pressed, so a week published after the
page was read is sent about, and the push's answer says what happened.

### What finishing does, in the order it does it

1. **One transaction** stamps `pushedAt` and `pushedByUid` on the register, and
   recomputes every member's `courseEnrolments.attendance` rollup IN FULL from
   that group's finished registers. Never a delta: a mirror that can be rebuilt
   from its source cannot drift from it.
2. **The follow-up card closes**, if the scheduler raised one.
3. **Only while the switch is off**, the group is emailed about its next
   session: the send marker is claimed by a standalone `.create()` OUTSIDE that
   transaction, at `courseNudges/gnudge__{runId}__{groupId}__{nextSlotStartKey}`
   (plus a `-{occurrence}` suffix from a week's second session onwards), and
   then one message goes to each member. A create collision inside a
   transaction aborts the whole transaction, so claiming it there would unlock
   a register because an email had already gone.

The consequence worth knowing on the night: **a send failure leaves the
register locked and the figures correct**. A second press is an idempotent 200
that sends nothing, and the mail is recovered by an admin (below) rather than
by pressing again.

### The push and the schedule never both send

Two things hold it, and either alone would:

1. **The switch.** The push route and the tick read the same switch through
   one function (`nextWeekEmailIsScheduled`): the push sends only while it is
   off, and the tick runs the job only while it is on. A switch read that fails
   in the push route is taken as "off", the direction that still sends.
2. **One claim.** Both lanes claim the same `gnudge__` document with
   `.create()` before the first message. A switch flipped between a push and a
   tick finds the claim taken and sends nothing; the run's catch-up send reads
   the same family before it sends.

`tests/course-register-ends.test.mjs` holds both: the push after the schedule
has sent, and the schedule after the push has sent, each send nothing.

**Turning the schedule on is the whole switch-over.** Do it only where the
scheduler is running (a backend whose tick is armed), because it also stops the
push from sending. Prove it on dev first with **Run now**.

### After finishing

The register is admin-only. An admin corrects it from the same grid: marks, the
**Didn't happen** switch and the session note all stay available to them on a
finished column, and every change appends its own `courseAudit` row with the
before and the after. Participant notes stay open to the facilitator,
deliberately: they are usually written after the session rather than during it.

Finishing is also what makes the session visible to the LEARNER. Their own row
appears on their course home (the **Your progress** card) as soon as the
register is finished, and not before: `courseAttendance` stays `read: if false`,
and the only route to a member's own mark is the overview payload's
`ownAttendance`, which drops any register with no `pushedAt`. So a register a
facilitator is halfway through saving shows nobody anything, and a session
nobody ever finished simply does not appear on any member's list.

A cell left blank in a FINISHED register reads "Not marked" on that list, while
the summary line above it (and the reviewer's figures, and any completion bar)
counts it as an absence. That disagreement is deliberate: the count has to
treat a finished register as finished, and the row should not turn a
facilitator's slip into an accusation. If a member reports a wrong mark, an
admin corrects the register and the figures follow.

### Recovering a send that failed

The register locks and the figures move BEFORE the first message goes out, so a
transport failure leaves a locked register and an unmailed group. The marker is
already claimed, so pressing again reports "already" and sends nothing. That is
the correct default, and it is why there is a second lane.

**Resend** sits on a finished column for admins only ("Resend reminder" while
the push sends the email, "Resend next week's email" once it is on its
schedule). It re-sends this group's email and **nobody else's**, and it records
the re-send on the group's marker exactly as the run-level catch-up records its
own forces (`forceCount`, `lastForcedAt`, `lastForcedByUid`, and an entry in
`forces` naming the marker it went over). Use it when a facilitator reports
"nobody got the email". While the email is on its schedule, Resend only ever
re-sends an email that has gone: it never sends one early, and it holds the
schedule's rule, whole or not at all.

Reach for the run-wide catch-up only when the whole cohort is owed the send. It
mails **every** group of the run, so using it to fix one group mails every other
group twice.

What can and cannot fail after the claim, so the failure a report describes can
be placed: the settings, the template, the week and the audience are all read
BEFORE the marker is claimed, so the only thing left that can fail after it is
the transport itself.

### The sends, and which is which

| Send | Who presses it | When |
| --- | --- | --- |
| Next week's email, while the schedule is off | the group's facilitator, by pushing the register | after every session |
| Next week's email, while the schedule is on | the `courses-next-week-email` job | `nextWeekEmailDaysBefore` days before each session after the first |
| The run-wide catch-up | an admin, from the run's nudge page | the session-1 welcome, and recovery |

**The session-1 welcome has to be sent by hand.** Neither lane sends anything
about a group's first session: nothing was finished before it, and the
schedule leaves it to the email Publish sends. Send it from the run's nudge
page before the first week if a welcome is wanted.

**The catch-up reads the group markers before it sends.** If any group has
already had this week's email from either lane, the run-wide send is refused
unless an admin forces it, and a force records the group markers it overrode on
its own marker. A cohort mailed twice in one week is on the record either way.

**Residual risk: a mid-term `startDate` edit.** The run's own marker family is
checked across a span of six days either side of the slot, so nudging the same
calendar week twice is caught even after the dates move. The group markers are
checked at the CURRENT slot key only. So if a run's `startDate` is edited part
way through the term, the group markers either lane wrote sit under
neighbouring keys, the catch-up finds none, and it can mail those groups a
second time with no force recorded anywhere. Remedy: after editing a live run's
`startDate`, treat the run-wide catch-up as unavailable for that week. If a
group is owed its email, use **Resend** on that group's finished column, which
is keyed on the group's own next session and is recorded on the group's own
marker.

### If nobody finishes it

The group's record waits, and so (while the schedule is off) does its email.

**First, the facilitators are reminded.** `unmarkedRegisterGraceHours` (36 by
default) after the session ENDS, the `courses-register-reminders` job emails
each of the group's facilitators once, naming the register and the button.
It ships switched off.

**Then the lead and admins get a task.** `registerTaskHours` (60 by default)
after the session ends, `courses-unmarked-registers` raises a card for the
lead of the programme that names the run and every admin, saying what is
waiting on the press and what to do about it. Finishing the register archives
the card. The card emails nobody, so watch the board in the first fortnight:
with several groups a quiet week can put a dozen cards on it, and a board
people mute is a board that stops working.

### The knobs

All live on the site status page, under Course settings:

- **Next week's email: days before each session**
  (`config/courses.nextWeekEmailDaysBefore`, 2). Whole days, 1 to 6, at the
  session's own time of day. Read only while the schedule is on.
- **Weekly feedback form** (`config/courses.weeklyFeedbackUrl`). Rides next
  week's email as `{feedbackUrl}`. Leave it empty and the paragraph carrying it
  is dropped from the email whole, which is a complete state rather than a
  broken one: it is one of the two values an email may go without.
- **Unfinished register: reminder to facilitators after (hours)**
  (`unmarkedRegisterGraceHours`, 36). The key is older than the reminder: it
  used to be when the admins' task was raised, and kept its name and number
  when the task moved later.
- **Unfinished register: task for the lead and admins after (hours)**
  (`registerTaskHours`, 60). Always later than the reminder; the panel refuses
  a value that is not.

Two more sit on `config/courses` with no editor, because they are scheduler
cost dials rather than product settings: `unmarkedScanBudgetMs` (12000, the
scan's own wall-clock bound) and `maxFollowUpTasksPerTick` (25, the cap on
cards raised in one tick). Set them from the Firestore console if a scan is
consistently reporting `hasMore`. Missing means the default, always.

`unmarkedScanBudgetMs` is a share of the 28s the tick hands its whole job list,
and it is meant to **shrink as jobs are added**. The two register jobs added
beside it carry their own fixed budgets (10s for next week's email, 8s for the
reminders), and every job checks what the tick has left before it starts, so a
slow one costs the jobs after it a quarter of an hour, never an email.

### A cancelled session

Use the **Didn't happen** switch on the column, then finish as normal. A
session marked not held leaves every denominator rather than counting as a room
full of absences, and it is never chased. Next week's email goes either way:
the push sends it while the schedule is off, and the schedule sends it on time
while it is on.

A session cancelled ahead of time, through "Change a session", is never chased
either, and its own email says it is off: see Changing a session. Its column
reads **Not held** and its register needs nothing: a mark, the switch, a note
and the push are each refused. To hold it after all, use Hold it as usual in
Change a session.

## Placing a term's accepted people on a course run

The term's application form decides who holds a place on each programme
(see [docs/applications.md](applications.md), "From the form onto a course
run"). Groups are formed on a course run's allocation board. This is the
order the two are joined in. Steps 1 to 4 are an admin's. From step 5 on,
the programme's lead does it too, on the run their programme names, from
the programme's own page (see "A programme's lead on the run their
programme names" below).

### The order

1. **Make the run, and leave it a draft.** One run per programme, on the
   course the programme is tied to, with its groups: a weekday, a start
   time, a length, a room and facilitators for each.
2. **Name the run on the programme.** Admin, Admissions, the form, the
   programme, Settings, "Course run". From this moment the run's own apply
   page (`/courses/<course>/apply`) refuses for everybody, whatever the
   run's status and dates say.
3. **Move the run on from draft.** A run can only leave draft by way of
   "applications open". Because step 2 came first, nothing can be applied
   for while it is there. Step 4 refuses a run that is still a draft.
4. **After decisions have been sent, press "Hand over".** On the same panel.
   Everybody who holds a place on the programme gets a row on the run's own
   list. Nobody is emailed and nobody is put in a group.
5. **Open the allocation board** (the panel links to it, and the
   programme's Groups tab draws it as People in groups) and put people in
   groups. Each card says which groups that person can make, from the week
   they painted on the form, or that they gave no availability.
6. **Publish** from the board when everybody is in a group. That is the
   email that tells each person their group, and the first email anybody
   gets after decision day. First press **Send a test to me**: it sends you
   the first person's "your group" email and the first facilitator's
   "You're facilitating" email exactly as Publish would, marked as a test,
   and Publish stays locked until a test of the wording in force has reached
   you. The button then says how many emails a press sends ("Publish and send
   37 emails"), the confirmation says the same number, and afterwards the
   board says what became of every email: sent, held, on the do-not-email
   list, failed (named, and tried again by the next press) or no address
   (named).

### Things worth knowing before you do it

- **Press "Hand over" again whenever somebody new has a place.** Somebody
  who accepts an invitation after the first press is added by the next one.
  Pressing it twice writes nothing twice: a press that finds everybody
  already there says so and changes nothing.
- **A run has to start with no applications of its own.** A run that
  already took applications through its own page cannot be named. Make a
  new run for the term.
- **One run, one programme.** A run another programme already names cannot
  be named again.
- **Once anybody has been handed over, the run cannot be changed** on the
  programme. Check the run before the first press.
- **A track lead on such a run is not shown these people.** The board, the
  run's own applications page and Publish serve somebody the form placed to
  an admin and to the lead of the programme that names the run, and to
  nobody else. A track lead still edits the run, staffs its groups and sees
  everybody who applied to the run itself. A row the form wrote is one an
  admin or that lead places and publishes: a track lead who presses
  Publish, or its test, on such a run is told so and nothing happens. The
  run's own counts do include
  them, as numbers: the run's applications page shows a track lead "8
  accepted" above an empty list.
- **The "Paid" or "Unpaid" badge on a card is the membership record's.** It
  is read from the person's account when the board is drawn, against the
  run's academic year, so it says what the membership record says that day.
  It is not what they answered on the form about Students' Union
  membership. A card with no badge means the account could not be read.
- **A hand-over shows the person nothing.** Their member area reads as it
  did before the press, and their own application page says what comes
  next for their kind of programme. Nothing on a run is announced to them
  because of the row, whatever is done to it on the run's applications
  page.
- **Nobody sees their group until Publish has emailed it to them.** The
  first placement on the board makes the place on the run, but the place is
  the board's working copy until Publish tells its owner: until then their
  member area reads as it did before, the run stays shut to them, and the
  group's facilitators and other members are not shown their name. A
  facilitator sees their group's day, time and room from the moment they
  are added, and reads "You’ll see your group’s names when groups go out."
  where the names will be. Moving people around on the board emails nobody
  and shows nobody anything.
- **After Publish, press Publish again straight away after any move.** A
  move clears the person's "Emailed" mark, so until Publish is pressed
  again the person moved reads nothing of the run, is on neither group's
  roster or register, and gets none of the group's mail. Publish emails just
  them, and then they see their new group. The same goes for anybody placed
  late.
- **Publish never emails somebody who gave their place back.** Somebody
  placed and not told yet who replies "I can’t make it" keeps their seat
  until somebody Removes it, and their card says "Gave their place back".
  Publish asks the card's own question of the card's own facts
  (`gaveTheirPlaceBack` in `src/lib/courses/placeGivenBack.ts`), so its
  button does not count them, "Send a test to me" never shows their email,
  and a press neither emails them nor marks them as told; the facilitators'
  email does not count them either. The Publish area and the confirmation
  say how many ("1 person gave their place back, so they aren’t emailed.
  Remove them to free their seat."). See "When somebody gives their place
  back" below.
- **An incubator's people are sent their own email.** When the programme
  that names the run is an incubator, Publish sends its people "Placed on an
  incubator" in place of "Placed in a group": the weekly session (day, time
  and where), the date of the first session, who runs it (the programme's
  lead) and a button to their programme's page. It never says "group": an
  incubator's people are never told about one. Its wording is in Email
  designs beside "Placed in a group", with its own test send there; a
  fellowship's run, and a run no programme names, are sent "Placed in a
  group" as before.
- **Each facilitator is told once a group, at Publish.** "You're
  facilitating" goes to every facilitator of every group with somebody in
  it: the group's weekly time, where it meets, its first and last session
  on the group's own calendar, who else facilitates it, how many in it have
  been told their group and a button to their group page, signed by the lead
  of the programme that names the run. That number counts only the people
  told by the end of the press, so it is the number of names on their
  roster: somebody with no address on file, or whose email failed, is
  counted once a later press tells them. Never a meeting link: an online
  group is told the link is on the group page. A facilitator added later is
  told by the next press. A group with nobody in it waits, and the board
  says so; so does a group nobody in which can be told yet (the board names
  whoever has no address, and a press whose every send to the group failed
  counts the facilitators' email as still to send). The lead who signs it
  is never sent it, whatever group they facilitate (an incubator's lead
  facilitates its one group), and the button's count leaves them out. Its
  wording is in Email designs as "You're facilitating", beside "Placed in a
  group".
- **A changed wording needs a fresh test.** Saving either of the two emails
  a run sends in Email designs ("You're facilitating", and "Placed in a
  group" or, on a run an incubator names, "Placed on an incubator") locks
  its Publish again until somebody sends themselves a test. A test that this
  copy of the site held, or that went to an address on the do-not-email
  list, reached nobody and does not count.
- **Do not destroy the form while its people are waiting for a group.**
  Until somebody is in a group, their member area knows they hold a place
  only from their application. Destroy the form in between and it tells
  them they are not on a programme, though they are still on the run's
  list and the board still places them. Put everybody in a group first.
- **Nothing is deployed for any of this.** No rule and no index changes.
  The rows are written by routes into a collection that was already shut to
  every browser write, and read back by one equality on `runId`. Publish's
  test record, its once-only facilitator markers and the hold one press keeps
  on the run live in `courseNudges`, which is shut to browsers too, and each
  carries `runId`, so destroying the run clears them.

### When somebody gives their place back

Before the hand-over, they are simply not handed over.

**Once Publish has told them their group**, "I can’t make it" on their
application page is leaving the programme (Q12): it takes them out of their
group at once, exactly as "Leave the programme" does (the next section), so
there is nothing to do on the board. Their application page no longer
offers the button by then: it points them to their programme's page, where
leaving is, and the reply only reaches somebody whose page was open from
before. Their row on the run's own list can still be changed from Accepted
(step 2 below), but nothing waits for it: Publish waits for nobody who has
left.

**Before that** (handed over and not placed, or placed and not told yet),
nothing takes them off the run. The panel names them under "No longer hold
a place", and their card on the board says "Gave their place back". Once
they are removed it lists them under "Taken off the programme" instead, as
it lists somebody who left under "Left the programme": nothing is left to do
for either. Then, by hand:

1. on the board, **Remove** them if they are in a group. That frees the
   seat. Publish leaves them out whether or not this comes first: a press
   does not email them, count them on its button or mark them as told, and
   the Publish area says how many are waiting to be removed;
2. on the run's own applications page, change their row from Accepted. A
   row the form wrote carries no address, so that page emails nobody about
   it. Nothing waits for this step: Publish waits for nobody whose card says
   "Gave their place back", in a group or not, and the board counts
   somebody in Unallocated whose card says it apart from the people still
   to place ("1 gave their place back" at the end of the rail's numbers).
   This step is an admin's (or the run's admissions reviewer's): the
   programme's lead does step 1 from the Groups tab and asks an admin for
   this one.

Their own application page says they gave the place back as soon as they
reply, and, for somebody who left their group, that they left the programme
and when.

### When somebody leaves the programme

Somebody taking part leaves from their programme page: "Leave the
programme" at its foot opens a confirmation page, which says what leaving
does, asks why (optional: the programme's lead and admins read it, on the
Overview) and asks for the course's title, typed exactly. It is the leave an
open run's session picker has always offered, for a run the form placed them
on too. Somebody who applied to the run itself is still told to ask the
team, and an admin uses Remove.

The same leave has a second door: "I can’t make it" on the application page
of somebody in a group Publish has told them about (the section above). It
is asked twice and asks why from a short list, and leaves exactly as the
first door does, with the words of what they chose as the reason. Whatever
the first door refuses, it refuses in the same words. Both doors are one
function (`leaveRun` in `src/lib/courses/leaveRun.ts`), so they cannot
come to write different things.

Leaving closes when the run's last session is over, the moment who finished
opens: the programme page draws no link, the confirmation sends anybody who
opens it back to the programme page, and a press is refused with a sentence
that says the programme has ended and where to write. Somebody who finished
keeps their record, and no place on the form goes back after the end.

- They leave their group at once. Their row keeps the group, Publish's stamp
  and the day they left (`droppedOutAt`), with the reason (`dropOutReason`).
- Their place on the form goes back exactly as "I can’t make it" gives it,
  in the same transaction (see "Leaving the programme gives the place back"
  in `docs/applications.md`). After the end of week 1 no freed place can be
  offered for it.
- They come off the cohort's mailing list, their weekly cards leave their
  tasks, one line is logged ("Left the course.": the log of course actions
  outlives the account, so it says what was done and never what they said;
  their reason stays with their seat), and one email goes to them and
  nobody else (the "Left a course" template in Email designs).
- Publish waits for nobody who has left.
- They keep nothing of the programme. Its page now says only that they left
  and when, with the society's address in case it was a mistake, and the
  notes and reading list pages say the same; My programmes has a card that
  says they left and links to it. Their marks, notes and reflections stay
  where they are, for the programme's lead and admins, and the notes they
  shared stay with their group, but none of it is shown to them. Nothing else
  of the run opens to them either: not the group's names, its updates, its
  sessions or its registers.

Their facilitators' register lists them last, read only, with the marks
they had, "Left" and the day, and refuses a mark for them; the lead's
Attendance tab, its CSV and the Overview say the same. **Remove** records
the day too, so both kinds of leaving show it, and it gives a place the
application form gave them back, exactly as leaving does and with no
reason (nothing goes back after the run's last session). Their application
page then says "Taken off the programme" and the day, and the form's count
of places held drops. Somebody who left by
themselves is not offered Remove on the board, and the Remove route refuses
them in a sentence with the day they left ("They left on Tue 17 Nov, so
their seat is already free and there’s nothing to remove."), writing
nothing. Somebody removed does not get the page that says they left: the
run closes to them.

To put somebody back, an admin places them again on the board and presses
Publish, which emails them: placing them clears the day, the reason and
Publish's stamp, and records when they were put back (`putBackAt`). Their
place on the form stays given back, whether they left or were removed:
putting them back on the run does not change their application. Their card stops saying "Gave their place back"
while they are back, so Publish tells them; if they leave again, it says so
again.

### What is logged

Each press that puts anybody on a run appends one line to the course log
(`courseAudit`, kind `run-hand-over`), keyed to the run: who pressed, which
programme, and how many people. It names none of them. Destroying the run
clears it with the run's other lines.

## A programme's lead on the run their programme names

Each programme's lead does, for their own programme, what an admin does from
the allocation board on: they place its people, staff its groups and publish
them. Everything is reached from the programme's own page, which they
already open; nothing under `/admin/courses` is needed.

### What the lead does, and where

- **Groups tab, People in groups**: the run's allocation board, the same
  board and routes an admin's mount uses. Place, move and remove people,
  send the test and press Publish, with the same test lock and the same
  count on the button.
- **Groups tab, Times**: the times picture.
- **Groups tab, Facilitators**: who facilitates each group, the people who
  said on the form they would like to facilitate the programme, and asking
  them (see "Asking people to facilitate" below). Each group can still be
  changed by hand: the list to pick from is names only, a change emails
  nobody, and somebody added after groups have gone out is told by the next
  press of Publish.
- **Overview tab**: the run's week, each group's session this week and its
  register, what needs attention, who came by week and how many are taking
  part (see "The lead's Overview and Attendance" below).
- **Attendance tab**: every register of the run as one grid, By person or
  By week, read only, with Download CSV. Marking stays with the group's
  facilitators and admins. Under the grid, the notes each group's
  facilitators share (see "A facilitator's week" below), read only. The
  register's own notes, on a person or on a session, are not sent to the
  lead: the register's GET leaves them out for a caller it admits only as
  the lead, and keeps the marks.
- **People tab**: everyone who holds a place on the programme or gave it
  back, with filters and their counts (Everyone, Coming, Haven't said, Not
  said when they're free, Gave their place back, Invited), a search over
  names and degrees, and per person their group, whether they have said they
  are coming and on which day, when they are free as fit marks against the
  run's groups, and where the place stands (with the reason and the day for
  a place given back, and "Left the programme" with the day for somebody who
  left the run). Read only, from `src/lib/applications/people/`. Who holds a
  place is the hand-over's own test, so the tab's number is the times
  picture's and Publish's people; "said they are coming" is one reading
  (`comingReplyOf`) that a facilitator's Home asks too. A row is somebody
  whose application the viewer may open, so the lead meets an invitation to
  somebody who did not rank the programme only once they accept. No email
  address, access requirement, answer or leaver's reason is on it.
- **Applications tab, Offer freed places** (see the next section).
- Everything else a run's track lead may do on the run, through the same
  routes: the run's own applications queue, putting somebody back on the
  run, copying weeks, a note on a material, the retrospective, a group's
  week, the run's email and its week nudge. Their doors under `/learn` stay
  the cohort's; the programme's page is the lead's.

### What stays an admin's

Naming the run and the hand-over (the Settings tab's Course run panel),
adding groups and changing a group's day, time or room (the run editor),
changing a row on the run's own applications page, and correcting a
finished register.

### How it is decided

The lead's power is worked out from the form each time it is used: the
programme whose `runId` names the run, that programme's `leadUid`, and that
account still meeting the bar a lead is appointed behind (an admin or
SU-recognised committee). Nothing is copied onto the run: the run's
`trackLeadUids` stay who an admin named. So a lead who is replaced, whose
account changes, or whose programme stops naming the run has none of it at
the next request, and the new lead has it at once. A lead of one programme
is nobody on another programme's run, and a programme's reviewers gain
nothing. Nothing is deployed for any of this: no rule and no index changes.

### The lead's Overview and Attendance

Both tabs, and the line under the programme's name once the run is under
way ("Running · week 3 of 6", how many are taking part in how many groups,
the day of the last sessions), are worked out on the server from the run's
own records, once, by `src/lib/courses/programmeAttendance.ts`, so every
number agrees between them and the CSV.

- **Who is a row** follows the register: the lead sees the people Publish
  has told; an admin sees everybody placed. Somebody who left (withdrawn,
  or taken off the run) stays listed with the marks they had, only in the
  group whose register marked them; somebody who left before any register
  marked them is nobody's row.
- **"Came"** counts present, late and left early; excused and absent count
  in "of". A mark saved on a register not finished yet counts, drawn with a
  ring. A session the register says did not happen counts for nobody.
- **Download CSV** is logged in the export log before the file is handed
  over, and refused when the log cannot be written. It holds group, name,
  each week's mark in words, "Came" and "Of", and when somebody left: never
  an address or a note.
- **Needs attention** lists what the records say, and each item goes with
  its record: somebody absent at two sessions in a row without saying, a
  week not published that a group has reached, a register not finished
  once its session has ended (with the reminder's and the task's times from
  Course settings and their jobs' switches), and somebody who left. Once the
  run's last session is over it chases nobody's absences, and the
  Attendance grid draws no "in a row": there is no session left to miss.
- **Updates** shows the two newest updates on the run, each with the line the
  Messages tab gives it (who wrote it, who it was to, the day, what its email
  did), and "Write an update". Both lead to the Messages tab.
- **Remind** emails the register reminder to that group's facilitators
  only, after a confirm with the count, and claims the reminder job's own
  marker for each, so a facilitator hears about one register once, whether
  the press or the job comes first. It works while the job is switched off:
  the press is a person's decision. A facilitator who has turned off their
  "Tasks and worksheets" emails is not offered.

## Asking people to facilitate

Boards st-facilitators and st-fac-ask-phone (Q6 option B: "Ask, then
train"). The programme's lead, or an admin, asks somebody who said on the
application form that they would like to facilitate; they get one email and
say yes or no on the site; training is a dated session with a room.

### Who can be asked

The Groups tab's Facilitators view lists everybody whose application said
yes to facilitating and chose this programme or "Either" (read from the
form's own facilitator questions, whatever they are called), with their
answers to those questions and nothing else of the application. The viewer's
own application is never listed. Asking opens once decision day has been
sent. Somebody holding a place on the programme can be asked: a facilitator
can be one of its fellows too, in the group they facilitate (the rule that
nobody facilitates a programme they take part in was lifted on 26 October
2026). Somebody invited to it and not yet answered is asked once they have
answered, and only an approved account can facilitate. Somebody taking part
in another programme can be asked.

### A facilitator who holds a place

A facilitator who holds a place on the run is one of its fellows: a
learner's row in a group, like everybody else's, beside their name on the
group's facilitators. They SIT IN THE GROUP THEY FACILITATE. So every
appointment, by an answer or by hand, asks where the person sits first
(`seatFor` in
`src/lib/courses/groupFacilitators.ts`):

- in that group already: nothing moves;
- in no group yet (handed over and never placed, or taken out of their
  group on People in groups): the appointment places them in that group, in
  the same transaction, as the board's own placement would, and the group's
  count of people moves with them. By hand, the saved sentence names them;
- in another group: nothing is saved. The board decides where people sit,
  so they are moved on People in groups first, or made a facilitator of
  their own group. Asking them for another group is refused before any
  email, with both groups named;
- a group with no room left for somebody it would place saves nothing;
- holding no place on the run: a facilitator's row, as before.

The person asked is never told where staff have placed them: a yes that
cannot be placed is answered with one sentence that names only the group
they were asked about. A yes from somebody holding a place who has not been
handed over yet waits until they have. A row on the run's list that the
application form wrote is placed only by an admin or the programme's lead,
so a track lead adding that person saves nothing. Taking a facilitator off a
group leaves their place where it is.

Everywhere else the hub treats them as both:

- **The board** places them in the group they facilitate and no other, and
  will not move them to another group while they facilitate theirs (the
  refusal's reason is `facilitates-another-group`): change who facilitates
  first, on the Facilitators view, then move them. Somebody made a
  facilitator before anybody placed them has a facilitator's row; the
  board's placement turns it into their learner's row, on the group's clock
  and counted. Their card says "Facilitates Group A", and warns when it sits
  anywhere else.
- **Publish** sends them both of its emails: "placed in a group", which
  names the group's other facilitators and never them (or leaves that line
  out when there is nobody else), and "You're facilitating", which counts
  the group's people as their roster shows them, themselves included. The
  button counts every email.
- **The register** lists them with the group's people. Whoever takes the
  register marks them, a co-facilitator or they themselves while they run
  the session; the lead reads it and marks nothing.
- **Who finished** lists and counts them like everybody in the group, and
  they are sent both certificates once those are built.
- **Their own coursework** is read and reviewed by the programme's lead and
  admins, and by nobody who facilitates, themselves included: one rule that
  every kind of answer asks (`facilitatesOnRun` and
  `readsFacilitatorsOwnWork` in `src/lib/courses/writtenAnswers/access.ts`).
  The lead gives feedback on a written answer from the Attendance tab's
  Written answers card. The summer's review queue and the group page's To
  review leave their exercise answers out for everybody else who
  facilitates, and the review route refuses everybody else's verdict.
- **Leaving and Remove**: while they facilitate a live group of the run,
  "Leave the programme" and "I can't make it" are refused with one sentence,
  their programme page says it where the way out would be, and Remove is
  refused too. The programme's lead or an admin takes them off the group's
  facilitators first (their place stays), and then they leave or are
  removed like anybody else.
- **The hub and Home**: the hub reads the facilitator role off the groups
  that name them as well as off their row, so their run carries both roles
  and Home is the facilitator's Home, with one line to their own week on
  the programme's page. Before Publish tells them their own place, their
  run reaches them as any facilitator's does, with no seat on it.
- **Writing to the group**: the group email and the group notice go to
  everybody in the group but whoever sends them, so a facilitator who holds
  a place is never sent their own message.
- **The week pages** open every published week to them, as to any
  facilitator (they run the sessions), and their own ticks and answers are
  recorded through their learner's row.
- **A run anyone can join**: they keep the session they run. Changing it is
  refused while they facilitate a live group of the run (changing stream
  within it is not); staff take them off the group's facilitators first.

### Asking

"Ask to facilitate…" picks the group and the day and time to answer by,
shows the email as it will read, and holds the ask until "Send a test to
me" has reached whoever is asking for that day and time (another day or time
asks for a new test). The ask emails that one person, from NAISI, replies to
ai-safety@uonsu.com, signed by the programme's lead. It names the group's
weekly time, its room (left out while it has none), its first session and
weeks on its own calendar, its size, the training (left out while none is
set) and the day and time to answer by. It is written whole or not at all:
a group with no day and time, or nothing still to come, cannot be asked for.
An email that fails takes the ask back with it.

"Remind" sends the ask again under a line saying it is a reminder, to that
person only, while the ask is waiting: at most three times, twelve hours
apart. "Ask someone else" asks another person for the same place; whoever
says yes first takes it, and the other ask closes.

### The answer

"Say yes or no" opens `/learn/facilitate/<ask>`, for the person asked,
signed in, and nobody else (anybody else is told the page is somebody
else's). Yes puts them on the group as a facilitator through the same code
the run editor's group card uses (`src/lib/courses/groupFacilitators.ts`),
in one transaction with the answer, places them in the group when they hold
a place and sit in no group yet (above), and records who asked them and when
they agreed in the group's `facilitatorAppointments`. Somebody invited to the
programme answers that invitation before their yes is taken. No is
recorded. After the
day and time to answer by, or once somebody else has the place, the page
says so and nothing can be answered. Nobody is emailed by an answer: groups
going out (Publish) tells the new facilitator their group, as it tells
everybody, and until then they see no names.

### The training

A setting of the run on the programme's Settings tab, for the lead and
admins: a day, a time and a room, all three, or none. There is no default.

### What is kept

`courseFacilitating`, server only: each ask (who, which group, by when, the
answer, the email exactly as it went), the run's training and the last test.
Destroying the run drains it; deleting an account deletes every ask sent to
it, and clears the account's uid where it asked somebody or set the training.

## Updates on a run

An update is a short post to the people on a run: everyone, one group, or
the facilitators. It is kept for them on the site and, with "Also email it"
on, emailed to each of them too. The code is under `src/lib/courses/updates/`
and one route, `/api/courses/runs/[runId]/updates`.

### Who writes, and where

- **The programme's lead and admins**: the programme page's Messages tab.
  To offers everyone, each live group and the facilitators, each with how
  many people it is to. Below the composer, every update on the run, with
  who it was to and what its email did.
- **A group's facilitators**: "Write to Group B (8)" on their group's page,
  which opens the composer for that group alone.
- **A run's track leads** may write as the lead does, through the same
  route; no page offers it to them yet.

### Who reads, and where

- A member of the run reads the updates to everyone and to their own group,
  under Updates on the programme's page, once Publish has told them their
  group. Three show first; "Show older updates" shows the rest.
- A group's facilitators read the updates to everyone, to the facilitators
  and to their own groups. Their group's page lists that group's.
- The lead, the track leads and admins read them all, on the Messages tab.
- Nobody else: not a reviewer, not somebody Publish has not told, not
  somebody who left. An update to one group is never shown to another
  group's people.

### The email

- A notice (docs/notifications.md): it reaches each person whatever their
  course email switch says, and says so at its top. To everyone and to a
  group it goes to the run's cohort list, so somebody who unsubscribed from
  that list reads the update on the site and is not emailed; to the
  facilitators it goes to each one's own address. The suppression list
  always applies.
- The number on the switch and the button is the number the press emails.
  If it has changed by the time of the press, the press is refused with the
  new number and nothing is posted.
- Replies go to ai-safety@uonsu.com. The email carries no meeting link of its
  own; what goes out is the title and the message as typed.
- "Send a test to me" emails the presser alone, marked [TEST], and posts
  nothing. Ten an hour.
- Caps, on counters of their own: three emailed updates an hour per writer
  and audience, ten a day per audience; ten an hour posted without an email.
  The existing "Email the group" and run email composers keep their own.

### What the list says about an email

"Emailed to N" counts the messages handed to the mail service. "N held"
means this copy of the site does not email those addresses (every address on
a staging copy). "Email not finished" means the send began and its result
was never written: the request was cut off part way, so some people may
have it and some may not. The send log in Deliverability says who.

### Deleting

Destroying the run deletes its updates (the dialog counts them as Updates).
Deleting somebody's account leaves the updates they wrote: they belong to
the run and the people they were to. Such an update shows its writer as
NAISI.

## A facilitator's week: the group page, the register and Home

Boards wk-fac-group (and its phone copy) and wk-fac-home-phone. Everything a
facilitator reads about their group is worked out on the server by
`src/lib/courses/facilitatorGroup.ts`, from the records the lead's tabs read
(`programmeAttendance.ts`), so the two never tell different stories.

### The group page, `/learn/[runId]/group/[groupId]`

For the group's live facilitators and admins (the same gate as before).
The head (the group, its week, its programme, its usual day, time and room,
the other facilitators), "Write to Group B (7)" and "Change a session", the
next session as a ticket with how many are expected and "Take the register",
"Your group" with each FINISHED register's mark (a register not finished is
the facilitator's draft and shows nothing here) and who left, last, with the
day, "Registers" with how many came, "To review" (an answer sent and not
reviewed, a row per person per week, each "Review" opening the review queue
on that week), the updates, the pace against the programme, and the notes.
Once every session is over, the ticket's place says there are no more.

Not drawn, though the board draws them: who can't make it tonight (2.4 is
not built) and a facilitator guide (no record holds one).

### The register, `/learn/[runId]/group/[groupId]/register`

The register is a page of its own (board wk-register), behind the register's
own gate. "Take the register" and each register's "See it" lead there. The
grid is the one the group page used to hold. Before Publish has told anybody
their group the page says when the names come.

### Notes for the group's facilitators

`courseGroupNotes`: one document per note (run, group, writer, words, day).
Written only by `POST /api/courses/groups/[groupId]/notes`, and only by a
live facilitator of the group; read only on the server, by the group page
(its facilitators and admins) and the programme's Attendance tab (its lead
and admins). Nobody else, and no browser: the rules refuse every client.
An empty note, or one over 2,000 characters, is refused with a sentence.
Destroying the run deletes its groups' notes (the dialog counts them);
deleting the writer's account deletes every note they wrote.

### Home

For a facilitator: the next session's ticket with how many are expected,
"Take the register", this week's theme and what waits for a review, when
next week's email goes while it is on its schedule (nothing while the push
still sends it), and a line for somebody who left recently, said by name,
until the first session after they left is over. What only the group's
facilitators are told comes from `GET /api/courses/groups/[groupId]/summary`,
behind the group page's gate.

On every day before the day of the group's first session, Home is the board
st-fac-before-phone's instead: the first session as a ticket with "Open your
group", Who's coming, and Say hello (the way to write an update to the group,
with how many it emails, while anybody in it has been told). Who's coming is
the one thing a facilitator sees from applications (privacy policy version
7): each person in the group by first name, and whether they have said they
are coming, read by `src/lib/courses/whosComing.ts` and handed by the summary
only to a live facilitator of the group, only before the first session's
day, and only about the people Publish has told. Never a reason; somebody who
gave their place back is not in it. From the first session's day, Home is the
weekly Home above.

## Changing a session

One week's session of one group can be held online, moved for that week only,
cancelled with the group keeping pace, or cancelled with the rest of the
group's weeks pushed back a week; a changed session can be put back as usual.
The code is `src/lib/courses/sessionChange/` and one route,
`/api/courses/groups/[groupId]/session/change`.

### Who, and where

- **The programme's lead and admins**: the Groups tab's Sessions view, one week
  of the run with each group's session in it. `?week=5` shows another week.
- **A group's facilitators**: "Change a session" on their group's page, which
  lists the group's sessions from today.
- **A run's track leads** may change a session through the same route; the
  Sessions view is the lead's and admins', as the tab's other views are.
- Nobody else. A session that has started cannot be changed: it is the
  register's.

### What each one does

- **Hold it online**: same day and time, the week switched online. Only for a
  group with a join link; the link is on the group's programme page, never in
  an email.
- **Move it**: that week's day (within its week), time and room. A moved
  session meets in its room, so an online switch for that week goes.
- **Cancel it, and keep pace**: nobody meets that evening, the week's reading
  stays open, the next session covers both weeks, and the group finishes when
  it would have (or a week sooner, when the cancelled session was its last).
- **Cancel it, and push the rest back a week**: a "No session this week" break
  goes into the group's own plan where the week was, so it and every week
  after it move back one week, and the group finishes a week later. From then
  on the group keeps its own plan, as after Add break in the pace editor.
- **Hold it as usual** (for a session changed one of the first three ways):
  back to the group's weekly slot and room.

A cancellation is of one evening: if the run is re-dated, or the group
re-paced, so that the week's session falls on another date, the week is held
on its new date.

### Telling the group

With "Tell the group" on (as it opens), the button says how many people it
emails, and the press posts an update to the group through the updates route,
emailed to them as any update to a group is (see Updates on a run): the reason
the group was given and what is now true. If the change went through and the
update did not, the dialog says so and offers to tell the group again. The
reason and a moved room are refused if they hold a link.

The group's programme page shows a cancelled evening as "No session tonight"
(before the day, "No session on Tue 24 Nov"), with the reason and when the
group meets next, until that evening has passed.

### What else follows

- **Next week's email** about a cancelled session says it is off, why, and when
  the group meets next, and leaves out when and where the group meets; the email
  about the session after it says it covers both weeks. A moved session's email
  names its new day, time and room, and an online one says Online.
- **The register chase** skips a cancelled session: no reminder, no task. Its
  register still has a column, which reads Not held and takes nothing, and the
  register's foot is about another session.
- **Everybody's figures** leave it out: the lead's tabs, the stored figures on
  each person's row and their own marks, and Home's attendance reads the week
  as no session.
- **The run's catch-up email** names no cancelled evening.

### Rules

`courseGroups.sessionChanges` is server-owned like `sessionModes`: only the
change route writes it, and no client lane may set it, change it or create a
group carrying it.

## Add to calendar

One private link per person, which their calendar app subscribes to and
fetches again by itself, so a moved, online or cancelled session reaches
their calendar without them doing anything (board st-calendar-phone). The
record is `src/lib/firestore/calendarLinks.ts`; making, finding, replacing
and deleting a link is `src/lib/courses/calendarLink.ts`; what a link's
calendar holds is `src/lib/courses/calendarFeed.ts`; the file is
`src/lib/events/ics.ts`.

### Where people find it

"Add to calendar" is on the session ticket of the programme page and of
Home, for whoever's group the ticket is: a member Publish has told, or one of
the group's facilitators. An online week's ticket carries Join online in its
place. The dialog says how many sessions the link adds and when, and has four
buttons: Apple Calendar (the link's `webcal:` address, which an iPhone or a
Mac subscribes to), Google Calendar and Outlook (each one's own "add a
calendar from a link"; Outlook is Microsoft 365, the university's, and
somebody with a personal Outlook.com account adds the copied link instead),
and Copy the link. Under the board's note, "Get a new link" replaces it.

### What the calendar holds

Every session of every group Publish has told the person about, and of every
group they facilitate, dated as the site dates it, with each week's move,
online week and cancellation applied. A seat counts from the week its owner
joined; a seat that left (by themselves, or taken off by staff) keeps only
the sessions that started before the day it left. A draft or cancelled run, a
run being destroyed and an archived group add nothing, and nothing at all is
shown while the account does not stand.

Each session says its day and time, its programme and group ("AGI Strategy ·
Group B") and that week's room. An online week says "Join on naisi.uk" with a
link to the person's programme page, where Join online is. The meeting link,
anybody's name and anybody's address are never in it. An evening cancelled
through Change a session stays, marked cancelled; a week pushed back moves.
Each session keeps the same id from one fetch to the next, and its sequence
number grows with every change, so a calendar moves the entry it holds rather
than adding a second.

### The link

`calendarLinks/{uid}`: `{ uid, token, createdAt }`, made the first time the
person opens the dialog and the same every time after. "Get a new link"
writes a new token over it, and the old link opens nothing from that moment.
The link is deleted with the person's account.

Every link that opens nothing (never made, mistyped, replaced, deleted, an
account that does not stand) answers the same empty calendar, never a 404:
a calendar app that holds a replaced link keeps its last copy when the link
stops answering, and an empty answer empties that copy on its next fetch. A
failure of ours (the database unreachable) answers 503 with Retry-After, so
calendars keep what they had. The token is never written to a log line.

### How often a calendar looks

The file asks to be fetched again every hour, which Apple Calendar and
Outlook heed. Google Calendar fetches on its own schedule, which can be many
hours, so a change can take that long to reach a Google calendar; the
programme page and the update the group is sent say it first. Nothing caches
the file on the way (`private, no-store`).

### If somebody's link has got out

They open the dialog and press "Get a new link"; every calendar holding the
old one empties on its next fetch. If they cannot open the dialog (they have
left the programme), deleting their `calendarLinks/{uid}` document does the
same.

### Rules

`calendarLinks` refuses every browser, its owner's and admins' included: the
link route shows the owner their link, and the feed route reads it on the
server.

## Offering a place somebody gave back

A place given back after decision day can be offered, on the site, to
somebody who was told "No offer this time" and ranked that programme (see
[docs/applications.md](applications.md), "A place given back after decision
day"). It uses decision day's invitation and its Accept, with an email of its
own, and it is the job of an admin or the programme's lead. A lead who is
not an admin is shown a person's score once their own review of that
application is done, as on every other list of applications.

The window is from the send until the end of week 1 of the course run the
programme names: midnight in London at the end of the last day of the week
its plan numbers 1. The page says the day. After it, nobody new can be
offered a place, and the page and the route say so.

### The order

1. **Take the person who gave the place back off the run**, as above ("When
   somebody gives their place back"). The place is free from the moment they
   reply; this only tidies the board.
2. **Open the programme's Applications tab** and press "Offer freed places",
   under the count of places left. It is drawn once decisions have gone out.
3. **Pick who to offer a place to.** The list is the people told "No offer
   this time" who ranked the programme and whom it pooled, with their score,
   when they are free and which groups they can make. For each one picked,
   choose the group whose time their email names: only groups whose whole
   session they can make, with a seat, are offered.
4. **Choose "Invitations accepted by"**, the day the email asks them to
   accept by. There is no default.
5. **Press "Send a test to me".** The first person's real email arrives at
   your own address, marked as a test. Read it.
6. **Press "Send N invitations".** It is refused until a test for the same
   day to accept by has reached you.
7. **When somebody accepts** (on their own application page, as on decision
   day), press **Hand over** on the programme's Settings tab: it adds only
   who is missing. Put them in the group their email named on the allocation
   board, then press **Publish**, which emails only them.
8. **When somebody says no thanks**, the place is free again: offer it to
   somebody else while the window is open.

### Things worth knowing before you do it

- **The day to accept by is not a wall**, as on decision day: somebody who
  accepts late still has the place. The window closing stops new offers,
  not replies.
- **An unanswered offer keeps its place**, and a seat in the group its email
  named, until it is answered. The page counts both.
- **The daily invitation reminder does not remind a freed place.** Chase it
  by hand if you need to; the page lists every offer and where it stands.
- **An email that did not go** is listed as "Email still to go" with a button
  that sends it. One nobody can vouch for is never sent again: the person can
  still read their offer on their own page.
- **Decision day's page does not change.** It reports what decision day
  sent, so somebody offered a freed place is still under "No offer this
  time" there.
- **Settle the term after the window has closed.** A settled form offers
  nothing, and settling writes each person's record of the term, which then
  says "no-offer, then invited" for somebody who was offered a freed place.
- **Nothing is deployed for any of this.** No rule and no index changes: the
  offer is written by a route onto the person's own application, in a
  collection already shut to every browser.

### What is logged

Each press appends one line to the course log (`courseAudit`, kind
`application-freed-places-offered`), keyed to the form: who pressed, how
many places, on which programme and the day to accept by. It names nobody
offered one. A test leaves no line: it is recorded on the form instead.

## Pitching week

An incubator's pitching week: each person in a group pitches a paper and a
twist, alone or with one partner from their own group, then says which of
their group's other pitches they would join, up to a limit, before their
group's session that week starts. The lead makes teams from that on the
programme's Teams tab (see Teams, below). The code is
`src/lib/courses/pitching/`.

### Setting it up

1. **Tick the week.** In the run editor, open the week, and under Week
   details switch on **This is pitching week**, then save. It is off by
   default and there is no week number anywhere in the code: the run's
   pitching week is the lowest-numbered week ticked. The run editor's
   Pitching week section says which week is ticked, and asks you to untick
   any others.
2. **Set the run's numbers**, in that Pitching week section of the run
   editor: how many pitches a person may pick, the smallest and largest a
   team may be, and the day the teams are made. Each is blank until somebody
   types it, and nothing stands in for a blank one: the sentence it would
   fill is left out. With no pick limit, people can pitch and nobody can
   pick.
3. **Publish the week.** Pitching opens to a group once the ticked week is
   published, and closes, for each group, at the start of that group's
   session in that week, from the group's own calendar: a group that meets
   on another day, or whose session that week has moved, closes at its own
   time. A week the group's calendar cannot date (no start time) never
   opens. Times are London's.

### What people see

- **Somebody taking part** (a live seat in one of the run's groups, told by
  Publish, whose account still stands) sees a card on the programme's home
  from the moment the week is published until the end of their group's
  session day in it, and a page, `/learn/<run>/pitching`: their own pitch,
  their own group's pitches with who pitched each (names only, as the group
  already sees them), "I’d join this" on each, and how many they have
  picked of their limit. After the close, everything on the page is read
  only, and both routes refuse.
- **Nobody is told who picked what.** A person sees only which pitches they
  picked themselves. The programme's lead and admins see how many would
  join each pitch, most first, on the programme's Groups tab under
  **Pitches** (`.../programmes/<programme>/groups/pitches`), and nobody who
  picked is named there. A pick counts while its owner is still in that
  pitch's group, told, with an account that stands.
- **Facilitators, the lead and admins do not take part**: the page sends
  them back to the run's home. A reviewer of the programme is told the list
  is the lead's and admins'.

### Things worth knowing

- **One pitch each.** Saving again changes the one you have. Either person
  on a pitch may change its words; only the one who sent it chooses or
  changes the partner. A partner taken off a pitch may pitch again.
- **The paper** is one of the week's readings, as the group has the week, or
  typed in. The pitch keeps the reading's title as it was when pitched.
- **Copying weeks does not carry the tick.** Copying a curriculum in from a
  template or another run, and a group's own copy of a week, leave pitching
  week unticked: tick it again on the run's week.
- **Somebody moved to another group** after pitching keeps their pitch in the
  old group, and their picks there stop counting.
- **Deleting an account** takes the person off pitching week: a pitch only
  they pitched is deleted, one they pitched with a partner stays the
  partner's, and their name comes off every list of who would join a pitch.
  **Destroying the run** deletes its pitches, and the destroy dialog counts
  them as "Pitches".
- **Nobody is emailed** by any of this.
- **Deploy**: one new rules block, `coursePitches` shut to every browser
  (the routes are the only writers and readers). No index.

## Pathways, cases and talks

A week written as blocks can hold a **Choose one** (packs to read, such as
week 3's pathways) and a **talk** (the case study, given out at the end of
the session before, or a pitch). Who settles which pack a person has is the
week's own (`givenBy`, from the guide's words): each person picks on the
week page, or a facilitator hands the slips out on paper and types the draw
in. The record is `coursePacksAndCases`, one per person per Choose one or
talk; the code is `src/lib/courses/packsAndCases/`.

### Typing in the draw

1. **After the session**, the group page shows the spread for the week the
   group meets next ("Pathways in Group B": each pathway with who has it,
   and who has nothing yet) and links to the draw page, "Change pathways and
   cases" (`/learn/draw/<group>?week=<n>`).
2. **Copy the slips in.** Each person in the group has a row, the group's
   facilitators included (they take part too): their pathway, then their
   case. A case list offers only that pathway's cases. A case with a content
   note is never in a list: it stays out of the draw.
3. **Swaps** go through the group's facilitators: "Swap two people" swaps
   everything two people have; Save keeps it. Changing somebody's pathway
   takes back a case the new one does not offer.
4. **Save** writes only what changed. Nobody is emailed: each person sees
   theirs on that week's page.

### Who sees what

- **The group's live facilitators, the programme's lead and admins** type
  and read the draw. The lead has no link to the draw page yet: open it by
  its address. Nobody else in the group sees anybody's.
- **The person** sees their own pack and case on the week page, their case
  on the programme page's This week card, and their own pack among Home's
  rows to tick.
- **A pick** is the person's work for the week: This week's work's reader
  (`weekWorkOf`) hands it to the group's facilitators, the lead and admins,
  and leaves a facilitator's own pick blank for their co-facilitators. No
  page draws that table yet. A pick can change until the person's group's
  session for that week starts.
- **"Ready for my talk"** is the person's own: no page shows it to anybody
  else. It waits for a case on a case study, and a case changed or taken
  back clears it.

### Things worth knowing

- **Done counts the pack the person has**, ticked as one, and the talk once
  they mark themselves ready; until a pack is given out, the task is not
  done.
- **Somebody who left** is in no draw and is shown nothing; their records
  stay for the lead and admins.
- **Deleting an account** deletes the person's records. **Destroying the
  run** deletes them all, and the destroy dialog counts them as "Packs,
  cases and ready marks".
- **Deploy**: one new rules block, `coursePacksAndCases` shut to every
  browser (two routes are the only writers, and pages read on the server).
  No index.

## Teams

An incubator meets as one weekly group, and its people work in small teams
inside it. The programme's lead (or an admin) makes the teams on the
programme page's **Teams** tab, in one of two ways, moves people between
them, and tells everyone their team by email. The weekly session stays as it
is. The code is `src/lib/courses/teams/` (the record, the making, the words)
and `src/lib/applications/handover/teams*.ts` (who may, the tab, the writes,
the email); the agenda's answers are read by
`src/lib/applications/handover/agenda.ts`.

### Setting it up

In the run editor's **Pitching week** section, by whoever may edit the run
(an admin, a course approver, the run's drafter or its track lead; a
programme's lead who is none of these asks an admin):

1. **Teams are made from**: the pitches from pitching week, or the agenda
   people ranked on the application form. It has no default, and the Teams
   tab makes no team until it is set.
2. **Smallest team** and **Largest team**: teams are made within them. With
   no sizes set, nothing is made.
3. **Teams are made on**: the day the teams are due. The programme's head
   says "Teams by" that day on every tab, and the Teams tab says "You can
   change them until" it, up to and on that day. Nothing locks the teams
   after it: the lead can still move somebody who leaves or joins late.

### Who takes part, and who sees what

- **Taking part** is a live seat in one of the run's groups that Publish has
  told, with an account that stands, the same rule pitching week keeps, for
  an admin too. Somebody placed and not yet told is put in no team, named
  nowhere and emailed nothing. Somebody who leaves, moves to another group,
  or whose account no longer stands drops off their team at once.
- **A team works inside one group.** It is made from the people of one
  group, and a person moves only between their own group's teams.
- **The tab is the lead's and admins'.** A reviewer of the programme is told
  so; the run's track lead, a group's facilitator and the people taking part
  never reach it. People taking part see nothing new on a page: the email
  tells them.
- **What each person ranked** on the form ("1st: Compute governance") is read
  only for the lead and admins, only for a run whose teams come from the
  agenda, and only from an application the caller may read.

### From the pitches

Each pitch from pitching week is listed with how many would join it, who
pitched it and its twist, with **Make it a team**. Pressing it makes a team
named after the pitch, with its project line ("Replicate [the paper], then:
[the twist]"), of:

- the people who pitched it, taken out of any team they were in (a pitch's
  pitchers belong to its team);
- then the people who said they would join it and are in no team yet, the
  ones who picked fewest pitches first, then by name, up to the largest team.

It is refused when the team would be smaller than the smallest, and a pitch
is a team once. Once any team exists, a pitch with none says **Not taken
forward**, and can still be made a team.

### From the agenda

The agenda is the first question that asks for a ranking among the
programme's own question sets on the form (the questions only its applicants
were asked). **Make teams from first choices** (while the run has no team)
makes each group's teams from its own people: in rounds by rank, each item
takes people up to the largest team, the people who ranked fewest items first
where more ask than it has room for, and somebody turned away tries their next
choice; then a team below the smallest is let go, one at a time (the smallest,
then the one fewest put first, then the one fewest ranked at all), and its
people try their next choices. Somebody who ranked nothing, or whose choices
all filled, is left in no team for the lead to place. To make them again from
first choices, remove every team first.

### Changing them

- **Move to…** beside each person is a menu of their group's other teams and
  **No team**. A move may take a team past the largest size or below the
  smallest; the team's card says so.
- **Remove team** puts its people in no team, and its pitch can be made a
  team again.

### Telling everyone their team

- **Send a test to me** first: the first person's email, marked as a test,
  to the address on your own session. Nothing else goes until a test of
  yours has reached you (a test this copy of the site held, or the
  do-not-email list stopped, does not count). Each presser sends their own.
- **Tell everyone their team** says how many people it emails. Each person in
  a team gets their team's name, its project line and their teammates' names,
  never an address, signed with the lead's first name; replies go to
  ai-safety@uonsu.com. The press sends the number back, and is refused with
  the new number if the teams changed under it.
- **Pressing again** emails only the people whose team changed: each email's
  facts (the team, its name and project line, and who else is in it) are
  stored on the team as a fingerprint when it goes, and a person is owed an
  email when theirs would now say something else. So after a move, the person
  moved and the people of the two teams are told again, and nobody else.
  Somebody moved to no team is not emailed.
- A send that fails stays owed and the next press tries it; one held by this
  copy of the site, or stopped by the do-not-email list, is settled. Somebody
  with no address on file is named on the tab and not emailed. One press at a
  time on a run.
- Every email is written before any is sent: one that cannot be written whole
  (a team with no name) stops the press, and nothing goes.

### Deleting

- **Deleting an account** takes the person off every team and off its record
  of who was told; the team stays with whoever else is in it. Their test
  markers go too.
- **Destroying the run** deletes its teams, and the destroy dialog counts
  them as "Teams". The email's markers in `courseNudges` carry the run and
  go with it.

### Deploy

One new rules block, `courseTeams` shut to every browser (the teams routes
are the only writers and readers). No index: every query is one equality or
one `array-contains`. The run's `teamsFrom` rides the run editor's existing
write, and the run's rules cap no key set, so it needs nothing.

## Routes and deadlines

Technical AI Safety's week 6 ends with "Where to go next": routes a fellow
could take next (a sprint, a fellowship, a grant), in two tables, under a
line saying when somebody last checked them. Deadlines pass, so the list is a
record on the course (`CourseDoc.routes`, `src/lib/courses/routes/`), kept in
one place and read wherever it is needed.

### Where it is set

The course's page in the admin area (`/admin/courses/<course>`), the card
"Routes and deadlines". Admins only: anybody else who can open the course sees
the list and that an admin changes it. The card's box holds the list as text
in the guide's own shape; change it there, or paste the guide's section in,
then Read it, check what it found, and Save. "Take them off" puts the guide's
own tables back on the week.

The shape (`docs/course-weeks.md`, "A section of routes"):

- the first line is the day they were checked: "Checked on 25 October 2026.";
- each group is its heading in bold, then its table;
- a table's first column is Route (the route's name as its link), then What
  it is, and, where you want them, Who it suits, Deadline (a day such as
  1 November 2026, or Rolling) and Next round;
- anything after the last table (the guide's line on funding) is kept.

The guide's own tables have no Deadline column, so pasted as they are no
route has a deadline. Add the column for the routes whose round closes on a
known day.

### Where it shows

- **The week that asks for it.** A week whose section has a table with Route
  as its first column (week 6's "Where to go next") shows the course's list
  there in place of what the guide wrote, on every run of the course, for
  everybody who opens the week. Until the course has a list, the guide's
  tables show as written.
- **A route past its deadline says so**: "Closed on Fri 20 Nov", worked out
  from the day it is in London. A route still to close says "Apply by ...",
  a rolling one "Rolling".
- **The facilitators' notes.** "Opportunities to mention this week" is to read
  the same list, leaving out what has closed (`openRoutes`), once the
  facilitator guide is on the site.

### Keeping it true

Around the start of week 6, check each route's own page, change what has
moved, and change the "Checked on" day: it is what a fellow reads first.

### Rules

The field is written only by its route (`/api/courses/[courseId]/routes`,
admins, view-as refused); the rules keep every browser write off it, admins'
included.

## Who finished

Once a programme's last session is over, its lead (or an admin) says who
finished it. The site ticks everybody who came to at least the run's rule,
the lead changes any they disagree with, and a member's own pages say they
finished only where their record says so: everybody else is told the
programme has ended. The code is `src/lib/courses/finishing/` (the record,
the suggestion, the list, the words) and
`src/lib/applications/handover/finishingAct.ts` (who may, and the writes).

### Setting the rule

On the programme's **Settings** tab, the **Who finished** card, for a
programme that names a run: **Came to at least [ ] sessions**, of the
sessions their group held. Somebody whose group held fewer than that while
they were in it (a session was cancelled, or they joined after the start)
meets the rule by coming to every session it held; a group that held none
while they were in it meets nobody's. There is no default: with no number
the site ticks nobody, and the lead ticks people by hand. A number above the most
sessions any of the run's groups is due to hold is refused. It can be set or
changed at any time, before the end or after it. Only the lead and admins are
ever shown it: no member's page and no member's payload carries it.

### What counts

- **Came** is the Attendance tab's own count: present, late and left early,
  on the registers of the person's group, from the week they joined. Excused
  counts in "of" and never as came. A session cancelled through Change a
  session, or a register that says it was not held, counts for nobody, and
  the list says so under it ("Group B met 5 times. Its session on Tue 24 Nov
  was cancelled, and it doesn’t count against anyone.").
- **The end** is the end of the run's last session: the latest end among its
  groups' dated sessions, a cancelled one left out. Before then the Overview
  has no list (its People card says when it can be done), a switch is
  refused, and nobody is told they finished.
- **Exercises** beside each person are the ones set on the weeks their group
  was taught (its own copy of a week where it has one), published weeks only,
  and how many of those they sent.

### The list

It leads the **Overview** once the last session is over, above the rest of
the page: everybody who took part (the lead sees the people Publish told, an
admin everybody placed), fewest sessions first, each with a **Finished**
switch. While there is no rule the sentence over the list says so, and its
"Settings" leads to the rule's card. A switch saves at once. A change is stored only where it disagrees
with the rule, with who made it and when, and is marked "Changed by you" (or
by whoever made it); putting a switch back to what the rule says removes the
change, so a register corrected afterwards still counts for that person.
Somebody who left is listed under **Left the programme** with the day they
left, and has no switch: they are never "not finished". On a phone the list
is a card a row, each switch beside the person's name, so none is behind a
sideways scroll.

A register that is still not finished after the last session changes who
came: Needs attention, lower on the same page, names it.

### What members see

Each member's run home, their card on My programmes and Home ask their own
record (`finishedForMember`): "You finished [course]." and "Finished" where it
says so, "[course] has ended." and "Ended" for everybody else, staff
included. Nobody is told they did not finish, and no page names the rule. The
programme's head reads "Finished · [the last session's day]" and how many
took part, from the moment that session ends.

### Deleting

- **Deleting an account** deletes the lead's decisions about that person; on
  decisions they made about other people, who made them is cleared and the
  decision stays.
- **Destroying the run** deletes its rule and decisions, and the destroy
  dialog counts them as "Who finished".

### Deploy

One new rules block, `courseFinishing` shut to every browser (the two
finishing routes are the only writers, and only the server reads it). No
index: every query is one equality on one field.

## Cutover: membership periods

Membership is a period-per-year object (`membershipPeriods/{periodId}`), and
one of them has to be marked CURRENT before any badge on the site can say
anything. Without that step every membership badge reads "not recorded", which
is indistinguishable from a broken deploy.

So, on each environment, as part of cutover and before anyone looks at a
profile:

1. Open **Admin, Membership** and create the period for the year. The year goes
   in as `2026/27`; the document id is derived (`2026-27`) and the `year` field
   keeps the slash, which is the same string `users.paidMembershipYears` has
   always stored.
2. Set the dates from the SU's membership year, and use the note for anything
   the next admin should know about that year.
3. Press **Make current**. That button is admin-only, and the route refuses
   anyone else: moving the pointer re-badges every member at once.

Then record members: from the table on the Membership page, or from their rows
on the Members tab. The rules need no deploy (every membership collection is
`allow read, write: if false`, which is identical to Firestore's implicit
deny), but the export DOES need one index: `memberships (periodId, tier)`,
which is what the CSV's tier ordering pages on. Deploy indexes before the first
export or it fails with a link to create it.

## Importing the SU list

**Deploy the indexes before the first import.** `firestore.indexes.json`
carries a `fieldOverrides` entry putting a COLLECTION_GROUP index on
`rows.matchedUid`. Firestore builds single-field indexes automatically for a
collection but never for a collection group, so that one has to be declared and
deployed by hand:

```sh
npx firebase deploy --only firestore:indexes --project <default|dev>
```

Without it the import still runs, and so does everything on the console. The
casualty is quiet and later: deleting an account sweeps the import rows that
name that person with a collection-group query, and an undeclared index makes
that query fail rather than return nothing, so the rows outlive the account.
Deploy it on a backend before its first import, not after.

The Students' Union sends a CSV. On **Admin, Membership**, under *Import the SU
list*:

1. Pick the period the list is for, and the tier to use for rows whose file has
   no membership type column (nearly always **paid**).
2. Choose the file or paste it, then press **Read the file**. This is a DRY
   RUN. It records nothing. It reports how many rows matched on a verified
   university email, how many on a sign-in email, how many matched only on a
   name, how many repeated somebody from an earlier line, and how many have no
   account here at all. Most society members have no account, and that is
   normal rather than a fault in the file.
3. Tick each name-only match you are willing to vouch for. They will not commit
   otherwise, whatever the browser sends, and the row records who ticked it.
4. Press **Commit**. It works in chunks of two hundred people and keeps going
   until the list is done, so a six hundred row file is three calls and a
   dropped connection costs you a press rather than the import.

Things worth knowing before you run it:

- **It never overwrites.** A person who already has a membership row for that
  period is skipped with the reason on the row, so a bursary you granted by
  hand this morning survives a list that says they paid. Settle those from the
  table.
- **Running it twice does nothing twice.** Committed rows are stamped, so a
  second press is a no-op.
- **A name matching two accounts is not a match.** It is reported unmatched
  with the reason, because there is nothing for a person to confirm except a
  guess.
- **An import survives closing the tab.** The panel lists every unfinished
  import on the period when it loads, so you can pick one up where it stopped.
  **Abandon** closes one you are not going back to: it deletes no rows and
  takes back no membership already recorded, it only stops the import showing
  as unfinished.
- **An upload that says it did not finish writing its rows** cannot be
  committed. Abandon it and read the file again. It means the dry run died
  partway through, so the row count on it is a promise the rows did not keep.
- **An alumni row will not take away a badge it cannot account for.** If
  somebody's account says they were a member this year and there is no
  membership row behind that, the row is skipped with the reason rather than
  quietly stripping it. Settle those from the Members page.
- **If a commit says the totals could not be moved**, the memberships were
  still written and only the four counts above the table are behind. Press
  **Recount** on the Members card: it counts the membership rows and rewrites
  all four.
- **Deleting an account deletes its import rows** and keeps the batch, which is
  the provenance behind every membership that import recorded.

## Exporting the membership list

**Export CSV** on the Membership page. Every export is recorded: who took it,
which period, how many people were in it, and the filename. If that record
cannot be written the export is refused, so a file never leaves without a log
line behind it. Say so if anybody asks why the button failed.

## Destroying an admission round

Cancelling is the normal way to end a round, and it is the one to reach for
first. It is a status on the round, it stops the form and the reminders, and it
keeps every application, every review and every decision readable as history.
Nothing about a cancelled round is lost.

Destroying is the other thing. It removes the round, its stages, every
application made to it with the access-requirements answer filed beside it, and
every review written about those applications. It is for a round created by
mistake, a test round on a dev backend, and data somebody has decided must not
be retained. It cannot be undone.

**The member record is written first.** Before anything is deleted, each
applicant gets an entry at `memberRecords/{uid}/applications/{roundId}`: when
they applied, what for, the outcome, the score summary and the reviewers' notes
as plain text. That record hangs off the person, so it survives the round, and a
later application can be read with the history in view. If any one of those
writes fails the destroy REFUSES and nothing is deleted, naming the applicants
whose record could not be written.

Settling a round writes the same records, so in the normal case every entry
already exists and the destroy writes nothing. It fills gaps and it never
rewrites an entry that is already on file, which matters for one specific
reason: an entry's reviewer notes are built from the reviews that exist at the
moment it is written, and deleting an account deletes the reviews that account
wrote. Rewriting a settled entry could therefore drop a departed reviewer's
assessment that had been safely kept. So "0 member records written" on a
destroyed round that had settled is the healthy answer, not a sweep that failed
to run.

How to run one, on Admin, Admissions, the round's own page:

1. Move the round out of **Open** or **Deciding** first. The destroy refuses
   both, and the refusal says so: an intake somebody can still apply to would
   lose an application mid-sentence, and a round mid-decision has decisions that
   are not on anybody's record yet.
2. Open the **Danger zone** at the foot of the page. It reads a live manifest:
   how many applications, private access-requirements rows, reviews and stages
   will go, how many member records the destroy guarantees are on file first,
   and how many people lose the Admissions entry in their sidebar.
3. Type the round's label exactly. The check is byte-for-byte and nothing is
   trimmed. A round with no label cannot be destroyed until it is given one.
4. Press it and leave the dialog open. A large round takes more than one pass;
   the dialog repeats the call itself and shows the running total.

Things worth knowing before you do it:

- **Nobody is emailed.** Not the applicants, not the reviewers. If somebody is
  owed an explanation it is a conversation to have, not a template.
- **Admins only.** An `approveCourse` holder authors rounds and can see this
  page, but the two routes behind the danger zone refuse anybody else.
- **The runs are untouched.** A round feeds course runs, and the runs outlive
  it. Somebody sitting on a cohort keeps their place when the intake that put
  them there is destroyed.
- **People an application form handed over to a run, and who are not in a
  group yet, are then told they are on nothing.** Their rows stay on the
  run and the board still places them, but until each is in a group their
  member area knows they hold a place only from the application the destroy
  removes. So Home and the list of their programmes say "not on a programme
  yet" to them until they are placed. Put everybody in a group before
  destroying a form whose people are on a run ("Placing a term's accepted
  people on a course run").
- **Two logs survive.** `emailSends` (what was sent to whom) and `dataExports`
  (which spreadsheets were downloaded, and by whom) are append-only records that
  outlive what they describe. The manifest counts both and marks them kept.
- **The Admissions sidebar entry disappears for some reviewers.** The flag
  clears for anybody this round named who is named on no other round. It is a
  nav hint and nothing else, so a person who is appointed again gets it back.
- **An interrupted destroy resumes, and the round is frozen until it does.**
  Every attempt opens a row in `destroyAudits` before anything dies, and a row
  with no `completedAt` is a destroy that stopped. The round's page shows it on
  the next visit and offers to carry on; the fact of the destroy, who ran it and
  what it removed outlive the data either way.

  A round that is part way through a destroy also carries a marker, and while it
  is there the status control refuses every move with a sentence saying so. That
  is deliberate and it is the only case where a round will not budge: half of it
  is already gone, its status still says whatever it said when the destroy
  started, and reopening it would take applications that finishing the destroy
  would then delete. The only way forward is to resume, and the marker
  disappears with the round.
