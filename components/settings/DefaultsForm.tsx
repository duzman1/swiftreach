"use client";

import * as React from "react";
import { Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Defaults {
  defaultCountryCode: string;
  defaultDelayMs: number;
}

export function DefaultsForm() {
  const [values, setValues] = React.useState<Defaults>({
    defaultCountryCode: "1",
    defaultDelayMs: 2000,
  });
  const [loaded, setLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        if (data.ok) {
          setValues({
            defaultCountryCode: data.settings.defaultCountryCode ?? "1",
            defaultDelayMs: data.settings.defaultDelayMs ?? 2000,
          });
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  function update<K extends keyof Defaults>(key: K, val: Defaults[K]) {
    setValues((v) => ({ ...v, [key]: val }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error ?? "Save failed");
        return;
      }
      toast.success("Defaults saved");
      setDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <p className="text-sm text-muted-foreground py-3">Loading defaults…</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="dcc" className="block mb-1.5">Default country code</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
              +
            </span>
            <Input
              id="dcc"
              inputMode="numeric"
              value={values.defaultCountryCode}
              onChange={(e) =>
                update("defaultCountryCode", e.target.value.replace(/\D/g, ""))
              }
              className="pl-6"
              placeholder="1"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            Prepended to 10-digit numbers in uploaded files.
          </p>
        </div>

        <div>
          <Label htmlFor="ddelay" className="block mb-1.5">
            Default delay between messages: <strong>{(values.defaultDelayMs / 1000).toFixed(1)}s</strong>
          </Label>
          <input
            id="ddelay"
            type="range"
            min={1000}
            max={10000}
            step={500}
            value={values.defaultDelayMs}
            onChange={(e) => update("defaultDelayMs", Number(e.target.value))}
            className="w-full accent-whatsapp"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Recommended: 2s. Lower may trigger Meta rate limits.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!dirty || saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save defaults
        </Button>
        {dirty && (
          <span className="text-xs text-amber-700">Unsaved changes</span>
        )}
      </div>
    </div>
  );
}
