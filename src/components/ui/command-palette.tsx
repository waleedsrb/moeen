"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  CommandPalette as HairlineCommandPalette,
  type CommandItem,
} from "@/components/ui/hairline-command-palette";
import { searchRegistry, type SearchItem } from "@/lib/search/registry";
import { useTheme } from "@/components/theme-provider";
import { setSoundMuted, getMutedSnapshot } from "@/lib/utils/notification-sound";
import { signOut } from "@/lib/auth/sign-out";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  const items = useMemo<CommandItem[]>(() => {
    function runAction(item: SearchItem) {
      if (item.href) {
        router.push(item.href);
        return;
      }

      switch (item.action) {
        case "toggle-theme":
          setTheme(resolvedTheme === "dark" ? "light" : "dark");
          break;
        case "toggle-sound":
          setSoundMuted(!getMutedSnapshot());
          break;
        case "sign-out":
          signOut().then(() => {
            router.push("/login");
            router.refresh();
          });
          break;
      }
    }

    return searchRegistry.map((item) => {
      const Icon = item.icon;
      return {
        id: item.id,
        label: item.label,
        group: item.category,
        keywords: item.keywords,
        icon: Icon ? <Icon className="h-4 w-4" /> : undefined,
        onSelect: () => runAction(item),
      };
    });
  }, [router, resolvedTheme, setTheme]);

  return (
    <HairlineCommandPalette
      items={items}
      placeholder="Search pages, settings, actions..."
      hotkey=""
      showTrigger={false}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
