"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, Plug } from "lucide-react";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ok";
      displayPhoneNumber?: string;
      verifiedName?: string;
      qualityRating?: string;
    }
  | { kind: "error"; message: string; code?: string | number };

export function TestConnectionButton() {
  const [state, setState] = React.useState<State>({ kind: "idle" });

  async function run() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/settings/test-connection", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setState({
          kind: "ok",
          displayPhoneNumber: data.displayPhoneNumber,
          verifiedName: data.verifiedName,
          qualityRating: data.qualityRating,
        });
      } else {
        setState({
          kind: "error",
          message: data.error ?? "Unknown error",
          code: data.code,
        });
      }
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        onClick={run}
        disabled={state.kind === "loading"}
        className="gap-2"
      >
        {state.kind === "loading" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Plug className="w-4 h-4" />
        )}
        Test Connection
      </Button>

      {state.kind === "ok" && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 space-y-1">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            Connection successful
          </div>
          {state.displayPhoneNumber && (
            <div className="text-xs">
              Phone: <strong>{state.displayPhoneNumber}</strong>
            </div>
          )}
          {state.verifiedName && (
            <div className="text-xs">
              Verified name: <strong>{state.verifiedName}</strong>
            </div>
          )}
          {state.qualityRating && (
            <div className="text-xs">
              Quality rating: <strong>{state.qualityRating}</strong>
            </div>
          )}
        </div>
      )}

      {state.kind === "error" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 space-y-1">
          <div className="flex items-center gap-2 font-medium">
            <XCircle className="w-4 h-4" />
            Connection failed
          </div>
          <div className="text-xs">
            {state.code ? <span className="font-mono">[{state.code}] </span> : null}
            {state.message}
          </div>
        </div>
      )}
    </div>
  );
}
