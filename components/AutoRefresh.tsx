"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Rafraîchit la page quelques fois pendant que Stripe confirme le paiement. */
export function AutoRefresh({ seconds = 5, times = 4 }: { seconds?: number; times?: number }) {
  const router = useRouter();
  const count = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      count.current += 1;
      if (count.current > times) {
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds, times]);

  return null;
}
