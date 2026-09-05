"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  // `theme` reflects the user's stored/system preference — it does NOT account for
  // `forcedTheme` (next-themes keeps them as separate fields on purpose). The app forces
  // light mode app-wide (see ThemeProvider in layout.tsx), so without checking `forcedTheme`
  // first, a visitor with a dark OS/browser preference would get dark-styled toasts while
  // every other themed surface in the app correctly renders light.
  const { theme = "system", forcedTheme } = useTheme();
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
