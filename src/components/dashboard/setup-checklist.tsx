"use client";

import { useState } from "react";
import { OnboardingChecklist } from "@/components/ui/onboarding-checklist";

interface SetupChecklistProps {
  instagramConnected: boolean;
  hasProducts: boolean;
  hasPersona: boolean;
}

// First-run setup on the dashboard. Each task is driven by real data, so a
// step ticks itself off once the merchant has actually done it.
export function SetupChecklist({
  instagramConnected,
  hasProducts,
  hasPersona,
}: SetupChecklistProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <OnboardingChecklist
      title="Set up Mo'een"
      doneTitle="You're all set"
      doneDescription="Customer DMs will now show up here as orders."
      onDismiss={() => setDismissed(true)}
      tasks={[
        {
          id: "instagram",
          title: "Connect your Instagram account",
          description:
            "Receive customer DMs on your dashboard and let AI extract orders.",
          action: { label: "Connect", href: "/settings" },
          done: instagramConnected,
        },
        {
          id: "products",
          title: "Add your products",
          description:
            "The AI matches what customers ask for against your catalog.",
          action: { label: "Add products", href: "/inventory" },
          done: hasProducts,
        },
        {
          id: "persona",
          title: "Give your assistant a name and tone",
          description: "Customers see this voice when the AI replies.",
          action: { label: "Set persona", href: "/settings" },
          done: hasPersona,
        },
      ]}
    />
  );
}
