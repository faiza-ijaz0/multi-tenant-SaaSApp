"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { acceptInvitation } from "./actions";

export function AcceptInvitationButton({ token }: { token: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      className="w-full"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          // On success this redirects and never returns here -- see
          // acceptInvitation in features/members/actions.ts.
          const result = await acceptInvitation(token);
          if (result && !result.ok) toast.error(result.message ?? "Something went wrong.");
        })
      }
    >
      {isPending ? "Joining…" : "Accept invitation"}
    </Button>
  );
}
