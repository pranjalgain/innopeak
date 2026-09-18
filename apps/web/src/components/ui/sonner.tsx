"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  // `theme` reflects the user's stored preference — it does NOT account for `forcedTheme`
  // (next-themes keeps them as separate fields on purpose). Nothing sets `forcedTheme` app-wide
  // any more (see `ThemeProvider` in layout.tsx — `ThemeToggle` lets a visitor pick light/dark
  // directly), so `forcedTheme` is `undefined` in practice today; checking it first still costs
  // nothing and keeps this correct if a future screen ever needs to force one theme for itself
  // via next-themes' own per-subtree `forcedTheme` prop. Falls back to `"light"`, not `"system"`
  // — `ThemeProvider` has `enableSystem={false}`, so `theme` is only ever `"light"` or `"dark"`.
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
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
