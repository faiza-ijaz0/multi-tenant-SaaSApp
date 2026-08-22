import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SignalBoard",
    template: "%s · SignalBoard",
  },
  description: "Customer feedback and product insights platform.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // next-themes sets the `dark` class on this element before hydration
      // via an injected inline script, based on system preference/
      // localStorage -- that means the server-rendered class list and the
      // client's first-paint class list legitimately differ for one
      // attribute, by design. suppressHydrationWarning (documented
      // requirement of next-themes) scopes React's hydration-mismatch
      // check to skip only this element's attributes, not its children.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
