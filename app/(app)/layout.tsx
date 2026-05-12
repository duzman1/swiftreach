import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shared/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // TEMPORARY DEBUG: surface any auth() or render error into the Vercel
  // function logs. The "Something went wrong" overlay after switching
  // Clerk to production hides the underlying error; this prints it so we
  // can see the real cause in https://vercel.com/.../logs.
  //
  // Note: Next's redirect() throws a NEXT_REDIRECT signal that is meant
  // to bubble up. We re-throw all errors after logging so behavior is
  // unchanged. Expect to see "Layout error: NEXT_REDIRECT" entries in
  // logs from every legitimate /sign-in redirect — ignore those; look
  // for any OTHER error.
  try {
    const { userId } = await auth();
    if (!userId) redirect("/sign-in");
    return <AppShell>{children}</AppShell>;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Layout error:", error);
    throw error;
  }
}
