"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  // Existing custom variables — used to detect duplicate names.
  existingNames: string[];
  // File column headers — used to warn when overriding a column.
  columnNames: string[];
  onAdd: (name: string, value: string) => void;
}

export function CustomVariableCreator({ existingNames, columnNames, onAdd }: Props) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setName("");
    setValue("");
    setError(null);
  }

  function close() {
    reset();
    setOpen(false);
  }

  function submit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (existingNames.includes(trimmedName)) {
      setError("A custom variable with this name already exists.");
      return;
    }
    onAdd(trimmedName, value);
    close();
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Variable
      </Button>
    );
  }

  const collidesWithColumn = name.trim() && columnNames.includes(name.trim());

  return (
    <div className="rounded-md border bg-background p-4 w-full max-w-md space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">Create Custom Variable</h4>
        <button
          type="button"
          onClick={close}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cv-name">Variable Name</Label>
        <Input
          id="cv-name"
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") close();
          }}
        />
        <p className="text-xs text-muted-foreground">
          {name.trim()
            ? `Will appear as {{${name.trim()}}} in your message.`
            : "Becomes an insertable token in your message."}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cv-value">Value</Label>
        <Input
          id="cv-value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") close();
          }}
        />
        <p className="text-xs text-muted-foreground">Same value for every contact.</p>
      </div>

      {collidesWithColumn && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          A column with this name already exists. The custom value will override the
          column value for all contacts.
        </div>
      )}

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={close}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={submit}>
          Add Variable
        </Button>
      </div>
    </div>
  );
}
