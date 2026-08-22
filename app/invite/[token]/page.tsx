import Link from "next/link";
import { redirect } from "next/navigation";

import { AcceptInvitationButton } from "@/features/members/accept-invitation-button";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

/**
 * Next.js signals its own internal control flow (redirect(), notFound(),
 * the build-time "can this route be static?" probe) by throwing an Error
 * tagged with a `digest` string -- these must always be rethrown, never
 * treated as an application error. Same helper/rationale as
 * app/dashboard/layout.tsx's isNextInternalSignal -- kept local rather than
 * shared, matching this codebase's existing tolerance for a small
 * duplicated helper per feature (see features/members/actions.ts's
 * getOrigin()).
 */
function isNextInternalSignal(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    (digest === "DYNAMIC_SERVER_USAGE" ||
      digest.startsWith("NEXT_REDIRECT") ||
      digest.startsWith("NEXT_NOT_FOUND"))
  );
}

type InvitationPreviewStatus = "valid" | "expired" | "accepted" | "wrong_email" | "not_found";

interface InvitationPreview {
  status: InvitationPreviewStatus;
  organizationName: string | null;
  role: string | null;
}

/** A reasonable shape check before ever hitting the database -- the real
 * tokens this app generates (features/members/invitations.ts) are 64 hex
 * characters; anything else can't possibly match and is treated as
 * not_found without a round-trip. */
function looksLikeToken(value: string): boolean {
  return /^[0-9a-f]{16,128}$/i.test(value);
}

/**
 * get_invitation_preview (0005_invitation_acceptance.sql, applied and
 * verified live) is a read-only SECURITY DEFINER RPC -- the only way this
 * page can show "who invited you to what" at all, since
 * invitations_select_admin blocks a non-admin invitee from reading the row
 * directly, and it does not mutate anything (accepting is a separate,
 * explicit action -- see AcceptInvitationButton). It already checks the
 * caller's authenticated email against the invitation internally and
 * returns 'wrong_email' rather than organization details for a mismatch,
 * so this page never has organization data to accidentally leak before
 * that check passes.
 *
 * Any unexpected RPC error (network issue, unrelated DB error) is still
 * handled below by falling back to 'not_found' rather than crashing --
 * this keeps a transient failure from leaking anything beyond "this
 * invitation doesn't work right now."
 */
async function loadInvitationPreview(token: string): Promise<InvitationPreview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_invitation_preview", { p_token: token });

  if (error) {
    console.error("get_invitation_preview failed:", error);
    return { status: "not_found", organizationName: null, role: null };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    status: (row?.status as InvitationPreviewStatus) ?? "not_found",
    organizationName: (row?.organization_name as string | null) ?? null,
    role: (row?.role as string | null) ?? null,
  };
}

const STATUS_COPY: Record<Exclude<InvitationPreviewStatus, "valid">, { title: string; description: string }> = {
  not_found: {
    title: "Invitation not found",
    description: "This invitation link is invalid.",
  },
  expired: {
    title: "Invitation expired",
    description: "This invitation has expired. Ask an admin to send a new one.",
  },
  accepted: {
    title: "Already accepted",
    description: "This invitation has already been accepted.",
  },
  wrong_email: {
    title: "Wrong account",
    description: "This invitation is for a different email address. Sign in with the email address it was sent to.",
  },
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;

  let isAuthenticated = true;
  try {
    await getCurrentUser();
  } catch (error) {
    if (isNextInternalSignal(error)) throw error;
    isAuthenticated = false;
  }
  if (!isAuthenticated) {
    redirect(`/login?next=/invite/${token}`);
  }

  if (!looksLikeToken(token)) {
    const copy = STATUS_COPY.not_found;
    return (
      <Card>
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const preview = await loadInvitationPreview(token);

  if (preview.status !== "valid") {
    const copy = STATUS_COPY[preview.status];
    return (
      <Card>
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard" className="text-sm font-medium text-foreground hover:underline">
            Go to dashboard
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join {preview.organizationName}</CardTitle>
        <CardDescription>You&apos;ve been invited to join as {preview.role}.</CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptInvitationButton token={token} />
      </CardContent>
    </Card>
  );
}
