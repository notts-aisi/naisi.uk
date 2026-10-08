import type {
  MultiSelectQuestion,
  RsvpAnswer,
  RsvpDoc,
} from "@/lib/firestore/events";
import { own } from "@/lib/applications/keys";

/**
 * Analysis behind the pizza order helper. The signup form collects toppings an
 * attendee will NOT eat (an exclusion set). Nothing here promises a specific
 * pizza: it surfaces how exclusions cluster so an organiser can place an order
 * where everyone has something to eat.
 */

/** A distinct set of excluded toppings and how many attendees share it. */
export type ExclusionGroup = {
  /** Sorted excluded toppings; empty means "eats anything". */
  exclusions: string[];
  count: number;
};

export type ToppingTally = { topping: string; count: number };

export type FreeTextNote = { name: string; text: string };

export type ToppingAnalysis = {
  /** Confirmed attendees analysed. */
  headcount: number;
  /** How many of them excluded at least one topping. */
  restrictedCount: number;
  /** Every option, with how many attendees excluded it (most-excluded first). */
  toppingCounts: ToppingTally[];
  /** Options nobody excluded - free to use on any pizza. */
  safeToppings: string[];
  /** Distinct exclusion sets, biggest group first. */
  groups: ExclusionGroup[];
  /** Union of every exclusion: a pizza avoiding all of these feeds everyone. */
  unionExclusions: string[];
  /** Free-text "Other" exclusions, for the organiser to read by hand. */
  freeTextNotes: FreeTextNote[];
};

/** Pull the structured exclusion set + free text out of one multi-select answer. */
function readAnswer(a: RsvpAnswer | undefined): { checked: string[]; other: string } {
  if (Array.isArray(a)) {
    return { checked: a.filter((v): v is string => typeof v === "string"), other: "" };
  }
  if (a && typeof a === "object") {
    const obj = a as { checked?: unknown; other?: unknown };
    return {
      checked: Array.isArray(obj.checked)
        ? obj.checked.filter((v): v is string => typeof v === "string")
        : [],
      other: typeof obj.other === "string" ? obj.other.trim() : "",
    };
  }
  return { checked: [], other: "" };
}

export function analyseToppingExclusions(
  rsvps: RsvpDoc[],
  question: MultiSelectQuestion,
): ToppingAnalysis {
  const options = question.options.map((o) => o.trim()).filter(Boolean);
  const optionSet = new Set(options);

  const toppingCount = new Map<string, number>();
  for (const o of options) toppingCount.set(o, 0);

  const groupCount = new Map<string, number>();
  const groupExclusions = new Map<string, string[]>();
  const freeTextNotes: FreeTextNote[] = [];
  const union = new Set<string>();
  let restrictedCount = 0;

  for (const r of rsvps) {
    const { checked, other } = readAnswer(own(r.answers, question.id));
    // Keep only known options, dedupe, and sort for a stable group key.
    const excl = Array.from(new Set(checked.filter((c) => optionSet.has(c)))).sort();
    for (const t of excl) {
      toppingCount.set(t, (toppingCount.get(t) ?? 0) + 1);
      union.add(t);
    }
    if (excl.length > 0) restrictedCount += 1;
    const key = excl.join("\n");
    groupCount.set(key, (groupCount.get(key) ?? 0) + 1);
    if (!groupExclusions.has(key)) groupExclusions.set(key, excl);
    if (other) freeTextNotes.push({ name: r.name || "Someone", text: other });
  }

  const toppingCounts: ToppingTally[] = Array.from(toppingCount.entries())
    .map(([topping, count]) => ({ topping, count }))
    .sort((a, b) => b.count - a.count || a.topping.localeCompare(b.topping));

  const groups: ExclusionGroup[] = Array.from(groupCount.entries())
    .map(([key, count]) => ({ exclusions: groupExclusions.get(key) ?? [], count }))
    .sort((a, b) => b.count - a.count || a.exclusions.length - b.exclusions.length);

  return {
    headcount: rsvps.length,
    restrictedCount,
    toppingCounts,
    safeToppings: toppingCounts.filter((t) => t.count === 0).map((t) => t.topping),
    groups,
    unionExclusions: Array.from(union).sort(),
    freeTextNotes,
  };
}

/** One pizza type in a suggested order. */
export type PizzaType = {
  /** Sorted toppings this type's pizza must skip. Empty means no limits. */
  avoid: string[];
  /** Attendees assigned to this type. */
  headcount: number;
  /** How many of this pizza to order. */
  quantity: number;
};

export type OrderPlan = {
  /**
   * Pizza types in the order. The "any toppings" type (if anyone is
   * unrestricted) comes first, then constrained types, largest group first.
   * Every attendee is assigned to exactly one type.
   */
  types: PizzaType[];
  /** Attendees who flagged no topping to avoid. */
  flexibleCount: number;
  /** Total pizzas across every type. */
  totalPizzas: number;
};

/** Most distinct constrained pizza types to suggest before merging clusters. */
const MAX_CONSTRAINED_TYPES = 4;

/**
 * Partition attendees into a handful of pizza types, each described by the
 * toppings its pizza must avoid. Unrestricted attendees form one "any
 * toppings" type. The restricted ones start as one type per distinct
 * exclusion set, then the closest two types are merged - the pair whose
 * combined avoid-list is smallest - until at most MAX_CONSTRAINED_TYPES
 * remain. A subset folds into its superset for free, and real signups cluster
 * (lots of people skip the same topping), so this stays tight in practice.
 *
 * Every attendee lands in exactly one type. A type's pizza avoids the union
 * of its members' exclusions, so each member can always eat it; the organiser
 * picks the real toppings within that limit. Free-text "Other" notes are not
 * modelled here - they stay in ToppingAnalysis.freeTextNotes to read by hand.
 */
export function planOrder(args: {
  analysis: ToppingAnalysis;
  slicesPerPerson: number;
  slicesPerPizza: number;
}): OrderPlan {
  const perPerson = Math.max(1, Math.floor(args.slicesPerPerson));
  const perPizza = Math.max(1, Math.floor(args.slicesPerPizza));
  const pizzasFor = (people: number) =>
    Math.max(1, Math.ceil((people * perPerson) / perPizza));

  const flexibleCount =
    args.analysis.groups.find((g) => g.exclusions.length === 0)?.count ?? 0;

  // One cluster per distinct exclusion set, then merge the closest pair until
  // a handful remain. Merging costs the growth of the avoid-union, so a subset
  // collapses into its superset at no cost and tight clusters merge first.
  const clusters = args.analysis.groups
    .filter((g) => g.exclusions.length > 0)
    .map((g) => ({ avoid: new Set(g.exclusions), headcount: g.count }));

  while (clusters.length > MAX_CONSTRAINED_TYPES) {
    let mergeI = 0;
    let mergeJ = 1;
    let bestUnion = Infinity;
    let bestHeadcount = -1;
    for (let i = 0; i < clusters.length; i += 1) {
      for (let j = i + 1; j < clusters.length; j += 1) {
        const unionSize = new Set([
          ...clusters[i].avoid,
          ...clusters[j].avoid,
        ]).size;
        const headcount = clusters[i].headcount + clusters[j].headcount;
        // Smallest merged avoid-list wins; ties go to the bigger group so the
        // plan consolidates rather than scattering people.
        if (
          unionSize < bestUnion ||
          (unionSize === bestUnion && headcount > bestHeadcount)
        ) {
          bestUnion = unionSize;
          bestHeadcount = headcount;
          mergeI = i;
          mergeJ = j;
        }
      }
    }
    for (const t of clusters[mergeJ].avoid) clusters[mergeI].avoid.add(t);
    clusters[mergeI].headcount += clusters[mergeJ].headcount;
    clusters.splice(mergeJ, 1);
  }

  const constrainedTypes: PizzaType[] = clusters
    .map((c) => ({
      avoid: Array.from(c.avoid).sort(),
      headcount: c.headcount,
      quantity: pizzasFor(c.headcount),
    }))
    .sort(
      (a, b) => b.headcount - a.headcount || a.avoid.length - b.avoid.length,
    );

  const types: PizzaType[] = [];
  if (flexibleCount > 0) {
    types.push({
      avoid: [],
      headcount: flexibleCount,
      quantity: pizzasFor(flexibleCount),
    });
  }
  types.push(...constrainedTypes);

  return {
    types,
    flexibleCount,
    totalPizzas: types.reduce((n, t) => n + t.quantity, 0),
  };
}
