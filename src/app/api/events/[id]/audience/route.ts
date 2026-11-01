import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { parseSelection, type Selection } from "@/lib/audience/tags";
import { AUDIENCE_REFUSAL } from "@/lib/audience/words";
import { mayUntie, parseProgrammeChoice, programmesToTie, tieTo } from "@/lib/events/eventProgramme";
import { mayChooseFor, maySeeChoice } from "@/lib/events/invitationAccess";
import { invitedAlreadyTo, planForStoredChoice, planInvitations, readEventAudience } from "@/lib/events/invitations";
import { isForChosenPeople } from "@/lib/events/reach";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { EVENT_AUDIENCES_COLLECTION } from "@/lib/firestore/eventAudiences";
import { normalizeEvent } from "@/lib/firestore/events";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";

type Ctx = RouteContext<"/api/events/[id]/audience">;

/**
 * WHO AN EVENT FOR CHOSEN PEOPLE IS FOR, as its organiser chooses it in the
 * editor's "Who’s it for" step.
 *
 *  - GET: what is stored, for the people who run events: the choice itself
 *    (handed back only to the person who made it, or an admin, who may use
 *    every tag; anybody else reads who chose it and the numbers), the
 *    programme it is part of, the programmes this person may make it part of,
 *    and what publishing it would do, counted with the press's own plan.
 *  - POST `{ include, exclude, programme }`: what a choice on the screen would
 *    do, counted the same way, in the caller's world. Writes nothing.
 *  - PUT the same body: keep it, in the caller's name. The tags must be ones
 *    the caller may use ("Who is this for?", `src/lib/audience/scope.ts`), and
 *    a programme one they lead, or any for an admin
 *    (`src/lib/events/eventProgramme.ts`). The programme the event is part of
 *    already is kept by anybody who saves; only its lead or an admin may take
 *    it off or swap it.
 *
 * Every number is from `planInvitations` (src/lib/events/invitations.ts), the
 * function publishing walks, so the number in the editor is the number
 * publishing sends. No answer carries a name of anybody invited or an
 * address. Who may choose is `mayChooseFor` (src/lib/events/invitationAccess.ts):
 * whoever may edit the event in its state.
 */

/** A choice from a request body, or null for anything that is not exactly one. */
async function readChoice(
  req: Request,
): Promise<{ selection: Selection; programme: { roundId: string; programmeId: string } | null } | null> {
  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    return null;
  }
  const parsed = parseSelection(raw);
  if (!parsed.ok) return null;
  const programme = parseProgrammeChoice(raw && typeof raw === "object" ? (raw as { programme?: unknown }).programme : null);
  if (programme === undefined) return null;
  return { selection: parsed.selection, programme };
}

const NOT_YOUR_PROGRAMME = "Only that programme’s lead or an admin can make an event part of it, or take it off.";
const MAY_NOT_CHOOSE = "You can’t change who this event is for.";

export async function GET(_req: Request, ctx: Ctx) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!maySeeChoice(viewer)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const snap = await db.collection("events").doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const event = normalizeEvent(id, snap.data() ?? {});

  const mayChoose = mayChooseFor(event, viewer);
  const [audience, programmes] = await Promise.all([
    readEventAudience(db, id),
    mayChoose ? programmesToTie(db, viewer, new Date()) : Promise.resolve([]),
  ]);
  const chooser = audience?.setBy ? await db.collection("users").doc(audience.setBy).get() : null;
  // The choice itself only for somebody who could make it again: its chooser,
  // or an admin. Anybody else would read tags they may not use.
  const handBack = audience && (audience.setBy === viewer.uid || viewer.role === "admin") ? audience : null;
  // The numbers, as publishing would make them. A count that cannot be had
  // is said, never guessed, and the rest of the answer stands without it.
  let plan: Awaited<ReturnType<typeof planForStoredChoice>> | null = null;
  if (isForChosenPeople(event)) {
    try {
      plan = await planForStoredChoice(db, event, new Date());
    } catch (err) {
      console.error("[event audience] could not count", id, err);
      plan = { ok: false, status: 500, error: "We couldn’t count who it reaches just now." };
    }
  }

  return NextResponse.json({
    ok: true,
    choice: handBack ? { include: handBack.include, exclude: handBack.exclude } : null,
    chosenBy: chooser?.exists ? nameForViewer(viewer, accountNamesOf(chooser.data()), "NAISI member") : null,
    chosenByYou: audience?.setBy === viewer.uid,
    programme: event.programme,
    mayChoose,
    programmes,
    // The programme it is part of is shown, not offered, to somebody who may
    // change the people but not take that programme off.
    programmeFixed: !mayChoose || !mayUntie(event.programme, programmes, viewer),
    count: plan?.ok ? plan.plan.count : null,
    problem: plan && !plan.ok ? plan.error : null,
  });
}

/** POST and PUT share everything up to the write. */
async function planFor(req: Request, ctx: Ctx) {
  const viewer = await getCurrentUser();
  if (!viewer) return { refusal: NextResponse.json({ error: "Not signed in" }, { status: 401 }) } as const;
  if (!maySeeChoice(viewer)) return { refusal: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;

  const choice = await readChoice(req);
  if (!choice) return { refusal: NextResponse.json({ error: AUDIENCE_REFUSAL.body }, { status: 400 }) } as const;

  const { id } = await ctx.params;
  const db = getAdminDb();
  if (!db) return { refusal: NextResponse.json({ error: "Server not configured" }, { status: 500 }) } as const;
  const snap = await db.collection("events").doc(id).get();
  if (!snap.exists) return { refusal: NextResponse.json({ error: "Event not found" }, { status: 404 }) } as const;
  const event = normalizeEvent(id, snap.data() ?? {});
  if (!mayChooseFor(event, viewer)) return { refusal: NextResponse.json({ error: MAY_NOT_CHOOSE }, { status: 403 }) } as const;

  const now = new Date();
  const offered = choice.programme || event.programme ? await programmesToTie(db, viewer, now) : [];
  const programme = tieTo(choice.programme, offered, event.programme, viewer);
  if (programme === "refused") return { refusal: NextResponse.json({ error: NOT_YOUR_PROGRAMME }, { status: 403 }) } as const;

  // The tags are resolved in the caller's world, as they will be when the
  // event is published: a tag they may not use refuses the whole choice.
  const plan = await planInvitations(db, {
    event,
    choice: choice.selection,
    chooser: viewer,
    programme,
    invitedAlready: await invitedAlreadyTo(db, id),
    now,
  });
  if (!plan.ok) return { refusal: NextResponse.json({ error: AUDIENCE_REFUSAL.notYours }, { status: 403 }) } as const;
  return { db, id, viewer, selection: choice.selection, programme, count: plan.plan.count } as const;
}

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const planned = await planFor(req, ctx);
  if ("refusal" in planned) return planned.refusal;
  return NextResponse.json({ ok: true, count: planned.count });
}

export async function PUT(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const planned = await planFor(req, ctx);
  if ("refusal" in planned) return planned.refusal;
  const { db, id, viewer, selection, programme, count } = planned;

  // The choice, and the programme it is part of, in one write.
  const batch = db.batch();
  batch.set(db.collection(EVENT_AUDIENCES_COLLECTION).doc(id), {
    eventId: id,
    include: selection.include,
    exclude: selection.exclude,
    setBy: viewer.uid,
    setAt: FieldValue.serverTimestamp(),
  });
  batch.update(db.collection("events").doc(id), { programme: programme ?? FieldValue.delete() });
  await batch.commit();
  return NextResponse.json({ ok: true, count });
}
