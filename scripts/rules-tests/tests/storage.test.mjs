/**
 * `storage.rules` — the second, separately-deployed rulebook, governing every
 * uploaded file.
 *
 * Every gate here reaches ACROSS services — `firestore.get(/documents/users/
 * $(uid))` to read the actor's role — so these tests seed Firestore and
 * exercise Storage together.
 */
import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertFails,
  assertSucceeds,
  cleanup,
  clearData,
  getTestEnv,
  seedUser,
  storageAsAnon,
  storageAsUser,
} from "../lib/harness.mjs";

before(async () => {
  await getTestEnv("test");
});
after(cleanup);
afterEach(clearData);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const png = { contentType: "image/png" };

describe("newsletter-images — public read, permission-gated write", () => {
  it("is readable by a signed-out visitor (emails render without auth)", async () => {
    const s = await storageAsAnon();
    // Deny-by-default would reject the metadata call outright; a missing file
    // surfaces as a 404 from a permitted read, which assertSucceeds accepts.
    await assertSucceeds(
      s.ref("newsletter-images/d1/x.png").getMetadata().catch((e) => {
        if (e?.code === "storage/object-not-found") return null;
        throw e;
      }),
    );
  });

  it("blocks upload by a member with no newsletter permission", async () => {
    await seedUser("plain", { role: "member" });
    const s = await storageAsUser("plain");
    await assertFails(s.ref("newsletter-images/d1/x.png").put(PNG, png));
  });

  it("allows upload by a newsletter drafter", async () => {
    await seedUser("drafter", { role: "member", permissions: { draftNewsletter: true } });
    const s = await storageAsUser("drafter");
    await assertSucceeds(s.ref("newsletter-images/d1/x.png").put(PNG, png));
  });

  it("blocks a non-image content type", async () => {
    await seedUser("drafter", { role: "member", permissions: { draftNewsletter: true } });
    const s = await storageAsUser("drafter");
    await assertFails(
      s.ref("newsletter-images/d1/evil.html").put(PNG, { contentType: "text/html" }),
    );
  });

  it("refuses image/svg+xml, on a folder the whole internet can read", async () => {
    // `image/svg+xml` satisfies `image/.*`, and the read rule of this path is
    // `if true`. Whether the file executes depends on the headers the download
    // URL is served with, which rules cannot express, so the folder itself is
    // the only place to refuse it.
    //
    // The other spellings of the same format are covered together, further
    // down.
    await seedUser("drafter", { role: "member", permissions: { draftNewsletter: true } });
    const s = await storageAsUser("drafter");
    await assertFails(
      s.ref("newsletter-images/d1/x.svg").put(PNG, { contentType: "image/svg+xml" }),
    );
  });

  it("still accepts a PNG from that same drafter (the refusal is not blanket)", async () => {
    // Paired with the test above on purpose. One content type is refused, not
    // the newsletter editor's ability to add pictures, and a rule change that
    // quietly broke every upload would pass the refusal test on its own.
    await seedUser("drafter", { role: "member", permissions: { draftNewsletter: true } });
    const s = await storageAsUser("drafter");
    await assertSucceeds(s.ref("newsletter-images/d1/photo.png").put(PNG, png));
  });
});

describe("event-images — same shape as newsletter", () => {
  it("blocks upload by a member with no event permission", async () => {
    await seedUser("plain", { role: "member" });
    const s = await storageAsUser("plain");
    await assertFails(s.ref("event-images/e1/x.png").put(PNG, png));
  });

  it("allows upload by an event drafter", async () => {
    await seedUser("drafter", { role: "member", permissions: { draftEvent: true } });
    const s = await storageAsUser("drafter");
    await assertSucceeds(s.ref("event-images/e1/x.png").put(PNG, png));
  });

  it("does not require the event to exist — the wildcard is unvalidated", async () => {
    await seedUser("drafter", { role: "member", permissions: { draftEvent: true } });
    const s = await storageAsUser("drafter");
    await assertSucceeds(s.ref("event-images/no-such-event/x.png").put(PNG, png));
  });

  it("refuses image/svg+xml, on a folder the whole internet can read", async () => {
    // An event cover is rendered on the public events page and hot-linked out
    // of already-sent invitation emails, so a file landing here is a file
    // anybody can open with no session. An SVG is a document that can carry
    // script and links, which is not what a cover image is for.
    await seedUser("drafter", { role: "member", permissions: { draftEvent: true } });
    const s = await storageAsUser("drafter");
    await assertFails(
      s.ref("event-images/e1/evil.svg").put(PNG, { contentType: "image/svg+xml" }),
    );
  });

  it("still accepts a PNG cover from that same drafter", async () => {
    await seedUser("drafter", { role: "member", permissions: { draftEvent: true } });
    const s = await storageAsUser("drafter");
    await assertSucceeds(s.ref("event-images/e1/cover.png").put(PNG, png));
  });
});

describe("task attachments: suRecognised matches Firestore", () => {
  async function seedCommitteeTask() {
    const env = await getTestEnv("test");
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("tasks").doc("t1").set({
        title: "Committee task",
        creatorUid: "someone-else",
        completerUids: [],
        reviewerUids: [],
        visibility: "committee",
      });
    });
  }

  it("a NON-SU committee member is refused attachments, as Firestore refuses the doc", async () => {
    // firestore.rules gates committee task access on isSuCommittee() —
    // role == 'committee' AND suRecognised == true. storage.rules applies the
    // same gate, so the document and its attachment blobs agree.
    await seedUser("nonSu", { role: "committee", suRecognised: false });
    await seedCommitteeTask();
    const s = await storageAsUser("nonSu");
    await assertFails(s.ref("tasks/t1/a1/file.png").put(PNG, png));
  });

  it("and cannot READ them either, so the blobs follow the document", async () => {
    await seedUser("nonSu2", { role: "committee", suRecognised: false });
    await seedCommitteeTask();
    const s = await storageAsUser("nonSu2");
    await assertFails(s.ref("tasks/t1/a1/file.png").getMetadata());
  });

  it("still lets a NON-SU committee member named on the task in (the flow must survive)", async () => {
    // This is precisely how a non-SU committee member is meant to reach a task:
    // by being explicitly added to it. Tightening the committee branch must not
    // take this away, or it breaks the collaboration model for non-SU committee.
    await seedUser("nonSuNamed", { role: "committee", suRecognised: false });
    const env = await getTestEnv("test");
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("tasks").doc("t2").set({
        title: "Committee task they were added to",
        creatorUid: "someone-else",
        completerUids: ["nonSuNamed"],
        reviewerUids: [],
        visibility: "committee",
      });
    });
    const s = await storageAsUser("nonSuNamed");
    await assertSucceeds(s.ref("tasks/t2/a1/file.png").put(PNG, png));
  });

  it("an SU-recognised committee member is allowed (intended behaviour)", async () => {
    await seedUser("su", { role: "committee", suRecognised: true });
    await seedCommitteeTask();
    const s = await storageAsUser("su");
    await assertSucceeds(s.ref("tasks/t1/a1/file.png").put(PNG, png));
  });

  it("an unrelated member is still blocked (control)", async () => {
    await seedUser("outsider", { role: "member" });
    await seedCommitteeTask();
    const s = await storageAsUser("outsider");
    await assertFails(s.ref("tasks/t1/a1/file.png").put(PNG, png));
  });

  it("attachments are NOT publicly readable", async () => {
    await seedCommitteeTask();
    const s = await storageAsAnon();
    await assertFails(s.ref("tasks/t1/a1/file.png").getMetadata());
  });
});

describe("application-emails: admin-only write, public read", () => {
  // These tests pin the rule for this folder, including the double-nested path
  // the editor builds.
  it("allows an admin to upload, on the exact path the editor uses", async () => {
    await seedUser("admin1", { role: "admin" });
    const s = await storageAsUser("admin1");
    await assertSucceeds(
      s.ref("application-emails/application-submitted/application-submitted/x.png").put(PNG, png),
    );
  });

  it("blocks a non-admin, including a newsletter drafter", async () => {
    await seedUser("drafter", { role: "member", permissions: { draftNewsletter: true } });
    const s = await storageAsUser("drafter");
    await assertFails(s.ref("application-emails/tpl1/x.png").put(PNG, png));
  });

  it("blocks a non-image content type", async () => {
    await seedUser("admin1", { role: "admin" });
    const s = await storageAsUser("admin1");
    await assertFails(
      s.ref("application-emails/tpl1/x.html").put(PNG, { contentType: "text/html" }),
    );
  });

  it("is publicly readable, because sent emails render without auth", async () => {
    const s = await storageAsAnon();
    await assertSucceeds(
      s.ref("application-emails/tpl1/x.png").getMetadata().catch((e) => {
        if (e?.code === "storage/object-not-found") return null;
        throw e;
      }),
    );
  });

  it("refuses image/svg+xml even from an admin, because the read is public", async () => {
    // Admin-only WRITE is not the same as a private folder: the read rule is
    // `if true` so that an application email renders in somebody's inbox, and
    // an SVG parked here is a script-carrying document on a URL anybody can
    // open. The narrow write gate limits who can do it, not what it would be.
    await seedUser("admin1", { role: "admin" });
    const s = await storageAsUser("admin1");
    await assertFails(
      s.ref("application-emails/tpl1/evil.svg").put(PNG, { contentType: "image/svg+xml" }),
    );
  });

  it("still accepts a PNG from that same admin", async () => {
    await seedUser("admin1", { role: "admin" });
    const s = await storageAsUser("admin1");
    await assertSucceeds(s.ref("application-emails/tpl1/photo.png").put(PNG, png));
  });
});

describe("unmatched paths deny by default", () => {
  it("rejects an arbitrary top-level path even for an admin", async () => {
    await seedUser("admin1", { role: "admin" });
    const s = await storageAsUser("admin1");
    await assertFails(s.ref("anything-else/x.png").put(PNG, png));
  });
});

describe("event-images — per-event scoping, matching firestore.rules", () => {
  async function seedEvent(id, authorUid, collaboratorUids = []) {
    const env = await getTestEnv("test");
    await env.withSecurityRulesDisabled(async (ctx) => {
      const ref = ctx.firestore().collection("events").doc(id);
      await ref.set({
        title: "Talk",
        authorUid,
        status: "published",
        collaboratorUids,
      });
      await ref.get();
    });
  }

  it("a drafter cannot overwrite ANOTHER author's event cover", async () => {
    // firestore.rules scopes event edits per document, and this folder takes
    // the same scoping: an actor denied the event DOCUMENT is denied its
    // world-readable cover IMAGE too.
    await seedUser("drafter", { role: "member", permissions: { draftEvent: true } });
    await seedEvent("victim-event", "another-person");
    const s = await storageAsUser("drafter");
    await assertFails(s.ref("event-images/victim-event/cover.png").put(PNG, png));
  });

  it("still lets the event's AUTHOR upload its cover (the flow must survive)", async () => {
    await seedUser("owner", { role: "member", permissions: { draftEvent: true } });
    await seedEvent("own-event", "owner");
    const s = await storageAsUser("owner");
    await assertSucceeds(s.ref("event-images/own-event/cover.png").put(PNG, png));
  });

  it("still lets a named COLLABORATOR upload to that event", async () => {
    await seedUser("collab", { role: "member" });
    await seedEvent("shared-event", "another-person", ["collab"]);
    const s = await storageAsUser("collab");
    await assertSucceeds(s.ref("event-images/shared-event/cover.png").put(PNG, png));
  });

  it("still lets an APPROVER upload to any event under review", async () => {
    await seedUser("approver", { role: "member", permissions: { approveEvent: true } });
    await seedEvent("any-event", "another-person");
    const s = await storageAsUser("approver");
    await assertSucceeds(s.ref("event-images/any-event/cover.png").put(PNG, png));
  });
});

describe("course-images: public read, write gated by the course permissions", () => {
  // These tests pin the rule for this folder, on the exact two path shapes
  // that WeekEditor.tsx and CourseEditor.tsx build.
  it("allows a course drafter to upload under a courseId (CourseEditor)", async () => {
    await seedUser("cDrafter", { role: "member", permissions: { draftCourse: true } });
    const s = await storageAsUser("cDrafter");
    await assertSucceeds(s.ref("course-images/course-1/x.png").put(PNG, png));
  });

  it("allows a course approver to upload under runId__weekId (WeekEditor)", async () => {
    await seedUser("cApprover", { role: "member", permissions: { approveCourse: true } });
    const s = await storageAsUser("cApprover");
    await assertSucceeds(s.ref("course-images/run-1__w03/1700-x.png").put(PNG, png));
  });

  it("allows an admin, who holds every permission implicitly", async () => {
    await seedUser("admin2", { role: "admin" });
    const s = await storageAsUser("admin2");
    await assertSucceeds(s.ref("course-images/course-1/x.png").put(PNG, png));
  });

  it("blocks a member with no course permission", async () => {
    await seedUser("plain", { role: "member" });
    const s = await storageAsUser("plain");
    await assertFails(s.ref("course-images/course-1/x.png").put(PNG, png));
  });

  it("blocks a committee member who was never granted one", async () => {
    // Course authoring is a permission, not a rank: sitting on the committee
    // (SU-recognised or not) grants nothing here.
    await seedUser("suCommittee", { role: "committee", suRecognised: true });
    const s = await storageAsUser("suCommittee");
    await assertFails(s.ref("course-images/course-1/x.png").put(PNG, png));
  });

  it("blocks a holder of the NEWSLETTER permissions (the keys are not shared)", async () => {
    await seedUser("nDrafter", {
      role: "member",
      permissions: { draftNewsletter: true, approveNewsletter: true },
    });
    const s = await storageAsUser("nDrafter");
    await assertFails(s.ref("course-images/course-1/x.png").put(PNG, png));
  });

  it("blocks a signed-out visitor from uploading", async () => {
    const s = await storageAsAnon();
    await assertFails(s.ref("course-images/course-1/x.png").put(PNG, png));
  });

  it("is readable by a signed-out visitor (the public course page renders it)", async () => {
    const s = await storageAsAnon();
    await assertSucceeds(
      s.ref("course-images/course-1/x.png").getMetadata().catch((e) => {
        if (e?.code === "storage/object-not-found") return null;
        throw e;
      }),
    );
  });

  it("blocks a non-image content type", async () => {
    await seedUser("cDrafter", { role: "member", permissions: { draftCourse: true } });
    const s = await storageAsUser("cDrafter");
    await assertFails(
      s.ref("course-images/course-1/evil.html").put(PNG, { contentType: "text/html" }),
    );
  });

  it("refuses image/svg+xml, on a folder the whole internet can read", async () => {
    // The published course page and the curriculum preview are served to
    // signed-out visitors, so week-guide imagery is world-readable in exactly
    // the way newsletter and event imagery is. An SVG is a document that can
    // carry script and links, so it is refused here too.
    await seedUser("cDrafter", { role: "member", permissions: { draftCourse: true } });
    const s = await storageAsUser("cDrafter");
    await assertFails(
      s.ref("course-images/course-1/evil.svg").put(PNG, { contentType: "image/svg+xml" }),
    );
  });

  it("still accepts a PNG from that same course drafter", async () => {
    await seedUser("cDrafter", { role: "member", permissions: { draftCourse: true } });
    const s = await storageAsUser("cDrafter");
    await assertSucceeds(s.ref("course-images/course-1/guide.png").put(PNG, png));
  });

  it("does not require the course or week to exist (the folder is unvalidated)", async () => {
    // Stated rather than assumed: `{folder}` is a courseId in one editor and a
    // runId__weekId pair in the other, so the rule does not look up a course
    // or week document.
    await seedUser("cDrafter", { role: "member", permissions: { draftCourse: true } });
    const s = await storageAsUser("cDrafter");
    await assertSucceeds(s.ref("course-images/no-such-thing/x.png").put(PNG, png));
  });
});

describe("source-materials: public read, admin write, and an admin DELETE", () => {
  // The poster behind an entry on /sources, plus the PDF of it. The folder is
  // unlike the four above it in two ways, and both are decisions this suite
  // pins rather than side effects:
  //
  //  - ONE BLOCK takes images AND `application/pdf`. A PDF-only second folder
  //    would be the first entry in NON_IMAGE_WRITE_BLOCKS, whose emptiness is
  //    load-bearing (see its comment at the foot of this file).
  //  - There is an EXPLICIT `allow delete`. In Storage rules `write` covers
  //    delete, but `request.resource` is null on one, so the size clause in
  //    the write rule raises and denies by error. Unpublishing an entry
  //    deletes its image and its PDF, which is what "pulled down" means for
  //    printed material, so the delete needs a rule of its own. The tasks
  //    block carries one for the same reason.
  const pdf = { contentType: "application/pdf" };

  it("allows an admin to upload the picture of the material", async () => {
    await seedUser("admin1", { role: "admin" });
    const s = await storageAsUser("admin1");
    await assertSucceeds(s.ref("source-materials/freshers-2026/poster.png").put(PNG, png));
  });

  it("allows an admin to upload the PDF, which is the point of the block", async () => {
    await seedUser("admin1", { role: "admin" });
    const s = await storageAsUser("admin1");
    await assertSucceeds(s.ref("source-materials/freshers-2026/poster.pdf").put(PNG, pdf));
  });

  it("blocks an SU-recognised committee member: editing /sources is admin-only", async () => {
    // The committee make the posters, so this is the refusal most likely to be
    // reconsidered later. If it is, the rule widens to a permission key and
    // this test is where the decision gets rewritten rather than forgotten.
    await seedUser("sucom1", { role: "committee", suRecognised: true });
    const s = await storageAsUser("sucom1");
    await assertFails(s.ref("source-materials/freshers-2026/poster.png").put(PNG, png));
  });

  it("blocks a member holding draftEvent, and a plain member", async () => {
    await seedUser("eDrafter", { role: "member", permissions: { draftEvent: true } });
    await seedUser("plain", { role: "member" });
    for (const uid of ["eDrafter", "plain"]) {
      const s = await storageAsUser(uid);
      await assertFails(s.ref("source-materials/freshers-2026/poster.png").put(PNG, png));
    }
  });

  it("blocks a signed-out write", async () => {
    const s = await storageAsAnon();
    await assertFails(s.ref("source-materials/freshers-2026/poster.png").put(PNG, png));
  });

  it("is readable by a signed-out visitor, because a stranger scans the code", async () => {
    // The whole feature is a QR code on material physically handed to people
    // at a fair. There is no session at the other end of it.
    const s = await storageAsAnon();
    await assertSucceeds(
      s.ref("source-materials/freshers-2026/poster.png").getMetadata().catch((e) => {
        if (e?.code === "storage/object-not-found") return null;
        throw e;
      }),
    );
  });

  it("refuses text/html even from an admin", async () => {
    await seedUser("admin1", { role: "admin" });
    const s = await storageAsUser("admin1");
    await assertFails(
      s.ref("source-materials/freshers-2026/evil.html").put(PNG, { contentType: "text/html" }),
    );
  });

  it("refuses image/svg+xml even from an admin, because the read is public", async () => {
    // Admin-only write is not the same as a private folder: the read rule is
    // `if true` so a scanned code resolves with no session, and an SVG parked
    // here is a script-carrying document on a URL anybody can open.
    await seedUser("admin1", { role: "admin" });
    const s = await storageAsUser("admin1");
    await assertFails(
      s.ref("source-materials/freshers-2026/evil.svg").put(PNG, { contentType: "image/svg+xml" }),
    );
  });

  it("refuses a file over the 10MB cap", async () => {
    // 10MB rather than the house 5MB, because an A3 export routinely exceeds
    // 5MB. The editor checks the size in the browser first so the refusal
    // reads as a sentence; this is the boundary behind that.
    await seedUser("admin1", { role: "admin" });
    const s = await storageAsUser("admin1");
    await assertFails(
      s.ref("source-materials/freshers-2026/huge.pdf").put(new Uint8Array(11 * 1024 * 1024), pdf),
    );
  });

  it("lets an admin DELETE an object, which unpublishing depends on", async () => {
    await seedUser("admin1", { role: "admin" });
    const s = await storageAsUser("admin1");
    await assertSucceeds(s.ref("source-materials/delete-me/poster.pdf").put(PNG, pdf));
    await assertSucceeds(s.ref("source-materials/delete-me/poster.pdf").delete());
  });

  it("refuses a delete from a committee member and from a signed-out visitor", async () => {
    await seedUser("admin1", { role: "admin" });
    await seedUser("sucom1", { role: "committee", suRecognised: true });
    const owner = await storageAsUser("admin1");
    await assertSucceeds(s2Path(owner).put(PNG, pdf));

    const committee = await storageAsUser("sucom1");
    await assertFails(s2Path(committee).delete());
    const anon = await storageAsAnon();
    await assertFails(s2Path(anon).delete());
  });

  /** The one object the delete-refusal test uploads and then tries to remove. */
  function s2Path(storage) {
    return storage.ref("source-materials/keep-me/poster.pdf");
  }
});

describe("worksheet-images: signed-in read, scoped committee write, no SVG", () => {
  // The two paths worksheets add are deliberately UNLIKE the four blocks above,
  // and each difference is a decision this suite pins:
  //  - read is SIGNED-IN, not public. A worksheet is never public, and a
  //    question body can carry a screenshot of something internal.
  //  - `image/svg+xml` is refused here, as on every image folder, and the
  //    guard at the foot of this file covers any folder added later.
  //  - the {ownerId} folder IS scoped, because it names a document either
  //    way: a worksheet (gate: authorUid) in the editor, a circulation (gate:
  //    staffUids) when staff edit the sent copy. Both are probed. A committee
  //    member refused the worksheet DOCUMENT in firestore.rules is refused its
  //    IMAGES here too.

  /** A library worksheet, the document the author branch of the rule reads. */
  async function seedWorksheet(id, authorUid) {
    const env = await getTestEnv("test");
    await env.withSecurityRulesDisabled(async (ctx) => {
      const ref = ctx.firestore().collection("worksheets").doc(id);
      await ref.set({ title: "Reading reflection", authorUid, private: false, items: [] });
      await ref.get();
    });
  }

  /** A circulation, the document the staff branch of the rule reads. */
  async function seedCirculationDoc(id, staffUids) {
    const env = await getTestEnv("test");
    await env.withSecurityRulesDisabled(async (ctx) => {
      const ref = ctx.firestore().collection("circulations").doc(id);
      await ref.set({ worksheetId: "w1", title: "Reading reflection", staffUids, status: "open" });
      await ref.get();
    });
  }

  it("allows a NON-SU committee member to upload to their OWN worksheet", async () => {
    // Non-SU on purpose: the library is open to the whole committee, so if
    // this ever tightens to suRecognised, this is the test that goes red.
    await seedUser("wsCommittee", { role: "committee", suRecognised: false });
    await seedWorksheet("w1", "wsCommittee");
    const s = await storageAsUser("wsCommittee");
    await assertSucceeds(s.ref("worksheet-images/w1/body.png").put(PNG, png));
  });

  it("allows an SU-recognised committee member to upload to their own", async () => {
    await seedUser("wsSu", { role: "committee", suRecognised: true });
    await seedWorksheet("w-su", "wsSu");
    const s = await storageAsUser("wsSu");
    await assertSucceeds(s.ref("worksheet-images/w-su/body.png").put(PNG, png));
  });

  it("blocks a committee member overwriting ANOTHER author's worksheet imagery", async () => {
    // firestore.rules refuses this person the worksheet DOCUMENT (edit
    // somebody else's is admin-only, everyone else makes a copy), so the
    // pictures inside it are refused to them as well: the body of a question
    // the committee is reading, and the option images inside a live
    // circulation.
    await seedUser("wsCommittee", { role: "committee", suRecognised: false });
    await seedWorksheet("w-victim", "another-person");
    const s = await storageAsUser("wsCommittee");
    await assertFails(s.ref("worksheet-images/w-victim/body.png").put(PNG, png));
  });

  it("lets an ADMIN upload to somebody else's worksheet folder", async () => {
    // Editing somebody else's worksheet is admin-only rather than nobody's:
    // an admin fixing a broken image must not have to go through the author.
    await seedUser("wsAdmin", { role: "admin" });
    await seedWorksheet("w-victim", "another-person");
    const s = await storageAsUser("wsAdmin");
    await assertSucceeds(s.ref("worksheet-images/w-victim/body.png").put(PNG, png));
  });

  it("lets a circulation's STAFF upload under the circulation id", async () => {
    // The second shape of {ownerId}: staff editing the sent copy mid-flight
    // upload under the circulation, not the worksheet it was copied from.
    await seedUser("wsReviewer", { role: "committee", suRecognised: true });
    await seedCirculationDoc("circ-images", ["sender1", "wsReviewer"]);
    const s = await storageAsUser("wsReviewer");
    await assertSucceeds(s.ref("worksheet-images/circ-images/opt.png").put(PNG, png));
  });

  it("blocks a committee member who is NOT staff on that circulation", async () => {
    // A circulation's imagery is what its recipients are looking at while they
    // answer. Committee membership alone does not buy the right to change it.
    await seedUser("wsOutsider2", { role: "committee", suRecognised: true });
    await seedCirculationDoc("circ-images", ["sender1"]);
    const s = await storageAsUser("wsOutsider2");
    await assertFails(s.ref("worksheet-images/circ-images/opt.png").put(PNG, png));
  });

  it("allows an upload under an id that names NEITHER document yet", async () => {
    // The newsletter-images null-safety branch: firestore.get() on a missing
    // document returns null and .get() on null raises, which would deny by
    // error, and the editor can legitimately upload the first image before its
    // document has settled. Uploading under an id nothing references is
    // harmless.
    await seedUser("wsCommittee", { role: "committee", suRecognised: false });
    const s = await storageAsUser("wsCommittee");
    await assertSucceeds(s.ref("worksheet-images/w-unsettled/body.png").put(PNG, png));
  });

  it("blocks a plain member, even one holding circulateWorksheet", async () => {
    // Circulating is a permission to SEND, not to author. A member who holds it
    // must not gain the committee's authoring surface with it.
    await seedUser("wsMember", { role: "member" });
    await seedUser("wsCirculator", {
      role: "member",
      permissions: { circulateWorksheet: true },
    });
    const member = await storageAsUser("wsMember");
    await assertFails(member.ref("worksheet-images/w1/body.png").put(PNG, png));
    const circulator = await storageAsUser("wsCirculator");
    await assertFails(circulator.ref("worksheet-images/w1/body.png").put(PNG, png));
  });

  it("blocks a signed-out visitor from uploading", async () => {
    const s = await storageAsAnon();
    await assertFails(s.ref("worksheet-images/w1/body.png").put(PNG, png));
  });

  it("blocks image/svg+xml, as every image path does", async () => {
    // `image/svg+xml` satisfies `image/.*`, and an SVG is a document format
    // that can carry script, so this path refuses it as every image path does.
    await seedUser("wsCommittee", { role: "committee", suRecognised: false });
    const s = await storageAsUser("wsCommittee");
    await assertFails(
      s.ref("worksheet-images/w1/evil.svg").put(PNG, { contentType: "image/svg+xml" }),
    );
  });

  it("blocks a non-image content type", async () => {
    await seedUser("wsCommittee", { role: "committee", suRecognised: false });
    const s = await storageAsUser("wsCommittee");
    await assertFails(
      s.ref("worksheet-images/w1/evil.html").put(PNG, { contentType: "text/html" }),
    );
  });

  it("blocks an upload at or over the 5 MB cap", async () => {
    await seedUser("wsCommittee", { role: "committee", suRecognised: false });
    const s = await storageAsUser("wsCommittee");
    await assertFails(
      s.ref("worksheet-images/w1/huge.png").put(new Uint8Array(5 * 1024 * 1024), png),
    );
  });

  it("is readable by a signed-in member", async () => {
    await seedUser("wsMember", { role: "member" });
    const s = await storageAsUser("wsMember");
    await assertSucceeds(
      s.ref("worksheet-images/w1/body.png").getMetadata().catch((e) => {
        if (e?.code === "storage/object-not-found") return null;
        throw e;
      }),
    );
  });

  it("is NOT readable by a signed-out visitor (unlike every image path above)", async () => {
    const s = await storageAsAnon();
    await assertFails(s.ref("worksheet-images/w1/body.png").getMetadata());
  });
});

describe("worksheet-uploads: no client write at all, scoped read", () => {
  // The recipient's image ANSWERS. Every client write is refused, admin and
  // uploader included, because the route is the only thing that can check the
  // MAGIC BYTES: a storage rule sees the Content-Type the client declares,
  // which is a claim, so no version of this block would be equivalent.
  async function seedCirculation(staffUids = ["sender1", "reviewer1"]) {
    const env = await getTestEnv("test");
    await env.withSecurityRulesDisabled(async (ctx) => {
      const ref = ctx.firestore().collection("circulations").doc("circ1");
      await ref.set({
        worksheetId: "w1",
        title: "Reading reflection",
        senderUid: "sender1",
        authorUid: "sender1",
        reviewerUids: ["reviewer1"],
        staffUids,
        status: "open",
      });
      await ref.get();
    });
  }

  const uploadPath = "worksheet-uploads/circ1/recipA/answer.png";

  it("refuses the recipient's own upload (it goes through the route)", async () => {
    await seedUser("recipA", { role: "committee", suRecognised: false });
    await seedCirculation();
    const s = await storageAsUser("recipA");
    await assertFails(s.ref(uploadPath).put(PNG, png));
  });

  it("refuses an ADMIN's upload as well", async () => {
    await seedUser("wsAdmin", { role: "admin" });
    await seedCirculation();
    const s = await storageAsUser("wsAdmin");
    await assertFails(s.ref(uploadPath).put(PNG, png));
  });

  it("refuses a staff upload, and a signed-out one", async () => {
    await seedUser("reviewer1", { role: "committee", suRecognised: true });
    await seedCirculation();
    const staff = await storageAsUser("reviewer1");
    await assertFails(staff.ref(uploadPath).put(PNG, png));
    const anon = await storageAsAnon();
    await assertFails(anon.ref(uploadPath).put(PNG, png));
  });

  it("lets the recipient read their own upload, with no cross-service lookup", async () => {
    await seedUser("recipA", { role: "committee", suRecognised: false });
    await seedCirculation();
    const s = await storageAsUser("recipA");
    await assertSucceeds(
      s.ref(uploadPath).getMetadata().catch((e) => {
        if (e?.code === "storage/object-not-found") return null;
        throw e;
      }),
    );
  });

  it("lets the circulation's staff read it", async () => {
    await seedUser("reviewer1", { role: "committee", suRecognised: true });
    await seedCirculation();
    const s = await storageAsUser("reviewer1");
    await assertSucceeds(
      s.ref(uploadPath).getMetadata().catch((e) => {
        if (e?.code === "storage/object-not-found") return null;
        throw e;
      }),
    );
  });

  it("refuses ANOTHER recipient of the same circulation", async () => {
    // The uploads path is the one place a recipient's own words leave the
    // response document, so it has to honour the same scoping the response
    // does: recipB is on this circulation and still cannot see recipA's files.
    await seedUser("recipB", { role: "committee", suRecognised: false });
    await seedCirculation();
    const s = await storageAsUser("recipB");
    await assertFails(s.ref(uploadPath).getMetadata());
  });

  it("refuses a committee member who is not staff on this circulation", async () => {
    await seedUser("wsOutsider", { role: "committee", suRecognised: true });
    await seedCirculation();
    const s = await storageAsUser("wsOutsider");
    await assertFails(s.ref(uploadPath).getMetadata());
  });

  it("refuses a signed-out visitor", async () => {
    await seedCirculation();
    const s = await storageAsAnon();
    await assertFails(s.ref(uploadPath).getMetadata());
  });

  it("denies rather than errors when the circulation does not exist", async () => {
    // firestore.get() on a missing document returns null and .get() on null
    // raises, so the staff branch is guarded with exists(). Without it this
    // would deny by ERROR, which is the same answer for the wrong reason and
    // hides the difference between "not staff" and "typo in the path".
    await seedUser("reviewer1", { role: "committee", suRecognised: true });
    const s = await storageAsUser("reviewer1");
    await assertFails(s.ref("worksheet-uploads/no-such-circ/recipA/answer.png").getMetadata());
  });
});

describe("every image folder refuses SVG in every spelling, not just one string", () => {
  // The refusal is a prefix match on the lowercased content type. Rules compare
  // strings byte for byte, so an equality test against a single spelling would
  // let through `image/SVG+xml` (a media type is case-insensitive) and the
  // `; charset=utf-8` form (parameters are an ordinary part of one), and a
  // browser opens either file as an SVG document.
  //
  // Every folder is exercised rather than one. The structural guard at the foot
  // of this file proves the clauses are the same TEXT; these tests are what
  // prove the text means what the comments beside it claim, on each of the
  // world-readable folders and on the signed-in-read worksheet folder.
  //
  // The plain `image/svg+xml` spelling is covered folder by folder above, with
  // the reason each folder in particular cannot host one, so only the two
  // variations are repeated here.
  const VARIATIONS = ["image/SVG+xml", "image/svg+xml; charset=utf-8"];

  /** Folder, an actor who is allowed to write to it, and a path inside it. */
  const FOLDERS = [
    [
      "newsletter-images",
      "nDrafter",
      { role: "member", permissions: { draftNewsletter: true } },
      "newsletter-images/d1/evil.svg",
    ],
    [
      "event-images",
      "eDrafter",
      { role: "member", permissions: { draftEvent: true } },
      "event-images/e1/evil.svg",
    ],
    [
      "application-emails",
      "admin1",
      { role: "admin" },
      "application-emails/tpl1/evil.svg",
    ],
    [
      "course-images",
      "cDrafter",
      { role: "member", permissions: { draftCourse: true } },
      "course-images/course-1/evil.svg",
    ],
    // Admin-only write, and world-readable.
    [
      "source-materials",
      "admin1",
      { role: "admin" },
      "source-materials/freshers-2026/evil.svg",
    ],
    // Committee rather than a permission holder, and an owner id that names
    // neither a worksheet nor a circulation, which is the branch of that rule
    // an author uploading their first image legitimately takes.
    [
      "worksheet-images",
      "wsCommittee",
      { role: "committee", suRecognised: false },
      "worksheet-images/w-unsettled/evil.svg",
    ],
  ];

  for (const [folder, uid, userDoc, path] of FOLDERS) {
    for (const contentType of VARIATIONS) {
      it(`${folder} refuses ${contentType}`, async () => {
        await seedUser(uid, userDoc);
        const s = await storageAsUser(uid);
        await assertFails(s.ref(path).put(PNG, { contentType }));
      });
    }
  }

  it("and a WebP and a GIF still get through, so this is a format refusal not a lockout", async () => {
    // Paired with the loop on purpose. A clause that refused everything would
    // pass all ten tests above and break every editor on the site, and the
    // per-folder PNG tests would not catch a pattern that happened to admit
    // PNG alone.
    await seedUser("nDrafter", { role: "member", permissions: { draftNewsletter: true } });
    const s = await storageAsUser("nDrafter");
    await assertSucceeds(s.ref("newsletter-images/d1/x.webp").put(PNG, { contentType: "image/webp" }));
    await assertSucceeds(s.ref("newsletter-images/d1/x.gif").put(PNG, { contentType: "image/gif" }));
  });
});

/**
 * ---------------------------------------------------------------------------
 * The guard, which is the half that outlives the folders listed above.
 * ---------------------------------------------------------------------------
 *
 * Every test above pins a folder that exists today. The next image folder
 * somebody adds is covered by none of them.
 *
 * So the refusal is enforced structurally as well as by example: read
 * `storage.rules`, walk every match block in it, and require the SVG refusal
 * on each block that grants a write and accepts an image content type. A
 * folder added tomorrow is covered without anybody remembering that this file
 * exists.
 *
 * The scan reports what it cannot read rather than passing over it. It
 * accepts either quote style around the content-type pattern, reads
 * `allow create, update:` as well as `allow write:`, and fails by name on a
 * match line it cannot turn into a block, such as one with a trailing comment.
 * A guard whose blind spot is silent is worse than no guard, because the file
 * grows around it.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * The rules file under test. Overridable so the guard can be pointed at a
 * doctored COPY to prove it fails when a clause goes missing: delete the SVG
 * refusal from a copy, run with STORAGE_RULES_PATH pointing at it, and the
 * folder is named. Same reason `tests/firestore-indexes.test.mjs` takes
 * FIRESTORE_INDEXES_PATH. Without it the only way to check the guard is to
 * edit the real ruleset and remember to put it back, which nobody does twice.
 */
const STORAGE_RULES_PATH = process.env.STORAGE_RULES_PATH ?? join(REPO_ROOT, "storage.rules");

/** The bucket-wide wrapper. Scaffolding, not a folder rule. */
const BUCKET_ROOT = "/b/{bucket}/o";

/**
 * The image folders `storage.rules` holds today, listed so that a scan which
 * finds nothing (a renamed block, a parser tripped by a later edit) fails
 * loudly instead of passing over an empty set. That is how a guard like this
 * dies quietly: it keeps reporting no violations because it stopped reading.
 */
const KNOWN_IMAGE_BLOCKS = [
  "/newsletter-images/{draftId}/{image=**}",
  "/event-images/{eventId}/{image=**}",
  "/application-emails/{templateId}/{image=**}",
  "/course-images/{folder}/{image=**}",
  "/source-materials/{slug}/{file=**}",
  "/worksheet-images/{ownerId}/{image=**}",
];

/**
 * Blocks allowed to accept SVG, each with the reason it is exempt.
 * Read in BOTH directions below: an entry naming a block `storage.rules` no
 * longer has, or one that has since grown the refusal on its own, fails until
 * somebody deletes it.
 */
const SVG_EXEMPT_BLOCKS = new Map([
  [
    "/tasks/{taskId}/{attachmentId}/{filename}",
    "Task attachments are a general file store rather than an image folder: "
      + "the same rule already accepts PDFs, Word documents, zips and text, and "
      + "its read is gated to whoever can open the parent task rather than to "
      + "the whole internet, so the refusal that belongs on an image folder is "
      + "not applied to it.",
  ],
]);

/**
 * Blocks that grant a write and are deliberately NOT image folders, each with
 * the reason no content-type refusal belongs on them.
 *
 * Empty today, and it is the emptiness that does the work: every block in
 * `storage.rules` that lets anybody upload anything accepts an image content
 * type, so the test below can demand that a write-granting block is either
 * recognised as an image folder or written down here. A block the classifier
 * cannot read (a content-type check spelled some third way) lands here as an
 * unexplained write-granting block and fails, rather than being quietly
 * dropped from the set the refusal is enforced on.
 */
const NON_IMAGE_WRITE_BLOCKS = new Map();

/**
 * Every match block in `storage.rules`, as `{ path, body }`.
 *
 * Scanned line by line rather than parsed properly, because the shape is
 * simple (one match per folder, no nesting below the bucket wrapper) and the
 * repo has no rules parser to reach for. The one trap is that a match line's
 * PATH carries braces of its own, as in `{draftId}` and `{image=**}`, so the
 * brace count has to treat that line as a single opening brace instead of
 * scanning it.
 */
function parseBlocks(source) {
  const blocks = [];
  let open = null;
  let depth = 0;

  for (const line of source.split("\n")) {
    const opener = /^\s*match\s+(\S+)\s*\{\s*$/.exec(line);
    if (open === null) {
      if (opener && opener[1] !== BUCKET_ROOT) {
        open = { path: opener[1], body: [] };
        depth = 1;
      }
      continue;
    }
    depth += opener
      ? 1
      : (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
    if (depth === 0) {
      blocks.push({ path: open.path, body: open.body.join("\n") });
      open = null;
      continue;
    }
    open.body.push(line);
  }

  assert.equal(
    open,
    null,
    `storage.rules did not parse: the block for ${open?.path} never closed. `
      + "Fix the scan rather than deleting this check. A guard that cannot read "
      + "the file has to say so, not report nothing left to enforce.",
  );
  return blocks;
}

/**
 * Match lines the scan did NOT turn into a block, by path.
 *
 * The scanner opens a block only on a line shaped exactly `match <path> {`, so
 * a trailing comment on the match line (`match /poster-images/{id}/{f=**} { //
 * posters`) leaves the entire folder unread: no block, no classification, no
 * refusal demanded. Anything nested one level deeper than the bucket wrapper
 * lands here too. Both are the guard failing to read the file, which is the
 * one outcome it must never turn into silence.
 */
function unreadableMatchLines(source, blocks) {
  const parsed = new Set(blocks.map((block) => block.path));
  const declared = [];
  for (const line of source.split("\n")) {
    const named = /^\s*match\s+(\S+)/.exec(line);
    if (named && named[1] !== BUCKET_ROOT) declared.push(named[1]);
  }
  return declared.filter((path) => !parsed.has(path));
}

function storageRuleBlocks() {
  const source = readFileSync(STORAGE_RULES_PATH, "utf8");
  const blocks = parseBlocks(source);
  const unreadable = unreadableMatchLines(source, blocks);
  assert.deepEqual(
    unreadable,
    [],
    `The scan found match lines in storage.rules it could not read as blocks: `
      + `${unreadable.join(", ")}. Everything below is enforced only on the `
      + "blocks it DID read, so those folders are currently exempt from the SVG "
      + "refusal without anybody deciding they should be. Usual causes: a "
      + "comment after the opening brace on the match line, or a match nested "
      + "below another one. Fix the scan or the rules file, never this check.",
  );
  return blocks;
}

/**
 * A block's rule expressions, with whole-line comments dropped. The comments
 * in `storage.rules` quote rule fragments and path templates at length, so a
 * match against the raw text would classify a block by what its prose talks
 * about rather than by what it permits.
 */
function rulesOnly(body) {
  return body
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

/**
 * Every `allow …: if …;` statement in a block, as `{ methods, condition }`.
 *
 * Parsed rather than grepped because a search for the literal word `write`
 * would read `allow create, update: if …` (identical in effect, and valid) as
 * granting nothing at all, which would silently remove that folder from
 * everything enforced below.
 */
function allowStatements(body) {
  const statements = [];
  const pattern = /\ballow\s+([a-z,\s]*?)\s*:\s*if\s([^;]*);/g;
  let hit = pattern.exec(rulesOnly(body));
  while (hit !== null) {
    statements.push({
      methods: hit[1].split(/[,\s]+/).filter(Boolean),
      condition: hit[2].trim(),
    });
    hit = pattern.exec(rulesOnly(body));
  }
  return statements;
}

/**
 * Grants somebody the right to put bytes in the folder. `delete` is left out
 * deliberately: it carries no `request.resource`, so a content-type clause is
 * not something a delete rule could have.
 */
function grantsWrite(body) {
  return allowStatements(body).some(
    (statement) =>
      statement.methods.some((method) => ["write", "create", "update"].includes(method))
      && statement.condition !== "false",
  );
}

/**
 * References an `image/…` content type in its rule expressions. Either quote
 * style, and no assumption about which string method does the matching: the
 * rules language accepts both quotes, and this file happens to use single ones.
 */
function acceptsImageContentType(body) {
  return /contentType[^;]*['"]image\//.test(rulesOnly(body));
}

/** Grants a write to somebody, and accepts an image content type to do it. */
function isImageWriteBlock(body) {
  return grantsWrite(body) && acceptsImageContentType(body);
}

/**
 * The refusal, pinned to ONE clause: lowercased, and prefix-matched with a
 * trailing `.*` so a media-type parameter cannot walk round it.
 *
 * Deliberately narrow rather than "mentions SVG somewhere", so a clause that
 * only reads like a refusal does not satisfy it. `matches()` in the rules
 * language tests the WHOLE string, so `matches('image/svg\\+xml')` would refuse
 * the bare type and let `image/svg+xml; charset=utf-8` through: close enough
 * to read right, wrong where it counts. A folder wanting some other clause has
 * to make this guard say so on purpose.
 */
const SVG_REFUSAL = /!\s*request\.resource\.contentType\.lower\(\)\.matches\(\s*['"]image\/svg\.\*['"]\s*\)/;

/**
 * The exact-string comparison, kept so the failure below can say what is
 * wrong with it rather than only that something is missing.
 */
const WEAK_SVG_REFUSAL = /contentType\s*(!=|==)\s*['"]image\/svg\+xml['"]/;

function refusesSvg(body) {
  return SVG_REFUSAL.test(rulesOnly(body));
}

function mentionsSvgAtAll(body) {
  const code = rulesOnly(body);
  return SVG_REFUSAL.test(code) || WEAK_SVG_REFUSAL.test(code);
}

describe("storage.rules: an image folder added tomorrow cannot forget the SVG refusal", () => {
  it("reads storage.rules and finds every image folder it is known to hold", () => {
    const found = storageRuleBlocks()
      .filter((block) => isImageWriteBlock(block.body))
      .map((block) => block.path);
    for (const path of KNOWN_IMAGE_BLOCKS) {
      assert.ok(
        found.includes(path),
        `The scan no longer recognises ${path} as an image folder. Either the `
          + "block was renamed, and KNOWN_IMAGE_BLOCKS needs updating, or the "
          + "scan has gone blind, in which case the refusal below is enforced "
          + `on nothing. Found: ${found.join(", ") || "no blocks at all"}.`,
      );
    }
  });

  it("accounts for every block that lets anybody upload a file", () => {
    // The half KNOWN_IMAGE_BLOCKS cannot do. That list catches one of today's
    // five folders falling out of the classifier; it says nothing about a
    // SIXTH folder that was never in it, which is exactly the case the guard
    // exists for. So the question is turned round: every block granting a
    // write has to be recognised as an image folder or written down as
    // something else, with a reason. A new folder whose content-type check is
    // spelled in some way this file does not recognise fails here by name
    // instead of dropping out of the set enforced below.
    for (const block of storageRuleBlocks()) {
      if (!grantsWrite(block.body)) continue;
      assert.ok(
        isImageWriteBlock(block.body) || NON_IMAGE_WRITE_BLOCKS.has(block.path),
        `${block.path} grants a write, and this guard cannot tell whether it is `
          + "an image folder. If it is one, its content-type check is written in "
          + "a way `acceptsImageContentType` does not recognise, so widen that. "
          + "If it genuinely is not, add it to NON_IMAGE_WRITE_BLOCKS with the "
          + "reason. What must not happen is the block quietly sitting outside "
          + "the SVG refusal because nobody noticed it was never being checked.",
      );
    }
  });

  it("every image folder in storage.rules refuses SVG, in the shape that works", () => {
    for (const block of storageRuleBlocks()) {
      if (!isImageWriteBlock(block.body) || SVG_EXEMPT_BLOCKS.has(block.path)) continue;
      assert.ok(
        refusesSvg(block.body),
        `${block.path} accepts an image content type without refusing SVG. An `
          + "SVG is a document that can carry script and links, and these "
          + "folders are read with no session at all, so add "
          + "`&& !request.resource.contentType.lower().matches('image/svg.*')` "
          + "to the write rule, or add the path to SVG_EXEMPT_BLOCKS with the "
          + "reason it is safe there."
          + (WEAK_SVG_REFUSAL.test(rulesOnly(block.body))
            ? " This block compares the content type to the exact string "
              + "'image/svg+xml'. That is not enough: rules compare strings byte "
              + "for byte, so `image/SVG+xml` and `image/svg+xml; charset=utf-8` "
              + "both get past it, and a browser opens them as SVG documents "
              + "all the same."
            : ""),
      );
    }
  });

  it("exempts only blocks that still exist, are still image writes, and still need exempting", () => {
    const blocks = storageRuleBlocks();
    for (const [path, reason] of SVG_EXEMPT_BLOCKS) {
      const block = blocks.find((candidate) => candidate.path === path);
      assert.ok(
        block,
        `SVG_EXEMPT_BLOCKS names ${path}, which storage.rules no longer has. `
          + "Delete the entry: an exemption nobody can check is an exemption "
          + "the next reader will copy.",
      );
      assert.ok(
        reason.trim().length > 40,
        `The exemption for ${path} needs a reason a reader can weigh, not a note.`,
      );
      assert.ok(
        isImageWriteBlock(block.body),
        `${path} is exempted from a rule the scan no longer applies to it: it is `
          + "not classified as an image write block any more, so the exemption "
          + "grants nothing and hides the fact that the classifier stopped "
          + "seeing the block. Work out which changed, the rule or the scan.",
      );
      assert.ok(
        !mentionsSvgAtAll(block.body),
        `${path} refuses SVG on its own now, so its exemption is stale. `
          + "Delete the entry.",
      );
    }
  });

  it("lists a reason against every non-image write block, and no stale ones", () => {
    // Both directions, same as SVG_EXEMPT_BLOCKS: an entry for a block that no
    // longer exists, or for one that turns out to be an image folder after all,
    // is a licence nobody is checking.
    const blocks = storageRuleBlocks();
    for (const [path, reason] of NON_IMAGE_WRITE_BLOCKS) {
      const block = blocks.find((candidate) => candidate.path === path);
      assert.ok(
        block,
        `NON_IMAGE_WRITE_BLOCKS names ${path}, which storage.rules no longer has. `
          + "Delete the entry.",
      );
      assert.ok(
        reason.trim().length > 40,
        `The entry for ${path} needs a reason a reader can weigh, not a note.`,
      );
      assert.ok(
        !isImageWriteBlock(block.body),
        `${path} is listed as a non-image write block but accepts an image `
          + "content type. Delete the entry so the SVG refusal is enforced on it.",
      );
    }
  });
});
