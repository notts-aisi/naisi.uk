# Firestore rules tests

Executable tests for `firestore.rules`, run against the local Firestore
emulator. Offline, no credentials, cannot reach dev or production.

```sh
cd scripts/rules-tests
npm install     # first time only
npm test
```

Requires a Java runtime for the emulator (`brew install --cask temurin`).

## Why this is a separate package

`@firebase/rules-unit-testing` and `firebase-tools` are **not** in the root
`package.json` on purpose. App Hosting's Cloud Build runs `npm ci` **with
devDependencies** on the critical path of every production deploy, so a heavy
test-only dependency there is a deploy-time liability. Nothing in this
directory ships.

## Why it exists

`firestore.rules` decides what every client read and write may do. This suite
loads the committed rules into the emulator and runs reads and writes against
them as different users. The e2e harness in `scripts/e2e/` does not stand in
for it: it seeds through the Admin SDK, which bypasses rules entirely.

**The Auth emulator is permanently out of scope.**
`@firebase/rules-unit-testing` fakes auth tokens in-process with no emulator at
all. The suite starts the Firestore and Storage emulators and no other.

## What the suites cover

**`rule-regressions.test.mjs`** covers four groups of rules and the
signed-out baseline. The refusals are paired with controls proving the
legitimate flow still works, so a green run is not just "everything is denied".

- **Events update is scoped per document and per status.** A member holding
  `draftEvent` cannot approve their own event, edit or cancel somebody else's,
  or pull their own published event back to draft, and an approver cannot edit
  a published event from the client. A drafter can still send their own event
  for review, an approver can still approve somebody else's, and a named
  collaborator can still edit the event they were added to.
- **The announcement queue's state fields are the server's alone.** An author,
  a collaborator and an approver are each refused a write to the queue's state
  or its result, and an ordinary edit to an event that carries those fields
  still saves.
- **Activity-log create gates on the parent task**, as the sibling comments
  subcollection does. An account that cannot read a task cannot append to its
  activity log, a write into a task id that does not exist is refused, and a
  completer can still append to their own task.
- **Consent records are server-authoritative.** A member cannot change their
  own `policyVersion` or set `policyAgreedAt` to a time of their choosing,
  cannot grant themselves `role` or `suRecognised`, and cannot write
  `profile.uniEmailVerifiedAt` or carry a stamp across a university-email
  change. The registration retry can still re-stamp consent with the server's
  clock, an admin can still write the consent fields, and a member can still
  edit their ordinary profile fields.
- **The signed-out baseline.** A signed-out visitor cannot read or list
  `users`, and cannot read `config/`.

**`public-config.test.mjs`** — the two world-readable collections behind the
site-notice feature. Asserts the notice is readable signed-out, that **nobody**
can write either collection from a client (admins included — all writes go
through `/api/admin/site-notice` on the Admin SDK), that `publicConfig` is
pinned to its single doc id so `list` cannot enumerate a future doc dropped
beside it, and that `config/siteNoticeAudit` — which records *who* flipped the
notice — stays unreadable.

**`storage.test.mjs`** covers `storage.rules`, the second rulebook, which is
deployed with its own command (`firebase deploy --only storage`). The rules
read the actor's role from Firestore, so these tests seed Firestore and
exercise Storage together. Folder by folder they assert who may read, who may
write, and which content types and sizes are accepted:

- `newsletter-images`, `application-emails`, `course-images` and
  `source-materials` are readable signed-out and writable only by the
  permission or role each one names.
- `event-images` is scoped per event and `worksheet-images` per worksheet or
  circulation, matching `firestore.rules`.
- Task attachments follow the task document, `suRecognised` included, and are
  not publicly readable.
- `worksheet-uploads` takes no client write at all, and another recipient, a
  committee member outside the circulation's staff and a signed-out visitor
  cannot read a file there.
- A path no block matches is denied, even for an admin.

Every image folder refuses SVG in every spelling of the content type, and a
guard reads `storage.rules` itself so that a folder added later cannot leave
that refusal out.

**`client-queries.test.mjs`** (with its data file `client-queries.registry.mjs`)
checks the two layers AGREE: every read `src` issues through the client SDK is
allowed for the people the page issuing it admits. Firestore judges a `list` or
a `listen` on the query's SHAPE rather than on the rows it returns, so a query
whose shape could match a forbidden document is refused wholesale, with an
empty collection and no error anybody sees, and never for an admin, whose
branch of every rule is resource-independent.

The suite scans `src` for every read, matches each one BOTH ways against the
registry (an unregistered read fails with its file, line and shape; an entry
matching nothing fails as stale; a shape the scanner cannot resolve fails
unless an entry writes down the shapes it can take), and then runs every
registered query against the emulator as every persona the entry names:
signed-out, pending, member, non-SU committee, SU committee, admin, and the
`permissions` variants where a surface is gated on one. Count aggregations are
judged on the same shape as the equivalent list, so the three
`getCountFromServer` sites are proven with a `get()` of the identical query.
Four named cases pin particular reads: the `/profile` subscriptions listener,
`RoundEditor`'s `courseRuns` list, the member run-list control in
`admissions.test.mjs`, and the registration reads, which run as an account
that has no `users` document yet.

Adding a client-direct read now means adding an entry: name the gate the caller
sits behind, and give every persona an outcome. If a persona who can reach the
page comes back `refused`, that is a finding to raise rather than a line to
write down and move past.

## Gotchas that cost real time

- **Any test touching Storage must use the namespace `"test"`.**
  `storage.rules` resolves its `firestore.get()` lookups against the project
  the *emulator* was started with, not the one the client connects as. With a
  mismatched namespace, every role lookup silently returns nothing: all
  "should be allowed" tests fail with `storage/unauthorized` while all "should
  be denied" tests pass. That asymmetry is the tell.
- **Test files run in parallel processes.** Each Firestore-only file gets its
  own project id, because a shared one lets one file's `clearFirestore()` wipe
  another's fixtures mid-test — observed as a suite that passed, failed once,
  then passed again.
- **`seedUser()` reads the document back before returning**, because a test
  that uploaded immediately after seeding failed roughly once in fourteen runs.
  If a flake reappears in the Storage suite, start there.

## What this does not cover

Email template rendering (Mailpit, Phase 4 of the e2e brief) and the
reCAPTCHA-gated `/api/register` front door (Phase 3), which needs a local
captcha-relaxed server.
