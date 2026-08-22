"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Thin wrapper so app/layout.tsx doesn't need "use client" itself --
 * next-themes' ThemeProvider is a Client Component (it reads
 * localStorage/matchMedia), but the root layout otherwise stays a Server
 * Component. attribute="class" toggles the `dark` class on <html>, matching
 * app/globals.css's `.dark { ... }` block and `@custom-variant dark
 * (&:is(.dark *))` -- the same mechanism every component in this codebase
 * already assumes when it uses dark: variants or the semantic color tokens.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
