# Messages: who a message is for, and the composer

A message to chosen people (an event for some people, a note to everybody
facilitating this term) starts with one question: who is this for? This file
is the reference for the one picker every such send shares, "Who is this
for?", for the resolver behind it, and for Messages, the composer that sends
with it (both built November 2026). The picker sends nothing. A send that
takes its people from it resolves the same choice again, with the same code,
when it sends, so the number the writer reads beside the button is the number
sent.

The picker's code is `src/lib/audience/` and
`src/features/audience/WhoIsThisFor.tsx`. Messages is `/messages` (Write,
`src/app/(app)/messages/page.tsx`) and `/messages/sent` (Sent),
`src/features/messages/`, `src/lib/messages/` and `src/app/api/messages/`;
its own section is [Messages](#messages) below. An event for chosen people's
invitation takes its people from the picker too: [Events for chosen
people](#events-for-chosen-people) below. The mailing list page
(`/admin/subscriptions`, admins only) also carries the picker at its foot,
closed until opened, under "Who would a message reach?", with nothing to send.

## Tags

A writer adds tags to include people and leaves people out with the minus
sign on a tag (−, U+2212). Somebody in an included tag and a left-out tag is
left out. People can also be named one by one.

**A tag is a sentence about records, never a stored list.** Each is worked
out from the records every time it is read, for the current term, so somebody
who joins a group tomorrow is in its tag tomorrow. The term is the one This
term in numbers reads (`chooseTerm` in `src/lib/surveys/term/choose.ts`): the
form whose decision day went out most recently, or before any has, the one
that opened most recently. Its events are the published events that start
from the day its form opened.

| Tag | Who is in it |
| --- | --- |
| Applied | everybody whose application on the term's form was sent and is still in the term (`isInTerm`) |
| Holding a place | everybody holding a place on one of the term's programmes (`placeHoldersOn`, the hand-over's own test), whether or not Publish has told them their group yet; nobody until the term is marked as sent |
| Facilitating | the facilitators of the live groups of the term's programmes' runs, each held to the bar they were appointed behind |
| Leading | the term's programmes' leads, held to their bar |
| Invited, not answered | told an invitation and not answered it |
| A programme: everyone, holding a place, facilitating | the same, for one programme; everyone is its people, its facilitators and its lead |
| A programme's group | the people Publish has told are in it. A group has a tag only once its run's allocation has been published. Somebody who left the group is listed as having left and is never written to |
| Came to, Signed up, Didn't come (each of the term's events) | who the Check-in tab records as having come, a walk-in with no account included; whose sign-up is waiting, confirmed or on the waiting list (never a test sign-up); and who held a confirmed place at an event that has ended, whose door was opened, and did not come |
| Subscribed: Newsletter, Event announcements | every row on the list that is confirmed and subscribed, accounts and guests |
| Committee, Admins | the committee (admins included) and the admins |
| Technical, Governance | the admin-set `tracks` |
| A person by name | one approved account |

Ids are plain strings (`src/lib/audience/tags.ts`), so a selection travels in
a request and can be kept by a send. The term's tags and a programme's carry
the form they are about, because a programme's id is reused from term to
term: a selection kept from last term reads as a tag that is not there any
more, rather than quietly meaning this term's people.

**One person, once.** An account is its uid. A guest who signed up without an
account is their address, so the same guest at two events is one person, and
a guest whose address is an account's own is that account. A walk-in with no
account is their check-in.

## Who may use which tag

One table, `src/lib/audience/scope.ts`, asked by the list of tags a person is
offered, by both routes, and by every send that will take a selection:

| Who | Tags |
| --- | --- |
| Admins | every tag |
| SU-recognised committee | each event's Came to and Signed up; Committee and Admins; a person by name |
| A programme's lead | that programme's tags and its groups' |
| A facilitator | the tag of each group they facilitate |
| Admins only | the term's own tags, the two lists, Didn't come, and the tracks |

A pending or rejected account uses no tag. Who leads and who facilitates is
read from the records and held to the bar the role is appointed behind
(`isNamedWithStanding`). The tags a person may use are exactly the people
whose names they may already read: who came is for the people who run
check-in (`runsCheckIn`, the privacy policy's "Coming to an event"), the
roster and its names for the people the `users` rule admits, a programme's
people for its lead, a group's for its facilitators.

A tag the person may not use, or one that has gone, refuses the whole
request. Nothing is resolved, and nothing about who exists is said.

## How it would be sent

Two of the three classes in [notifications.md](notifications.md); a
transactional email answers something the person did, and is never a message
somebody writes to a list.

- **Programme notice** when every tag included is about running a programme
  (holding a place, facilitating, leading, a programme's own tags, a group,
  or a person named one by one) and the writer runs everybody it reaches. An
  admin runs every programme of the term; a programme's lead runs the people
  holding a place on it and its facilitators; a facilitator runs the people
  Publish has told are in their group. A notice reaches people whatever their
  settings say. A tag about an event, a list, a role or a track is news, not
  running a programme, whoever happens to be in it.
- **By their settings** otherwise. The writer chooses one row of the settings
  grid the send reads, never a mix of two: the newsletter, event
  announcements or course announcements (`GridRow` in `kind.ts`). The tags
  suggest one (an event's tags suggest event announcements, the newsletter's
  list the newsletter, anything else course announcements). An account is
  asked through `wantsCategory` and addressed through `addressesForSend`, the
  event announcement's own reading; a guest's yes is their own subscription
  to that row's list, and no guest has course announcements to say yes to.

A send that decides person by person (an event's invitation, a notice to the
programme's people and everybody else by their events row) asks the same
resolver with `policy: "per-person"`; each person it reaches carries the
programmes the writer runs them under, and `noticeUnder` names the one
programme whose people get the notice when the send is part of a programme:
the people the writer runs under it who HOLD A PLACE on it (the world's
`holds`), which is what the privacy policy means by "a programme you are on".
Its facilitators and its lead are run by the writer and are not on it, so
they go by their settings, as does everybody else.

**The writer is included when they match**, and the count says "including
you".

## Left out, and why

| Reason | When |
| --- | --- |
| Didn't say yes to the row | by their settings, and the chosen row is off for them |
| Left the programme | they left a group whose tag is included |
| Came without signing up | a walk-in with no account: the address they left is only for the event's survey (privacy policy, "Coming to an event") |
| No email address on record | no address the class may use, or an account that is gone |
| Their address bounced or marked us as spam | every address they have is on the suppression list |

The count is everybody it reaches; "N will be emailed · M left out" splits it.

## The routes

They read, and write and send nothing. They answer every approved account:
a member who leads and facilitates nothing is offered nothing.

- `GET /api/audience`: the caller's tags, grouped as the picker lists them,
  each with how many people are in it; the people they may name one by one
  (admins and SU-recognised committee only); the rows a message by settings
  may read.
- `POST /api/audience` with `{ include, exclude, row }`: how many it reaches,
  how many would be emailed, how many left out and why, and how it would be
  sent. Counts only.
- `POST /api/audience/who` with the same body: See who. A name per person,
  whether it is the caller and whether they would be emailed. Why one person
  is left out is said by name to admins alone; everybody else reads the
  reasons as counts.

No answer carries an address, and See who carries no account id
(`tests/audience-picker.test.mjs`). A view-as session is answered as the
member being viewed would be, because what a member is offered is the
question view-as exists to answer; the tree is registered with the view-as
guard so a route that writes cannot be added beside them unguarded.

## For a send that uses it

1. Load the writer's world once: `loadAudienceWorld(db, writer, now)`.
2. Resolve the selection the writer chose: `resolveAudience(db, world,
   selection, { policy, row, mode, noticeUnder })`. It refuses a tag the
   writer may not use, reads the guests' own subscriptions when a message by
   settings would ask them and the suppression list for every address it
   would try, and answers each person's class, addresses and left-out reason.
3. Send to the people with no left-out reason, one message per address,
   through the lane their class names. Count what the button says from the
   same resolution.

`tests/send-recipient-scope.test.mjs` fails a file that can send and takes
people from the picker without going through `resolveAudience`.

## Messages

Two halves, Write and Sent, as two pills under the title. Write is one
composer for writing to people: who it is for (the picker), a subject and a
message, "Send a test to me", and "Send to N people". It sends email, and a
notice to one group or one programme's people goes to phones as well, as the
run composers it took over did ([The push](#the-push)). Sent is what was
sent, and who it reached ([Sent](#sent)).

### Who writes

Admins, a programme's lead (their programme) and a group's facilitator (their
group): `messageWriterOf` in `src/lib/messages/writers.ts`, from the same read
of the term the picker makes (`loadTermRoles` in `src/lib/audience/load.ts`),
so the page, the routes and the picker agree about who runs what. A lead is
held to the lead's bar and a facilitator to the facilitator's
(`isNamedWithStanding`); a facilitator writes once their run's allocation has
been published, because a group has no tag before then. Which tags each may
use is the picker's scope table, asked again of every tag on every count and
every send. Somebody who may use some tag and runs nothing (an SU-recognised
committee member with the term's events) is not a writer here.

The menu draws Messages (Run NAISI) for an admin, and for anybody else when
`GET /api/messages` says so: who leads and who facilitates is in the records,
not on the session, so the shell asks once when it opens
(`src/features/messages/useWritesMessages.ts`). The route spares a member who
is neither the term's reads: a lead is named on a form, which flags the
account (`users.admissionsReviewer`, the flag behind the Programmes entry),
and a facilitator is named on a group, which one query on their own uid finds.
The flag and the query draw a link and decide nothing; the page and the routes
ask the records again. Anybody else who opens `/messages` by its address reads
one line saying who it is for.

### How it is sent

The picker's rule, for the whole send, never a mix: a **programme notice**
when every tag is about running a programme and the writer runs everybody it
reaches, otherwise **by their settings**, reading the one row the writer
chose (or the tags suggest): the newsletter, event announcements or course
announcements.

- A notice goes through `sendNotice` on the `messages` surface: one message
  per person, the marker above the body ("you hold a place on a programme or
  help run one"), no unsubscribe link, whatever their settings. It goes to the
  account's own address, or else a university address they verified: the
  rule the group email and an update to the facilitators address a person
  by (`ownAddressFor`), and not the cohort row's address that
  `resolveNoticeAudience` prefers for a run's notice. A message in Messages is
  addressed to a person rather than to one run's list: it can reach people on
  several programmes, and facilitators and leads, who have no cohort row, and
  a notice is never read off a list. So one rule for every person it
  reaches, and it needs no read beyond the account the picker already holds.
  Somebody whose cohort row holds another address gets a Messages notice at
  their account's address, and the run composer's notice at the row's.
- A message by their settings goes through `sendEmail` (`kind: "message"`),
  one message per address the row routes the person to (an account through
  `addressesForSend`, a guest to the address on their own subscription to
  that row's list), with a line at its foot saying which row it read and the
  link that unsubscribes them from that row, and the RFC 8058 headers. An
  account's link names the account, a guest's their address.

The email is the staff email's own blocks (`staffMessageBlocks`): the message
as typed, escaped, then "Sent by" and the writer's name
(`src/emails/MessageEmail.tsx`). Replies go to the society's inbox.

### The push

Two messages in Messages also go to phones, because each is a send that
pushed on a run's pages before Messages took it over, through the notice
lane's push door (`sendNoticePush`, which reads no preference):

| A programme notice whose one included tag is | It was | Its notification |
| --- | --- | --- |
| a group's | the group email (`POST /api/courses/groups/[groupId]/email`) | the group's name, opening the group's page |
| a programme's people: its everyone, or its people holding a place | "Email the whole cohort" sent as an important notice (`POST /api/courses/runs/[runId]/email` with `asNotice`) | the course's title, else the run's label, opening the run's home; for a programme that names no run, the programme's name, opening the person's programmes |

People left out of the tag or not, the subject is its words, and it goes to
each person the message reached with an account and to each whose every
address bounced (a bounce is a fact about an inbox, not a phone), never to
the writer. `pushTargetOf` in `src/lib/messages/pushTarget.ts` is the rule,
asked by the route and by the composer, which says so above its buttons;
`pushNoteFor` in `src/lib/messages/pushing.ts` works out what the
notification says, from the term the writer's gate read and one read of the
run. The send answers `pushed`, the notifications a device took, and its
record keeps it (`counts.pushed`). Nothing else in Messages pushes: a message
by their settings, a notice to two tags, to the term's people or to a
programme's facilitators alone, is email alone.

### The send, whole or not at all

`POST /api/messages` with `{ include, exclude, row, subject, message, count,
post }`. Every refusal comes before anything is written or sent, in this
order: view-as; the session; an account that is not approved; the body; the
writers' gate; a tag the writer may not use (the picker's own refusal);
nobody to email; a `count` that is no longer the number the send would email
(409, with the new number, and the composer has the picker count again); over
300 emails, counted in messages since a member's settings can send to two
addresses, refused whole and never trimmed; a post the choice or the writer
cannot make; no test of these words that reached the writer (409); and the
caps. Only then is the record written, the update too when it is posted, then
the emails, then what they did, on both.

- **The count is a promise.** The send resolves the choice with
  `resolveAudience` and the options the picker's count uses, so the number on
  the button is the number sent. The writer is among the people when they are
  in the tags, and the count says "including you".
- **A test first, as Publish waits for one.** "Send a test to me"
  (`POST /api/messages/test` with `{ subject, message }`) sends the message,
  its subject marked "[TEST]", to the address on the writer's own account,
  with no marker and no unsubscribe link (`kind: "message-test"`). One that
  reached them records a fingerprint of the words in the estate's send
  bookkeeping (`courseNudges/messagetest__<uid>`), and the send waits for a
  test of exactly the words it is sending: changing either needs another.
  One this copy of the site held, or one to a suppressed address, reached
  nobody and is not recorded. Ten tests an hour.
- **The caps** are the notice lane's, claimed in one transaction for every
  send, notice or not: three an hour per writer and audience, ten a day per
  audience whoever writes. The audience is the choice of tags, spelled in one
  order and hashed, so the same tags are one audience.
- **Suppression** applies twice: the picker leaves out somebody whose every
  address is suppressed, and `sendEmail` drops a suppressed address on the
  way out. On a copy of the site that may not write to an address (staging),
  the message is held and counted as held.

### "Also post it on the programme's page"

A message to one programme's people can also be kept on the programme's page,
as an update (`courseUpdates`), so the people it is to keep the programme's
list of updates. It is offered when the choice is exactly one tag, with
nobody left out, and that tag is one an update can be to on the run the
programme names: the programme's everyone or its people holding a place (an
update to everyone), its facilitators (to the facilitators), or one of its
groups (to that group). The send asks the updates route's own gate again
(`mayPostOn` in `src/lib/messages/posting.ts`) before anything is written,
writes the update with its email unsettled, and settles it with what the
emails did. It is on by default.

A programme's Messages tab links to Messages set to that programme
(`/messages?for=<the programme's everyone tag>`), drawn only when Messages
would start with it for the person reading. The tab's own update composer
stays beside it for now ([The old composers hand
over](#the-old-composers-hand-over)).

### What a send keeps

`messageSends/{id}` (`src/lib/firestore/messageSends.ts`), server only, every
browser refused in `firestore.rules`: who wrote it, the tags with the words
the writer saw (and their ids as plain strings, `tagIds`, so a send can be
found by a tag it was for), the class and the row, each person it reached by account id
(a guest or a walk-in as no account) with how a message would reach them, why
they were left out and what became of their email, the counts, how many were
left out for each reason, the subject, the update it was posted as, and when.
Never an address and never the message. Like the email log, it is kept when an
account is deleted.

### Sent

`/messages/sent` (`src/lib/messages/sent.ts`, drawn by
`src/features/messages/SentList.tsx`): what was sent, newest first, two weeks
at a time in London days ("Earlier" and "Later" step a fortnight,
`?until=<day>`). Each send says when, its subject, what it was and who sent
it, a message's tags, how many it reached, and behind See who the names.

**Who reads it**: the people who write in Messages (`messageWriterOf`, Write's
own gate), each only the sends to people they may write to. Anybody else who
opens it reads Write's line about who Messages is for.

| Reader | Reads |
| --- | --- |
| An admin | every message written in Messages, and the site's other sends from the email log |
| A programme's lead, a group's facilitator | a message written in Messages when every tag in it, included or left out, is one the picker's scope table lets them use now (`maySeeSend`, the question the send asks of every tag): a message to the people they run, whoever wrote it. Nothing of the email log |

**Who it reached**, by name, by the site's one rule for the person reading
(`nameForViewer`): the committee and admins see the full name, a facilitator
the name people go by. A person named one by one is named for the reader,
not as the writer saw them. Somebody with no account (a guest, a walk-in) is
a count. Why somebody was not emailed (left out, held, bounced, cut off) is
said person by person to an admin alone (`seesReasonsByName`); everybody else
reads who was and was not emailed, and the reasons as counts, as See who
does. No address and no account id reach the page.

**A message from Messages** is read from its record (`messageSends`), so it
says who was left out and why. One whose record never settled says it
stopped before it finished, and counts what it was to email.

**The site's other sends** are read from the email log (`emailSends`), for
admins: one send for the rows of one kind, surface, sender, reference and
subject sent within half an hour of each other. The log records nobody it
left out, so these say who they reached and what became of each email
(emailed, bounced or marked as spam, held on a copy of the site that may not
write to them, or on the do-not-email list); an address the log holds is
matched to an account to name it, and one no account holds is counted. A send
is a message to people: the newsletter, an event's announcement, every notice
surface but Messages' own, and the course mail that came before the notice
lane. Mail that answers something one person did or is about their own
application, place, work or certificate, every test, and Messages' own rows
(read from the record instead) are not listed; the admins' Email delivery
page lists every email. Which kind is which, with why, is `src/lib/messages/sentSenders.ts`,
held to every kind and surface the log can hold by `tests/messages.test.mjs`.
A window holds at most 3,000 rows of the log, and the page says when it held
more.

Every read is one range on one field ordered by it, or documents by id, so
none needs a declared index. An admin's read of the names is every account
(the log names people by address); anybody else's is the accounts their
sends name.

### The old composers hand over

Messages does what a run's two email composers did, so their ways in open
Messages, set to that audience, wherever Messages would start with it for
the person reading (the list `?for=` is held to, `postTargetsOf`), and keep
their old page anywhere else (`src/lib/messages/handover.ts`):

| Way in | Opens |
| --- | --- |
| "Email the group" on a facilitator's group card on a run's home | Messages set to the group (`group:<id>`), whose notice pushes as the group email did |
| "Email the whole cohort" on a run's home and on the first group card | Messages set to the programme's people holding a place, whose notice pushes as the cohort email's important notice did |

Anywhere else: a run of an earlier term, a group whose run has not been
published, a run its programme no longer names, and somebody who staffs a run
without leading its programme (a track lead or a run facilitator), whom
Messages does not offer the programme's people. There the run's own email
pages stay the way in. The run's own pages (`/learn/[runId]/email`, a group's
email and update pages, and the group page's "Write to Group B", which opens
its update page) are left as they are for now. The room notice and the event
broadcast keep their own places: they belong to a session and an event.

A programme's Messages tab keeps its update composer under "Write in
Messages" for now. Its updates reach the people Publish has told their group
(`resolveNoticeAudience`), and a message in Messages to the programme's
people holding a place reaches everybody holding one, told or not; the stage
two journey (`tests/course-hub-stage-two-journey.test.mjs`) pins the
composer's counts at every moment of a term, so the composer goes when that
journey follows the lead's updates into Messages.

## Events for chosen people

The event editor's "Who’s it for" step offers three choices
(`src/lib/events/reach.ts`): anyone, people with a NAISI account, or only
people you choose. The third draws the picker, in a mode that counts and
names people and leaves how they are reached to the step (`peopleOnly`):
an invitation has its own rule, so the picker's own emailed and left-out
lines would describe another send.

- **The choice is kept as tags**, never a list (`eventAudiences/{eventId}`,
  `PUT /api/events/[id]/audience`), in the name of whoever chose it, and is
  resolved in THEIR world whenever it is read: by the editor's count, by
  Publish and by "Invite the N new since". An approver's press invites
  exactly the people the organiser counted, and a choice whose maker can no
  longer use its tags invites nobody and refuses to publish.
- **Who may choose:** whoever may edit the event in its state, with the tags
  the table above gives them. "This event is part of <programme>" is offered
  for a programme the person leads, and for any of the term's to an admin.
  Once an event is part of one, anybody saving the people keeps it, and only
  that programme's lead or an admin takes it off. A notice goes only to people
  the chooser runs under that programme, so somebody who saves the people
  without leading it invites everyone by their settings, and the step's count
  says so.
- **Who is invited:** every account the choice reaches. A guest or a walk-in
  has no Home and could not open it, and somebody who left a group is listed
  as having left: neither is invited, and the step counts both.
- **How each is emailed:** a programme notice to the people holding a place
  on its programme when it is part of one; everybody else by their event
  announcements row; the author never. `src/lib/events/invitations.ts` is the
  one plan, so the step's numbers, the Publish confirm and the send agree.
