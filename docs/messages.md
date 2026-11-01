# Messages: who a message is for

A message to chosen people (an event for some people, a note to everybody
facilitating this term) starts with one question: who is this for? This file
is the reference for the one picker every such send shares, "Who is this
for?", and for the resolver behind it (built November 2026). The picker sends
nothing. A send that takes its people from it resolves the same choice again,
with the same code, when it sends, so the number the writer reads beside the
button is the number sent.

The code is `src/lib/audience/`; the picker is
`src/features/audience/WhoIsThisFor.tsx`. Nothing on the site sends with it
yet. So it can be tried, the mailing list page (`/admin/subscriptions`, admins
only) carries it at the foot, closed until opened, under "Who would a message
reach?", with nothing to send.

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
programme whose people get the notice when the send is part of a programme,
so everybody else the writer runs goes by their settings.

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
   selection, { policy, row, mode })`. It refuses a tag the writer may not
   use, reads the guests' own subscriptions when a message by settings would
   ask them and the suppression list for every address it would try, and
   answers each person's class, addresses and left-out reason.
3. Send to the people with no left-out reason, one message per address,
   through the lane their class names. Count what the button says from the
   same resolution.

`tests/send-recipient-scope.test.mjs` fails a file that can send and takes
people from the picker without going through `resolveAudience`.
