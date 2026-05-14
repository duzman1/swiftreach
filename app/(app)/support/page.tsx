// Authenticated support page. Server-renders the resource cards and
// the user's recent ticket history; the contact form itself is the
// client component below so it can manage the submit/success state
// without a roundtrip.

import Link from "next/link";
import { Mail, BookOpen, HandHelping } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SupportForm } from "@/components/support/SupportForm";
import { SupportHistoryTable } from "@/components/support/SupportHistoryTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support" };

export default async function SupportPage() {
  const user = await requireUser();

  const recent = await prisma.supportRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      reference: true,
      category: true,
      subject: true,
      priority: true,
      status: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Support</h1>
        <p className="text-muted-foreground mt-1">
          We typically respond within 24 hours.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Contact Support</CardTitle>
          <CardDescription>
            Sending as <strong>{user.email}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SupportForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Other ways to get help</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            <li className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-whatsapp mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium">Email us directly</div>
                <a
                  href="mailto:support@swiftreach.app"
                  className="text-sm text-whatsapp hover:underline"
                >
                  support@swiftreach.app
                </a>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <BookOpen className="w-5 h-5 text-whatsapp mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-medium">Setup Guide</div>
                <p className="text-xs text-muted-foreground">
                  Step-by-step WhatsApp connection guide.
                </p>
                <Link
                  href="/onboarding?mode=manual"
                  className="text-sm text-whatsapp hover:underline"
                >
                  View Setup Guide →
                </Link>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <HandHelping className="w-5 h-5 text-whatsapp mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-medium">Done-For-You Setup</div>
                <p className="text-xs text-muted-foreground">
                  We set everything up for you — $149.
                </p>
                <Link
                  href="/onboarding"
                  className="text-sm text-whatsapp hover:underline"
                >
                  Learn More →
                </Link>
              </div>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My Support History</CardTitle>
          <CardDescription>Your last 5 support requests.</CardDescription>
        </CardHeader>
        <CardContent>
          <SupportHistoryTable
            initial={recent.map((r) => ({
              ...r,
              createdAt: r.createdAt.toISOString(),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
