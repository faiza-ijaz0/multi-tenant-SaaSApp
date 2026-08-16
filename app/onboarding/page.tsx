import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { getCurrentOrganizationContext } from "@/lib/auth/context";
import { OrganizationNotFoundError, UnauthenticatedError } from "@/lib/auth/errors";

export default async function OnboardingPage() {
  let hasOrganization = false;

  try {
    await getCurrentOrganizationContext();
    hasOrganization = true;
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login?next=/onboarding");
    }
    if (!(error instanceof OrganizationNotFoundError)) {
      // Unexpected failure -- let the nearest error boundary handle it
      // rather than silently showing the onboarding form over a real error.
      throw error;
    }
    // No organization yet -- exactly who onboarding is for.
  }

  // Already has an organization -- onboarding isn't for them, and creating
  // a second one just by visiting this page would be wrong. Redirecting
  // here (outside the try/catch above) rather than from inside the try
  // block keeps this unambiguous instead of relying on the catch block's
  // fallthrough to re-propagate it correctly.
  if (hasOrganization) {
    redirect("/dashboard");
  }

  return <OnboardingForm />;
}
