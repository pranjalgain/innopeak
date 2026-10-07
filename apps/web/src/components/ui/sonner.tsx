"use client";

import { useTheme } from "next-themes";
import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  // `theme` ignores `forcedTheme` (next-themes keeps them separate), so check it first in case a screen
  // forces a theme. Falls back to "light", not "system": `ThemeProvider` has `enableSystem={false}`.
  const { theme = "light", forcedTheme } = useTheme();
  const activeTheme = forcedTheme ?? theme;

  return (
    <Sonner
      theme={activeTheme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
