"use client";

import * as React from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CampaignsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Campaigns error:", error);
  }, [error]);

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            Could not load campaigns
          </CardTitle>
          <CardDescription>
            {error.message || "Something went wrong fetching the campaign list."}
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
