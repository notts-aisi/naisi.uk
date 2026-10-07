"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import ResponsiveSelect from "@/components/ui/ResponsiveSelect";
import type {
  EventDoc,
  MultiSelectQuestion,
  RsvpDoc,
} from "@/lib/firestore/events";
import { analyseToppingExclusions, planOrder } from "./pizzaHelper";
import styles from "./OrderHelper.module.css";

type Props = {
  event: EventDoc;
  /** Confirmed RSVPs - the people the food is being ordered for. */
  rsvps: RsvpDoc[];
};

/**
 * Turns the "toppings to avoid" answers into an actionable order: how
 * exclusions cluster, which toppings are safe, and a rough pizza count. Sits on
 * the attendee dashboard for pizza-style events.
 */
export default function OrderHelper({ event, rsvps }: Props) {
  const multiSelects = event.signupForm.filter(
    (q): q is MultiSelectQuestion => q.type === "multiSelect",
  );
  const [questionId, setQuestionId] = useState(multiSelects[0]?.id ?? "");
  const [slicesPerPerson, setSlicesPerPerson] = useState(3);
  const [slicesPerPizza, setSlicesPerPizza] = useState(8);

  const question = multiSelects.find((q) => q.id === questionId) ?? multiSelects[0];

  // Cheap pure analysis (tens of RSVPs); React Compiler memoizes it for us.
  const analysis = question ? analyseToppingExclusions(rsvps, question) : null;

  if (!question || !analysis) return null;

  const plan = planOrder({ analysis, slicesPerPerson, slicesPerPizza });

  const excluded = analysis.toppingCounts.filter((t) => t.count > 0);
  const maxCount = excluded[0]?.count ?? 1;

  return (
    <section className={styles.section}>
      <div>
        <h2 className={styles.title}>Pizza order helper</h2>
        <p className={styles.hint}>
          Worked out from the “toppings to avoid” answers of {analysis.headcount}{" "}
          {analysis.headcount === 1 ? "person" : "people"} with a confirmed place.
        </p>
      </div>

      {multiSelects.length > 1 && (
        <div className={styles.picker}>
          <ResponsiveSelect
            value={question.id}
            onChange={setQuestionId}
            options={multiSelects.map((q) => ({
              value: q.id,
              label: q.label || "(untitled question)",
            }))}
            ariaLabel="Which question lists toppings to avoid"
          />
        </div>
      )}

      {analysis.headcount === 0 ? (
        <Card padding="md">
          <p className={styles.muted}>
            Nobody has a confirmed place yet. The numbers show here as you approve requests.
          </p>
        </Card>
      ) : (
        <>
          <div className={styles.grid}>
            <Card padding="md">
              <h3 className={styles.cardTitle}>How they align</h3>
              <ul className={styles.groupList}>
                {analysis.groups.map((g) => (
                  <li key={g.exclusions.join("|")} className={styles.groupRow}>
                    <span className={styles.groupCount}>{g.count}</span>
                    <span className={styles.groupDesc}>
                      {g.exclusions.length === 0
                        ? "will eat anything"
                        : `avoid ${g.exclusions.join(", ")}`}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card padding="md">
              <h3 className={styles.cardTitle}>Toppings to avoid</h3>
              {excluded.length === 0 ? (
                <p className={styles.muted}>Nobody flagged a topping to avoid.</p>
              ) : (
                <ul className={styles.tallyList}>
                  {excluded.map((t) => (
                    <li key={t.topping} className={styles.tallyRow}>
                      <span className={styles.tallyName}>{t.topping}</span>
                      <span className={styles.bar}>
                        <span
                          className={styles.barFill}
                          style={{ width: `${(t.count / maxCount) * 100}%` }}
                        />
                      </span>
                      <span className={styles.tallyCount}>{t.count}</span>
                    </li>
                  ))}
                </ul>
              )}
              {analysis.safeToppings.length > 0 && (
                <p className={styles.safe}>
                  Safe for everyone: {analysis.safeToppings.join(", ")}.
                </p>
              )}
            </Card>
          </div>

          <Card padding="md">
            <h3 className={styles.cardTitle}>Suggested order</h3>
            <div className={styles.mathRow}>
              <div className={styles.mathField}>
                <Field id="order-slices-per-person" label="Slices per person">
                  <Input
                    id="order-slices-per-person"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={slicesPerPerson}
                    onChange={(e) => {
                      const n = Math.floor(Number(e.target.value));
                      if (Number.isFinite(n) && n >= 1 && n <= 50) {
                        setSlicesPerPerson(n);
                      }
                    }}
                  />
                </Field>
              </div>
              <div className={styles.mathField}>
                <Field id="order-slices-per-pizza" label="Slices per pizza">
                  <Input
                    id="order-slices-per-pizza"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={slicesPerPizza}
                    onChange={(e) => {
                      const n = Math.floor(Number(e.target.value));
                      if (Number.isFinite(n) && n >= 1 && n <= 50) {
                        setSlicesPerPizza(n);
                      }
                    }}
                  />
                </Field>
              </div>
            </div>

            {plan.types.length === 1 && plan.types[0].avoid.length === 0 ? (
              <p className={styles.recommend}>
                Nobody flagged a topping to avoid. Order{" "}
                <strong>{plan.totalPizzas}</strong> pizza
                {plan.totalPizzas === 1 ? "" : "s"} of whatever you like.
              </p>
            ) : (
              <>
                <p className={styles.planIntro}>
                  Everyone is put into one kind of pizza. Order the numbers
                  below, then choose the toppings yourself, keeping each pizza
                  clear of the ones its group avoids.
                </p>
                <ul className={styles.planList}>
                  {plan.types.map((t) => (
                    <li
                      key={t.avoid.join("|") || "any"}
                      className={styles.planRow}
                    >
                      <span className={styles.planQty}>{t.quantity}×</span>
                      <span className={styles.planDesc}>
                        <strong>
                          {t.avoid.length === 0
                            ? "Any toppings"
                            : `Avoid ${t.avoid.join(", ")}`}
                        </strong>
                        <span className={styles.planFeeds}>
                          {t.avoid.length === 0
                            ? `for ${t.headcount} with nothing to avoid`
                            : `for ${t.headcount} ${t.headcount === 1 ? "person" : "people"}`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className={styles.result}>
                  <span className={styles.resultBig}>{plan.totalPizzas}</span>{" "}
                  pizza{plan.totalPizzas === 1 ? "" : "s"} total.
                </p>
                {plan.flexibleCount > 0 && (
                  <p className={styles.muted}>
                    {`The ${plan.flexibleCount} with nothing to avoid can eat ` +
                      `any pizza here, so if a topping-limited pizza has spare ` +
                      `slices you may not need every "any toppings" one.`}
                  </p>
                )}
                <p className={styles.muted}>
                  An estimate. Change the slice counts to match your plan. Any
                  notes below still need reading.
                </p>
              </>
            )}
          </Card>

          {analysis.freeTextNotes.length > 0 && (
            <Card padding="md">
              <h3 className={styles.cardTitle}>Notes to check by hand</h3>
              <p className={styles.noteHint}>
                What people typed in the “Other” box of the toppings question.
                Read each one as a topping that person wants to avoid, and
                work it into the order by hand.
              </p>
              <ul className={styles.noteList}>
                {analysis.freeTextNotes.map((n, i) => (
                  <li key={i}>
                    <strong>{n.name}:</strong> {n.text}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </section>
  );
}
