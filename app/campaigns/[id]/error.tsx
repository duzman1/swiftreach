"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, RotateCcw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CampaignDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Campaign detail error:", error);
  }, [error]);

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/campaigns"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to all campaigns
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            Could not load campaign
          </CardTitle>
          <CardDescription>
            {error.message || "Something went wrong fetching this campaign."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={reset} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
