// Alias for the setup wizard. The spec calls out two access points:
// the /onboarding URL (auto-loads after signup) and a manual /settings/setup
// route for users who want to re-run the wizard. We just redirect into
// /onboarding with ?redo=1 so a completed user can re-enter without the
// completion-check bouncing them straight back to the dashboard.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function SettingsSetupPage() {
  redirect("/onboarding?redo=1");
}
