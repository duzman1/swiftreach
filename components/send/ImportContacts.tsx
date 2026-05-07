"use client";

import * as React from "react";
import { FileUpload } from "./FileUpload";
import { GoogleDrivePicker } from "./GoogleDrivePicker";
import type { ParsedFile } from "@/lib/parseFile";

interface Props {
  parsed: ParsedFile | null;
  onParsed: (file: ParsedFile) => void;
  onClear: () => void;
}

/**
 * Two-up layout: manual upload on the left, Google Drive on the right.
 * Once a file is parsed (from either source), collapses into the single
 * file-chip view rendered by FileUpload.
 *
 * The Google Drive option only renders when NEXT_PUBLIC_GOOGLE_CLIENT_ID is
 * set — the feature is fully optional.
 */
export function ImportContacts({ parsed, onParsed, onClear }: Props) {
  const googleEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

  if (parsed) {
    return <FileUpload parsed={parsed} onParsed={onParsed} onClear={onClear} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Import your contact list
      </p>
      <div
        className={
          googleEnabled
            ? "grid grid-cols-1 md:grid-cols-2 gap-3"
            : ""
        }
      >
        <FileUpload parsed={null} onParsed={onParsed} onClear={onClear} />
        {googleEnabled && <GoogleDrivePicker onParsed={onParsed} />}
      </div>
    </div>
  );
}
