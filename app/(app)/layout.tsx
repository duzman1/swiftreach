import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shared/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // TEMPORARY DEBUG: surface any auth() error into the Vercel function
  // logs. The "Something went wrong" overlay after switching Clerk to
  // production hides the underlying error; this prints it so we can see
  // the real cause in https://vercel.com/.../logs.
  //
  // We MUST re-throw NEXT_REDIRECT (used by redirect()) and skip
  // DYNAMIC_SERVER_USAGE (used by Next at build time to decide static
  // vs. dynamic rendering). Both are control-flow signals, not errors.
  try {
    const { userId } = await auth();
    if (!userId) redirect("/sign-in");
    return <AppShell>{children}</AppShell>;
  } catch (error) {
    const digest = (error as { digest?: string })?.digest;
    if (digest !== "NEXT_REDIRECT" && digest !== "DYNAMIC_SERVER_USAGE") {
      // eslint-disable-next-line no-console
      console.error("Layout error:", error);
    }
    throw error;
  }
}
