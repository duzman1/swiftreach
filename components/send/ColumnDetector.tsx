"use client";

import * as React from "react";
import { Phone, AlertTriangle, CheckCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { isValidPhone, detectPhoneColumnCandidates } from "@/lib/phoneUtils";
import type { ParsedFile } from "@/lib/parseFile";

interface Props {
  parsed: ParsedFile;
  phoneColumn: string;
  onPhoneColumn: (value: string) => void;
  defaultCountryCode: string;
  onDefaultCountryCode: (value: string) => void;
}

export function ColumnDetector({
  parsed,
  phoneColumn,
  onPhoneColumn,
  defaultCountryCode,
  onDefaultCountryCode,
}: Props) {
  // Auto-pick a phone column the first time the file changes.
  React.useEffect(() => {
    if (phoneColumn && parsed.headers.includes(phoneColumn)) return;
    const candidates = detectPhoneColumnCandidates(parsed.headers);
    if (candidates.length === 1) onPhoneColumn(candidates[0]);
    // If 0 or 2+ candidates, leave blank — user must pick.
  }, [parsed, phoneColumn, onPhoneColumn]);

  const candidates = React.useMemo(
    () => detectPhoneColumnCandidates(parsed.headers),
    [parsed.headers]
  );

  const { valid, invalid } = React.useMemo(() => {
    if (!phoneColumn) return { valid: 0, invalid: 0 };
    let v = 0;
    let i = 0;
    for (const row of parsed.rows) {
      if (isValidPhone(row[phoneColumn] ?? "")) v++;
      else i++;
    }
    return { valid: v, invalid: i };
  }, [parsed.rows, phoneColumn]);

  const ambiguous = candidates.length > 1 && !phoneColumn;

  return (
    <div className="rounded-md border bg-zinc-50 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Phone className="w-4 h-4 text-whatsapp" />
        <h3 className="font-medium">File Columns Detected</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {parsed.headers.length} columns · {parsed.rows.length} rows
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[2fr,1fr] gap-3">
        <div>
          <Label htmlFor="phone-column" className="block mb-1.5">
            Phone column
          </Label>
          <Select
            id="phone-column"
            value={phoneColumn}
            onChange={(e) => onPhoneColumn(e.target.value)}
          >
            <option value="">Select column…</option>
            {parsed.headers.map((h) => (
              <option key={h} value={h}>
                {h}
                {candidates.includes(h) ? "  (likely phone)" : ""}
              </option>
            ))}
          </Select>
          {ambiguous && (
            <p className="text-xs text-amber-700 mt-1.5 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Multiple columns look like phone numbers. Please confirm which one to use.
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="country-code" className="block mb-1.5">
            Default country code
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
              +
            </span>
            <Input
              id="country-code"
              inputMode="numeric"
              value={defaultCountryCode}
              onChange={(e) => onDefaultCountryCode(e.target.value.replace(/\D/g, ""))}
              placeholder="1"
              className="pl-6"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            Prepended only to 10-digit numbers.
          </p>
        </div>
      </div>

      {phoneColumn && (
        <div className="flex flex-wrap gap-4 text-sm pt-2 border-t">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>
              Valid contacts:{" "}
              <strong className="text-emerald-700">{valid}</strong>
            </span>
          </div>
          {invalid > 0 && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>
                Invalid numbers:{" "}
                <strong className="text-amber-700">{invalid}</strong>{" "}
                <span className="text-muted-foreground">
                  (fewer than 10 digits — will be skipped)
                </span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
