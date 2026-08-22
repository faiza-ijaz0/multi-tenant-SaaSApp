"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ListChecks, LogOut, UserRound } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { customerSignOut } from "@/lib/auth/customer-auth-actions";

interface CustomerAccountMenuProps {
  slug: string;
  fullName: string | null;
  email: string | null;
}

function initialsFrom(fullName: string | null, email: string | null): string {
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
    if (initials.join("")) return initials.join("");
  }
  return email?.[0]?.toUpperCase() ?? "?";
}

export function CustomerAccountMenu({ slug, fullName, email }: CustomerAccountMenuProps) {
  const displayName = fullName ?? email ?? "Your account";
  const [isSigningOut, startSignOutTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full transition-all duration-200 hover:bg-transparent hover:ring-2 hover:ring-primary/25"
          aria-label="Open account menu"
        >
          <Avatar className="size-8 ring-2 ring-primary/15">
            <AvatarFallback className="bg-gradient-to-br from-primary/25 to-sky/30 text-primary">
              {initialsFrom(fullName, email)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-start gap-2.5 px-2 py-2">
          <Avatar className="size-9 shrink-0 ring-2 ring-primary/15">
            <AvatarFallback className="bg-gradient-to-br from-primary/25 to-sky/30 text-primary">
              {initialsFrom(fullName, email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
            {email ? <p className="truncate text-xs text-muted-foreground">{email}</p> : null}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/feedback/${slug}/my-feedback`}>
            <ListChecks className="size-4" aria-hidden="true" />
            My Feedback
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/feedback/${slug}/profile`}>
            <UserRound className="size-4" aria-hidden="true" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={isSigningOut}
          onSelect={() => {
            startSignOutTransition(() => {
              void customerSignOut();
            });
          }}
        >
          <LogOut className="size-4" aria-hidden="true" />
          {isSigningOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
