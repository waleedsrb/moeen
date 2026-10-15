"use client";

import { ThemeToggle as HairlineThemeToggle } from "@/components/ui/theme-toggle";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  // Driven by ThemeProvider, so the choice stays under its "moeen-theme" key.
  return <HairlineThemeToggle value={theme} onValueChange={setTheme} />;
}
