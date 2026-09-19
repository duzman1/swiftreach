"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, Upload, Users } from "lucide-react";
import { FileUpload } from "./FileUpload";
import { GoogleDrivePicker } from "./GoogleDrivePicker";
import { ContactBookPicker } from "./ContactBookPicker";
import { AudiencePicker } from "./AudiencePicker";
import type { ParsedFile } from "@/lib/parseFile";

interface Props {
  parsed: ParsedFile | null;
  onParsed: (file: ParsedFile) => void;
  onClear: () => void;
  defaultCountryCode?: string;
}

/**
 * Four-up layout (three if Google Drive isn't configured): file upload,
 * Google Drive, Contact Book, Saved Audience. When a file is fully
 * parsed, collapses into the single file-chip view rendered by
 * FileUpload. When FileUpload has bounced into its multi-sheet picker,
 * we KEEP FileUpload mounted at the same position — hiding the sibling
 * tiles and dropping the grid layout — so its internal `phase` state
 * survives (an earlier version rendered a second FileUpload in that
 * branch, which unmounted the first and reset its phase back to
 * "idle", killing the sheet picker before the user could see it).
 *
 * The Contact Book auto-opens when ?group=<id> is present in the URL —
 * the /contacts → "Use in Campaign" deep-link relies on this.
 */
export function ImportContacts({
  parsed,
  onParsed,
  onClear,
  defaultCountryCode = "1",
}: Props) {
  const googleEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
  const searchParams = useSearchParams();
  const groupFromUrl = searchParams?.get("group") ?? null;
  const [contactBookOpen, setContactBookOpen] = React.useState(false);
  const [audiencePickerOpen, setAudiencePickerOpen] = React.useState(false);
  // True when FileUpload has swapped its drop zone for the multi-sheet
  // picker. Used to hide the sibling import tiles (Google Drive /
  // Contact Book / Saved Audience) so the picker isn't crammed into
  // a narrow grid cell. FileUpload itself STAYS at the same position
  // in the tree — see the file-header comment for why.
  const [fileUploadFullWidth, setFileUploadFullWidth] = React.useState(false);

  React.useEffect(() => {
    if (groupFromUrl && !parsed && !contactBookOpen) {
      setContactBookOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupFromUrl]);

  if (parsed) {
    return (
      <FileUpload
        parsed={parsed}
        onParsed={onParsed}
        onClear={onClear}
        onFullWidthChange={setFileUploadFullWidth}
      />
    );
  }

  if (contactBookOpen) {
    return (
      <ContactBookPicker
        defaultCountryCode={defaultCountryCode}
        initialGroupId={groupFromUrl}
        onParsed={(file) => {
          setContactBookOpen(false);
          onParsed(file);
        }}
        onCancel={() => setContactBookOpen(false)}
      />
    );
  }

  if (audiencePickerOpen) {
    return (
      <AudiencePicker
        onParsed={(file) => {
          setAudiencePickerOpen(false);
          onParsed(file);
        }}
        onCancel={() => setAudiencePickerOpen(false)}
      />
    );
  }

  // Four import options when Google is enabled, three when not.
  const cols = googleEnabled ? "md:grid-cols-4" : "md:grid-cols-3";
  // Grid vs single-column layout — only the container className
  // changes; FileUpload's position in the tree is stable, so its
  // internal state (including a live sheet picker) survives.
  const containerClass = fileUploadFullWidth
    ? "space-y-3"
    : `grid grid-cols-1 ${cols} gap-3 items-stretch`;

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Import your contact list
      </p>
      <div className={containerClass}>
        <FileUpload
          parsed={null}
          onParsed={onParsed}
          onClear={onClear}
          onFullWidthChange={setFileUploadFullWidth}
        />
        {/* Sibling tiles only render in grid mode. Hidden when
            FileUpload is showing its multi-sheet picker so the picker
            gets the full row. */}
        {!fileUploadFullWidth && (
          <>
            {googleEnabled && <GoogleDrivePicker onParsed={onParsed} />}
            <button
              type="button"
              onClick={() => setContactBookOpen(true)}
              className="rounded-lg border border-dashed border-zinc-300 bg-background hover:border-whatsapp hover:bg-emerald-50/50 transition-colors p-4 flex flex-col items-center justify-center text-center gap-2 min-h-[140px]"
            >
              <BookOpen className="w-6 h-6 text-whatsapp" />
              <div className="font-medium text-sm">Contact Book</div>
              <div className="text-xs text-muted-foreground">
                Pick from your saved contacts or a group
              </div>
            </button>
            <button
              type="button"
              onClick={() => setAudiencePickerOpen(true)}
              className="rounded-lg border border-dashed border-zinc-300 bg-background hover:border-whatsapp hover:bg-emerald-50/50 transition-colors p-4 flex flex-col items-center justify-center text-center gap-2 min-h-[140px]"
            >
              <Users className="w-6 h-6 text-whatsapp" />
              <div className="font-medium text-sm">Saved Audience</div>
              <div className="text-xs text-muted-foreground">
                Rule-based list — stays current as contacts change
              </div>
            </button>
          </>
        )}
      </div>
      {!fileUploadFullWidth && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Upload className="w-3 h-3" />
          Files: .xlsx, .xlsm, or .csv with a header row.
        </p>
      )}
    </div>
  );
}
