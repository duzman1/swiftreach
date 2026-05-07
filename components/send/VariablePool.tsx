"use client";

import * as React from "react";
import { Trash2, Pencil, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomVariableCreator } from "./CustomVariableCreator";
import type { ParsedFile, ColumnType } from "@/lib/parseFile";

export interface CustomVar {
  name: string;
  value: string;
}

interface Props {
  parsed: ParsedFile;
  phoneColumn: string;
  customVars: CustomVar[];
  onAddCustom: (name: string, value: string) => void;
  onEditCustom: (originalName: string, name: string, value: string) => void;
  onDeleteCustom: (name: string) => void;
  // Callback when a chip is clicked — Phase 3 will use this to insert into the
  // message editor. For now it can be a no-op.
  onInsert?: (name: string) => void;
}

const TYPE_STYLES: Record<ColumnType, { chip: string; dot: string; label: string }> = {
  text: {
    chip: "bg-sky-100 text-sky-800 border-sky-200 hover:bg-sky-200",
    dot: "bg-sky-500",
    label: "text",
  },
  number: {
    chip: "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200",
    dot: "bg-emerald-500",
    label: "number",
  },
  date: {
    chip: "bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200",
    dot: "bg-purple-500",
    label: "date",
  },
};

function truncate(s: string, max = 30) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export function VariablePool({
  parsed,
  phoneColumn,
  customVars,
  onAddCustom,
  onEditCustom,
  onDeleteCustom,
  onInsert,
}: Props) {
  const fileColumns = parsed.headers.filter((h) => h !== phoneColumn);
  const sampleRow = parsed.rows[0] ?? {};

  return (
    <div className="rounded-md border bg-background">
      <div className="px-4 py-3 border-b">
        <h3 className="font-medium text-sm">Available Variables</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Click a chip in the next phase to insert it into your message.
        </p>
      </div>

      {/* From the file */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            From your file
          </div>
          <span className="text-xs text-muted-foreground">
            {fileColumns.length} column{fileColumns.length === 1 ? "" : "s"}
          </span>
        </div>
        {fileColumns.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            All columns in this file are mapped to the phone number.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {fileColumns.map((col) => {
              const type = parsed.columnTypes[col] ?? "text";
              const styles = TYPE_STYLES[type];
              const sample = sampleRow[col] ?? "";
              return (
                <button
                  key={col}
                  type="button"
                  onClick={() => onInsert?.(col)}
                  title={
                    sample
                      ? `${type} · sample: ${truncate(String(sample), 60)}`
                      : `${type}`
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                    styles.chip
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full", styles.dot)} />
                  {truncate(col)}
                </button>
              );
            })}
          </div>
        )}

        {phoneColumn && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-zinc-100 px-2.5 py-1 text-xs text-zinc-500">
            <Phone className="w-3 h-3" />
            {truncate(phoneColumn)}
            <span className="text-zinc-400">— phone (not insertable)</span>
          </div>
        )}
      </div>

      {/* Custom (static) */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Custom (static)
          </div>
          <CustomVariableCreator
            existingNames={customVars.map((c) => c.name)}
            columnNames={parsed.headers}
            onAdd={onAddCustom}
          />
        </div>

        {customVars.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No custom variables yet. Click + to create one.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {customVars.map((cv) => (
              <CustomVarRow
                key={cv.name}
                cv={cv}
                onEdit={(name, value) => onEditCustom(cv.name, name, value)}
                onDelete={() => onDeleteCustom(cv.name)}
                onInsert={() => onInsert?.(cv.name)}
                existingNames={customVars.filter((c) => c.name !== cv.name).map((c) => c.name)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CustomVarRow({
  cv,
  onEdit,
  onDelete,
  onInsert,
  existingNames,
}: {
  cv: CustomVar;
  onEdit: (name: string, value: string) => void;
  onDelete: () => void;
  onInsert: () => void;
  existingNames: string[];
}) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(cv.name);
  const [value, setValue] = React.useState(cv.value);
  const [error, setError] = React.useState<string | null>(null);

  function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    if (existingNames.includes(trimmed)) {
      setError("Another custom variable already uses this name.");
      return;
    }
    onEdit(trimmed, value);
    setEditing(false);
    setError(null);
  }

  if (editing) {
    return (
      <li className="p-3 space-y-2 bg-zinc-50">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            className="h-9 rounded-md border px-3 text-sm"
            placeholder="Variable name"
          />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-9 rounded-md border px-3 text-sm"
            placeholder="Value"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setName(cv.name);
              setValue(cv.value);
              setError(null);
            }}
            className="text-xs text-muted-foreground hover:underline"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="text-xs font-medium text-whatsapp hover:underline"
          >
            Save
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 p-3 hover:bg-zinc-50">
      <button
        type="button"
        onClick={onInsert}
        className="font-mono text-xs text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 hover:bg-amber-200"
        title="Click to insert (Phase 3)"
      >
        {`{{${truncate(cv.name)}}}`}
      </button>
      <span className="text-sm text-muted-foreground truncate flex-1">
        {cv.value || <em className="text-zinc-400">(empty)</em>}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-zinc-400 hover:text-foreground"
        aria-label="Edit"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-zinc-400 hover:text-red-600"
        aria-label="Delete"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}
