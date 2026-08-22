"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/auth-actions";

/**
 * Same signOut()-via-useTransition pattern as the topbar's account menu
 * (components/layout/dashboard-topbar.tsx) -- reused here, not
 * reimplemented, since this page must offer a safe way out for an account
 * with zero granted pages (nothing else on this page can, since it
 * deliberately renders under the shared dashboard shell without requiring
 * any page permission of its own).
 */
export function NoAccessSignOutButton() {
  const [isSigningOut, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isSigningOut}
      onClick={() => startTransition(() => void signOut())}
    >
      <LogOut className="size-4" aria-hidden="true" />
      {isSigningOut ? "Signing out…" : "Sign out"}
    </Button>
  );
}
