"use client";

import { useTheme } from "next-themes";
import { LuMoon, LuSun } from "react-icons/lu";

import { Button } from "@/components/ui/button";

/**
 * Toggles between the light and dark semantic color themes.
 */
export function ThemeToggle() {
  const { setTheme } = useTheme();

  function toggleTheme() {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "light" : "dark");
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      title="Toggle light and dark theme"
      onClick={toggleTheme}>
      <LuSun className="hidden size-4 dark:block" aria-hidden="true" />
      <LuMoon className="size-4 dark:hidden" aria-hidden="true" />
    </Button>
  );
}
