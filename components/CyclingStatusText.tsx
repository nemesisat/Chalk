"use client";

import { useEffect, useState } from "react";

export function CyclingStatusText({
  messages,
  active = true,
  intervalMs = 1800,
}: {
  messages: readonly string[];
  active?: boolean;
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (!active || messages.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % messages.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs, messages]);

  return <span>{messages[index] ?? messages[0]}</span>;
}
