"use client";

// Announcements admin. New announcement form on the left; existing list on
// the right with toggle / delete / email-broadcast buttons.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Send, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Announcement {
  id: string;
  message: string;
  type: string;
  target: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const TYPE_BADGE: Record<string, string> = {
  info: "bg-indigo-100 text-indigo-700 border-indigo-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  success: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export default function AdminAnnouncementsPage() {
  const [list, setList] = useState<Announcement[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Form state
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [target, setTarget] = useState("all");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/announcements");
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed to load");
      setList(j.announcements);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Message is required");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), type, target, active }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast.success("Announcement saved");
      setMessage("");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(a: Announcement) {
    try {
      const r = await fetch(`/api/admin/announcements/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !a.active }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast.success(a.active ? "Deactivated" : "Activated");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function remove(a: Announcement) {
    if (!confirm("Delete this announcement?")) return;
    try {
      const r = await fetch(`/api/admin/announcements/${a.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast.success("Deleted");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function broadcast(a: Announcement) {
    const subject = prompt(
      "Email subject line (audience: " + a.target + "):",
      "An update from SwiftReach"
    );
    if (subject === null) return;
    try {
      const r = await fetch(`/api/admin/announcements/${a.id}/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      if (j.skipped) {
        toast.message("Email broadcast skipped — RESEND_API_KEY not configured");
      } else {
        toast.success(`Sent to ${j.sent} of ${j.attempted}${j.failed ? ` (${j.failed} failed)` : ""}`);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Announcements</h1>
        <p className="text-sm text-slate-500 mt-1">
          Active banners show up across the user app. Only one banner can be
          active at a time — saving a new one as active deactivates the others.
        </p>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Form */}
        <form
          onSubmit={create}
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm space-y-4"
        >
          <div className="text-sm font-semibold text-slate-900">New announcement</div>

          <div className="space-y-2">
            <Label htmlFor="msg">Message</Label>
            <textarea
              id="msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              placeholder="What's the news?"
            />
          </div>

          <div className="grid gap-3 grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm bg-white"
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="success">Success</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target">Audience</Label>
              <select
                id="target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm bg-white"
              >
                <option value="all">Everyone</option>
                <option value="free">Free plan only</option>
                <option value="paid">Paid plans only</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Publish immediately (deactivates any other active banner)
          </label>

          {/* Preview */}
          <div className={`rounded-md border-l-4 p-3 text-sm ${TYPE_BADGE[type] ?? TYPE_BADGE.info}`}>
            <div className="text-xs font-semibold uppercase tracking-wide mb-1 opacity-70">
              Preview
            </div>
            {message || <span className="opacity-50">Your message will appear here</span>}
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </form>

        {/* List */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900 mb-4">All announcements</div>
          {loading && !list && <div className="text-sm text-slate-400 py-6 text-center">Loading…</div>}
          {list && list.length === 0 && (
            <div className="text-sm text-slate-400 py-12 text-center">
              No announcements yet
            </div>
          )}
          {list && list.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {list.map((a) => (
                <li key={a.id} className="py-3">
                  <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] uppercase rounded border ${
                          TYPE_BADGE[a.type] ?? TYPE_BADGE.info
                        }`}
                      >
                        {a.type}
                      </span>
                      <span className="text-xs text-slate-500">→ {a.target}</span>
                      {a.active && (
                        <span className="inline-block px-2 py-0.5 text-[10px] uppercase rounded bg-emerald-100 text-emerald-700">
                          Active
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      {new Date(a.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-sm text-slate-800 mb-2">{a.message}</div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleActive(a)}
                      className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                    >
                      <Power className="w-3 h-3" />
                      {a.active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => broadcast(a)}
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                    >
                      <Send className="w-3 h-3" />
                      Email broadcast
                    </button>
                    <button
                      onClick={() => remove(a)}
                      className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 ml-auto"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
