"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, Upload } from "lucide-react";
import { FileUpload } from "./FileUpload";
import { GoogleDrivePicker } from "./GoogleDrivePicker";
import { ContactBookPicker } from "./ContactBookPicker";
import type { ParsedFile } from "@/lib/parseFile";

interface Props {
  parsed: ParsedFile | null;
  onParsed: (file: ParsedFile) => void;
  onClear: () => void;
  defaultCountryCode?: string;
}

/**
 * Three-up layout: file upload, Google Drive (optional), and the Contact
 * Book picker. Once a file is parsed (from any source), collapses into the
 * single file-chip view rendered by FileUpload.
 *
 * The Google Drive option only renders when NEXT_PUBLIC_GOOGLE_CLIENT_ID is
 * set — it's fully optional.
 *
 * The Contact Book auto-opens when ?group=<id> is present in the URL — the
 * /contacts → "Use in Campaign" deep-link relies on this.
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

  React.useEffect(() => {
    if (groupFromUrl && !parsed && !contactBookOpen) {
      setContactBookOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupFromUrl]);

  if (parsed) {
    return <FileUpload parsed={parsed} onParsed={onParsed} onClear={onClear} />;
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

  const cols = googleEnabled ? "md:grid-cols-3" : "md:grid-cols-2";

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Import your contact list
      </p>
      <div className={`grid grid-cols-1 ${cols} gap-3`}>
        <FileUpload parsed={null} onParsed={onParsed} onClear={onClear} />
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
      </div>
      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Upload className="w-3 h-3" />
        Files: .xlsx, .xlsm, or .csv with a header row.
      </p>
    </div>
  );
}
