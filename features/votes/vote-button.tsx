"use client";

import { useTransition } from "react";
import { ArrowBigUp } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { addVote, removeVote } from "./actions";

interface VoteButtonProps {
  submissionId: string;
  voteCount: number;
  hasVoted: boolean;
}

export function VoteButton({ submissionId, voteCount, hasVoted }: VoteButtonProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={hasVoted ? "default" : "outline"}
      size="sm"
      disabled={isPending}
      aria-pressed={hasVoted}
      className="h-auto flex-col gap-0.5 px-3 py-1.5"
      onClick={() =>
        startTransition(async () => {
          const result = hasVoted ? await removeVote(submissionId) : await addVote(submissionId);
          if (!result.ok) toast.error(result.message ?? "Something went wrong.");
        })
      }
    >
      <ArrowBigUp className="size-4" aria-hidden="true" />
      <span className="text-xs font-semibold">{voteCount}</span>
    </Button>
  );
}
