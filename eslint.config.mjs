import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Vendored Hairline UI components (MIT, hairlineui.com). They read refs and
  // mutate DOM values during render on purpose for their animations, which
  // the React Compiler rules flag. Keep them close to upstream instead.
  {
    files: [
    "src/components/ui/action-receipt.tsx",
    "src/components/ui/approval-card.tsx",
    "src/components/ui/attachment-chip.tsx",
    "src/components/ui/chat-history.tsx",
    "src/components/ui/chat-notice.tsx",
    "src/components/ui/clarifying-question.tsx",
    "src/components/ui/data-table.tsx",
    "src/components/ui/drop-zone-file-row.tsx",
    "src/components/ui/drop-zone-status.tsx",
    "src/components/ui/drop-zone-types.ts",
    "src/components/ui/drop-zone-utils.ts",
    "src/components/ui/drop-zone.tsx",
    "src/components/ui/faq-accordion.tsx",
    "src/components/ui/feature-tabs.tsx",
    "src/components/ui/filter-bar.tsx",
    "src/components/ui/hairline-command-palette.tsx",
    "src/components/ui/hairline-date-range-picker.tsx",
    "src/components/ui/kanban-board.tsx",
    "src/components/ui/logo-marquee.tsx",
    "src/components/ui/newsletter-footer.tsx",
    "src/components/ui/number-roll.tsx",
    "src/components/ui/onboarding-checklist.tsx",
    "src/components/ui/prompt-composer.tsx",
    "src/components/ui/scroll-story.tsx",
    "src/components/ui/stats-band.tsx",
    "src/components/ui/status-button.tsx",
    "src/components/ui/steps-form.tsx",
    "src/components/ui/tag-input.tsx",
    "src/components/ui/text-morph.tsx",
    "src/components/ui/theme-toggle.tsx",
    "src/components/ui/thinking-indicator.tsx",
    "src/components/ui/toast-stack.tsx",
    "src/components/ui/ui-interaction-motion.ts",
    "src/components/ui/use-board-drag.ts",
    "src/components/ui/use-drop-zone.ts",
    "src/components/ui/use-row-motion.ts",
    "src/components/ui/use-token-flip.ts",
    "src/components/ui/voice-note.tsx",
    ],
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
