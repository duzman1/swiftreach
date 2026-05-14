"use client";

// Support contact form. Validates client-side (mirroring the API)
// before submitting; on success, swaps the form for an inline
// confirmation card with the reference number.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CATEGORIES = [
  "Getting started / Setup",
  "Sending campaigns",
  "WhatsApp API / Connection issues",
  "Billing & subscription",
  "Templates & message content",
  "Analytics & reporting",
  "Bug report",
  "Feature request",
  "Other",
];

const PRIORITIES = [
  { value: "low", label: "Low — General question" },
  { value: "normal", label: "Normal — Need help soon" },
  { value: "high", label: "High — Blocking my work" },
  { value: "urgent", label: "Urgent — Cannot send messages" },
] as const;

const MIN_MSG = 20;
const MAX_MSG = 2000;
const MIN_SUBJ = 5;
const MAX_SUBJ = 100;

interface Submitted {
  reference: string;
  category: string;
  priority: string;
}

export function SupportForm() {
  const router = useRouter();
  const [category, setCategory] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [priority, setPriority] = React.useState<string>("normal");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState<Submitted | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  function validate(): string | null {
    if (!category) return "Pick a category.";
    const s = subject.trim();
    if (s.length < MIN_SUBJ || s.length > MAX_SUBJ)
      return `Subject must be ${MIN_SUBJ}–${MAX_SUBJ} characters.`;
    const m = message.trim();
    if (m.length < MIN_MSG)
      return `Message must be at least ${MIN_MSG} characters.`;
    if (m.length > MAX_MSG)
      return `Message must be ${MAX_MSG} characters or fewer.`;
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) {
      setErr(v);
      return;
    }
    setErr(null);
    setSubmitting(true);
    try {
      const r = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, subject, message, priority }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error ?? "Failed to submit");
      }
      setSubmitted({
        reference: j.reference,
        category,
        priority,
      });
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "Network error";
      setErr(m);
      toast.error(m);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setCategory("");
    setSubject("");
    setMessage("");
    setPriority("normal");
    setSubmitted(null);
    setErr(null);
  }

  if (submitted) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-full bg-whatsapp/10 flex items-center justify-center">
          <Check className="w-6 h-6 text-whatsapp" />
        </div>
        <h3 className="text-lg font-semibold text-emerald-900">
          Support request submitted!
        </h3>
        <p className="text-sm text-emerald-900">
          Reference: <strong className="font-mono">#{submitted.reference}</strong>
        </p>
        <p className="text-sm text-emerald-900/80">
          We&apos;ve received your request and sent a confirmation to your
          email address. We typically respond within 24 hours.
        </p>
        <ul className="text-xs text-emerald-900/80 space-y-1 inline-block text-left">
          <li>
            <strong>Priority:</strong>{" "}
            {priorityLabelFor(submitted.priority)}
          </li>
          <li>
            <strong>Category:</strong> {submitted.category}
          </li>
        </ul>
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <Button variant="outline" onClick={reset}>
            Submit Another Request
          </Button>
          <Button
            className="bg-whatsapp hover:bg-whatsapp-dark text-white"
            onClick={() => router.push("/dashboard")}
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const messageLength = message.length;
  const overLimit = messageLength > MAX_MSG;
  const underMin = messageLength > 0 && messageLength < MIN_MSG;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <Label htmlFor="sup-cat" className="block mb-1.5">
          Category
        </Label>
        <select
          id="sup-cat"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          required
        >
          <option value="">Select a topic</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="sup-subj" className="block mb-1.5">
          Subject
        </Label>
        <Input
          id="sup-subj"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={MAX_SUBJ}
          placeholder="Brief description"
          required
        />
      </div>

      <div>
        <Label htmlFor="sup-msg" className="block mb-1.5">
          Message
        </Label>
        <textarea
          id="sup-msg"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed"
          placeholder="What's going on? Please include any relevant details."
          required
        />
        <div className="flex items-center justify-between mt-1">
          <p
            className={`text-xs ${
              underMin
                ? "text-amber-600"
                : overLimit
                ? "text-red-600"
                : "text-zinc-500"
            }`}
          >
            {underMin
              ? `Add ${MIN_MSG - messageLength} more character${
                  MIN_MSG - messageLength === 1 ? "" : "s"
                }`
              : `Minimum ${MIN_MSG} characters`}
          </p>
          <p
            className={`text-xs tabular-nums ${
              overLimit ? "text-red-600 font-medium" : "text-zinc-500"
            }`}
          >
            {messageLength} / {MAX_MSG}
          </p>
        </div>
      </div>

      <div>
        <Label className="block mb-2">Priority</Label>
        <div className="space-y-1.5">
          {PRIORITIES.map((p) => (
            <label
              key={p.value}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <input
                type="radio"
                name="priority"
                value={p.value}
                checked={priority === p.value}
                onChange={() => setPriority(p.value)}
              />
              {p.label}
            </label>
          ))}
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <Button
        type="submit"
        disabled={submitting}
        className="bg-whatsapp hover:bg-whatsapp-dark text-white gap-2"
      >
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        Submit Support Request
      </Button>
    </form>
  );
}

function priorityLabelFor(value: string): string {
  return PRIORITIES.find((p) => p.value === value)?.label ?? value;
}
