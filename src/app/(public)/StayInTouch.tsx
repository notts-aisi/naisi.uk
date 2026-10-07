import NetField from "@/components/ui/NetField";
import SubscribeForm from "@/components/SubscribeForm";
import { STAY_IN_TOUCH_ID } from "./homeWords";
import styles from "./landing.module.css";

/**
 * THE MAILING LIST SECTION, at the foot of the homepage.
 *
 * Its id is `stay-in-touch`, and that id is an address other things depend
 * on: the `/stay-in-touch` redirect, the hero's buttons and links in the
 * programme pages all land here. It does not change.
 *
 * The form offers the two lists that exist, with nothing ticked in advance.
 * What the form is handed is written out here, as plain values.
 */
export default function StayInTouch() {
  return (
    <section id={STAY_IN_TOUCH_ID} className={styles.mailing}>
      <NetField net="hero" strength="soft" className={styles.mailingField}>
        <div className={`container ${styles.mailingRow}`}>
          <div className={styles.mailingWords}>
            <p className={`meta ${styles.eyebrow} ${styles.eyebrowLive}`}>Stay in touch</p>
            <h2 className={`${styles.title} ${styles.mailingTitle}`}>Get the emails.</h2>
            <p className={`${styles.lede} ${styles.mailingLede}`}>
              Tick what you want to hear about, and that’s all we’ll send. The newsletter is a round-up of
              what’s going on in AI safety.
            </p>
            <p className={styles.mailingNote}>
              You don’t need an account, and you can unsubscribe from any email.
            </p>
          </div>
          <div className={styles.mailingCard}>
            <SubscribeForm
              source="homepage"
              channels={[
                {
                  id: "events",
                  label: "Events",
                  description: "An email when we add a new event.",
                },
                {
                  id: "newsletter",
                  label: "The newsletter",
                  description: "It’s also where we say when applications open.",
                },
              ]}
            />
          </div>
        </div>
      </NetField>
    </section>
  );
}
