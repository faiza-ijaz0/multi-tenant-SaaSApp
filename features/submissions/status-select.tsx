"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/ui/native-select";
import type { Status } from "@/features/statuses/queries";

import { updateSubmissionStatus } from "./actions";

interface StatusSelectProps {
  submissionId: string;
  currentStatusId: string;
  statuses: Status[];
}

/**
 * A controlled <select>, deliberately -- a native uncontrolled <select>
 * updates its own displayed value the instant the user picks an option,
 * before the server action even runs. If updateSubmissionStatus then fails
 * (permission denied, a status from another org, a stale id), an
 * uncontrolled select would keep showing the attempted status instead of
 * the real one until the next full page load. Tracking the value explicitly
 * lets a failure revert the visible selection back to currentStatusId.
 *
 * currentStatusId is the server-confirmed value (re-fetched after any
 * successful revalidatePath) -- syncing to it via the "adjust state during
 * render" pattern (comparing against a mirrored previous-prop value) rather
 * than a useEffect, per React's own guidance: an effect here would commit
 * the stale value for one extra frame before correcting itself.
 */
export function StatusSelect({ submissionId, currentStatusId, statuses }: StatusSelectProps) {
  const [value, setValue] = useState(currentStatusId);
  const [prevStatusId, setPrevStatusId] = useState(currentStatusId);
  const [isPending, startTransition] = useTransition();

  if (currentStatusId !== prevStatusId) {
    setPrevStatusId(currentStatusId);
    setValue(currentStatusId);
  }

  return (
    <NativeSelect
      value={value}
      disabled={isPending}
      aria-label="Change status"
      className="w-auto"
      onChange={(event) => {
        const statusId = event.target.value;
        setValue(statusId);
        startTransition(async () => {
          const result = await updateSubmissionStatus(submissionId, statusId);
          if (!result.ok) {
            toast.error(result.message ?? "Something went wrong.");
            setValue(currentStatusId);
          }
        });
      }}
    >
      {statuses.map((status) => (
        <option key={status.id} value={status.id}>
          {status.name}
        </option>
      ))}
    </NativeSelect>
  );
}
