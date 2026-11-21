"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Surface to function logs / Vercel
    // eslint-disable-next-line no-console
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            Something went wrong
          </CardTitle>
          <CardDescription>
            Could not load this page. {error.message ? `Server said: ${error.message}.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error.digest && (
            <p className="text-xs text-muted-foreground">
              Reference: <code className="font-mono">{error.digest}</code>
            </p>
          )}
          {/* Two escape hatches. Try again covers transient errors
              (network blip, SSR race); Back to home gets the user
              out of a persistent-failure state so they're not stuck
              on a spinning page. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={reset} className="gap-2">
              <RotateCcw className="w-4 h-4" />
              Try again
            </Button>
            <Link href="/">
              <Button variant="outline" className="gap-2">
                <Home className="w-4 h-4" />
                Back to home
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
