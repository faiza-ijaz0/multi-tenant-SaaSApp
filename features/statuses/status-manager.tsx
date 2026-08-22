"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, CircleDot, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-error";
import { ConfirmDialog } from "@/components/states/confirm-dialog";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createStatus, deleteStatus, moveStatus, updateStatus } from "./actions";
import { DEFAULT_STATUS_COLOR, initialStatusFormState, MAX_STATUS_NAME_LENGTH } from "./form-state";
import type { Status } from "./queries";

function ColorField({ id, defaultValue }: { id: string; defaultValue?: string }) {
  const initial = defaultValue ?? DEFAULT_STATUS_COLOR;
  const [color, setColor] = useState(initial);

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-input bg-transparent p-1 pr-3">
      <input
        id={id}
        name="color"
        type="color"
        defaultValue={initial}
        onChange={(event) => setColor(event.target.value)}
        className="h-7 w-12 cursor-pointer rounded-md border-0 bg-transparent"
      />
      <span className="text-xs font-medium tabular-nums text-muted-foreground uppercase">{color}</span>
    </div>
  );
}

function CreateStatusForm({ onSuccess }: { onSuccess: () => void }) {
  const [state, formAction, isPending] = useActionState(createStatus, initialStatusFormState);

  useEffect(() => {
    if (state !== initialStatusFormState && state.status === "idle") {
      onSuccess();
    }
  }, [state, onSuccess]);

  return (
    <>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <form action={formAction} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="status-name">Name</Label>
          <Input id="status-name" name="name" required maxLength={MAX_STATUS_NAME_LENGTH} />
          {state.fieldErrors?.name ? (
            <p className="text-xs text-destructive">{state.fieldErrors.name}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status-color">Color</Label>
          <ColorField id="status-color" />
        </div>
        <Label htmlFor="status-closed" className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5 font-normal">
          <Checkbox id="status-closed" name="isClosed" />
          Closed workflow state (e.g. Done, Won&apos;t fix)
        </Label>
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating…" : "Create status"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function CreateStatusDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" aria-hidden="true" />
          New status
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New status</DialogTitle>
        </DialogHeader>
        {open ? <CreateStatusForm onSuccess={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EditStatusForm({ status, onSuccess }: { status: Status; onSuccess: () => void }) {
  const boundUpdate = updateStatus.bind(null, status.id);
  const [state, formAction, isPending] = useActionState(boundUpdate, initialStatusFormState);

  useEffect(() => {
    if (state !== initialStatusFormState && state.status === "idle") {
      onSuccess();
    }
  }, [state, onSuccess]);

  return (
    <>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <form action={formAction} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor={`status-name-${status.id}`}>Name</Label>
          <Input
            id={`status-name-${status.id}`}
            name="name"
            defaultValue={status.name}
            required
            maxLength={MAX_STATUS_NAME_LENGTH}
          />
          {state.fieldErrors?.name ? (
            <p className="text-xs text-destructive">{state.fieldErrors.name}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`status-color-${status.id}`}>Color</Label>
          <ColorField id={`status-color-${status.id}`} defaultValue={status.color} />
        </div>
        <Label
          htmlFor={`status-closed-${status.id}`}
          className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5 font-normal"
        >
          <Checkbox id={`status-closed-${status.id}`} name="isClosed" defaultChecked={status.isClosed} />
          Closed workflow state (e.g. Done, Won&apos;t fix)
        </Label>
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function EditStatusDialog({
  status,
  open,
  onOpenChange,
}: {
  status: Status;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit status</DialogTitle>
        </DialogHeader>
        {open ? <EditStatusForm status={status} onSuccess={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

export interface StatusPermissions {
  create: boolean;
  edit: boolean;
  delete: boolean;
}

function StatusRow({
  status,
  isFirst,
  isLast,
  permissions,
}: {
  status: Status;
  isFirst: boolean;
  isLast: boolean;
  permissions: StatusPermissions;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const showControls = permissions.edit || permissions.delete;

  return (
    <div className="group flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_8px_24px_-12px_hsl(var(--shadow-color)/0.3)]">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-current/15"
          style={{ backgroundColor: `${status.color}1a`, color: status.color }}
          aria-hidden="true"
        >
          <span className="size-2.5 rounded-full" style={{ backgroundColor: status.color }} />
        </span>
        <span className="truncate text-sm font-semibold text-foreground">{status.name}</span>
        {status.isClosed ? <Badge variant="secondary">Closed</Badge> : null}
      </div>
      {showControls ? (
        <div className="flex shrink-0 items-center gap-0.5 opacity-80 transition-opacity duration-150 group-hover:opacity-100">
          {permissions.edit ? (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Move up"
                disabled={isFirst || isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await moveStatus(status.id, "up");
                    if (!result.ok) toast.error(result.message ?? "Something went wrong.");
                  })
                }
              >
                <ArrowUp className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Move down"
                disabled={isLast || isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await moveStatus(status.id, "down");
                    if (!result.ok) toast.error(result.message ?? "Something went wrong.");
                  })
                }
              >
                <ArrowDown className="size-3.5" aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setEditOpen(true)}>
                <Pencil className="size-3.5" aria-hidden="true" />
              </Button>
            </>
          ) : null}
          {permissions.delete ? (
            <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ) : null}
      {permissions.edit ? (
        <EditStatusDialog status={status} open={editOpen} onOpenChange={setEditOpen} />
      ) : null}
      {permissions.delete ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Delete "${status.name}"?`}
          description="Statuses still used by submissions can't be deleted -- move those submissions to another status first."
          confirmLabel="Delete"
          destructive
          onConfirm={() =>
            startTransition(async () => {
              const result = await deleteStatus(status.id);
              if (!result.ok) toast.error(result.message ?? "Something went wrong.");
            })
          }
        />
      ) : null}
    </div>
  );
}

/** permissions: see the matching comment on CategoryManager -- same pattern. */
export function StatusManager({
  statuses,
  permissions,
}: {
  statuses: Status[];
  permissions: StatusPermissions;
}) {
  return (
    <div className="space-y-4">
      {permissions.create ? (
        <div className="flex justify-end">
          <CreateStatusDialog />
        </div>
      ) : null}
      {statuses.length === 0 ? (
        <EmptyState
          icon={<CircleDot className="size-5" aria-hidden="true" />}
          title="No statuses yet"
          description="Submissions need at least one status before they can be created."
        />
      ) : (
        <div className="space-y-2">
          {statuses.map((status, index) => (
            <StatusRow
              key={status.id}
              status={status}
              isFirst={index === 0}
              isLast={index === statuses.length - 1}
              permissions={permissions}
            />
          ))}
        </div>
      )}
    </div>
  );
}
