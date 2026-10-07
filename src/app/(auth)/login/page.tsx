import { Suspense } from "react";
import Card from "@/components/ui/Card";
import AuthEntry from "../AuthEntry";
import styles from "../register/registerSignIn.module.css";

export default function LoginPage() {
  // useSearchParams (inside AuthEntry) must sit under a Suspense boundary in
  // Next 16 so the bailout-to-CSR is explicit at build time.
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <AuthEntry initialMode="signin" />
    </Suspense>
  );
}

function LoginSkeleton() {
  return (
    <div className={styles.frame}>
      <Card padding="lg" className={styles.card} style={{ width: "100%", minHeight: "14rem" }}>
        <p className={styles.para}>Loading…</p>
      </Card>
    </div>
  );
}
