"use client";

import * as React from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Settings error:", error);
  }, [error]);

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            Could not load settings
          </CardTitle>
          <CardDescription>
            {error.message || "Most often this is a missing env variable."}
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
