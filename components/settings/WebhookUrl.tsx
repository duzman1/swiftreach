"use client";

import * as React from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  url: string;
}

export function WebhookUrl({ url }: Props) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Webhook URL copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — copy manually");
    }
  }

  return (
    <div className="flex items-stretch gap-2">
      <code className="flex-1 text-xs bg-zinc-100 px-3 py-2 rounded break-all min-w-0">
        {url}
      </code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={copy}
        className="shrink-0 gap-1.5"
        aria-label="Copy webhook URL"
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5" />
            Copy
          </>
        )}
      </Button>
    </div>
  );
}
