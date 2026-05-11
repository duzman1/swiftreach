"use client";

// Two-way inbox. Left pane: conversation list (every inbound message,
// newest first). Right pane: detail with reply box.
//
// Inbound STOP messages don't land here — they go to OptOutLog instead.
// But if a contact was opted out via STOP, the detail panel shows a
// banner warning before letting the user reply.

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Send as SendIcon,
  Loader2,
  Inbox as InboxIcon,
  ShieldOff,
  Trash2,
  AlertCircle,
  CheckCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UpgradePrompt } from "@/components/shared/UpgradePrompt";

interface InboundMessage {
  id: string;
  fromPhone: string;
  contactName: string | null;
  messageText: string;
  read: boolean;
  readAt: string | null;
  repliedAt: string | null;
  campaignId: string | null;
  createdAt: string;
}

interface OutboundReply {
  id: string;
  toPhone: string;
  messageText: string;
  sentAt: string;
  status: string;
}

interface CampaignRef {
  id: string;
  name: string;
  mode: string;
}

interface DetailResponse {
  ok: boolean;
  message: InboundMessage;
  replies: OutboundReply[];
  campaign: CampaignRef | null;
  optedOut: boolean;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

function fmtFull(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function InboxPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const selectedId = sp?.get("id") ?? null;

  const [list, setList] = useState<InboundMessage[] | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [q, setQ] = useState("");
  const [filterUnread, setFilterUnread] = useState(false);
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);

  async function loadList() {
    setListLoading(true);
    try {
      const u = new URLSearchParams();
      if (q) u.set("q", q);
      if (filterUnread) u.set("read", "unread");
      const r = await fetch(`/api/inbox?${u.toString()}`);
      const j = await r.json();
      if (r.status === 403 && j.upgradeRequired) {
        setUpgradeRequired(true);
        return;
      }
      if (!j.ok) throw new Error(j.error ?? "Failed to load");
      setList(j.messages);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setListLoading(false);
    }
  }

  async function loadDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const r = await fetch(`/api/inbox/${id}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed to load");
      setDetail(j);
      // Mark as read on open (only if previously unread, to avoid blasting
      // the API for every re-open).
      if (!j.message.read) {
        await fetch(`/api/inbox/${id}/read`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ read: true }),
        }).catch(() => undefined);
        // Reflect locally so the badge updates immediately.
        setList((prev) =>
          prev ? prev.map((m) => (m.id === id ? { ...m, read: true } : m)) : prev
        );
        // Fire a custom event so the Navbar badge can refresh.
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("inbox:read"));
        }
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load conversation");
    } finally {
      setDetailLoading(false);
    }
  }

  // Debounced list reload on q changes
  useEffect(() => {
    const t = setTimeout(() => loadList(), q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filterUnread]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function openMessage(id: string) {
    router.replace(`/inbox?id=${id}`);
  }
  function closeDetail() {
    router.replace("/inbox");
  }

  async function sendReply() {
    if (!detail) return;
    const text = replyText.trim();
    if (!text) {
      toast.error("Reply can't be empty");
      return;
    }
    setReplying(true);
    try {
      const r = await fetch(`/api/inbox/${detail.message.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageText: text }),
      });
      const j = await r.json();
      if (!j.ok) {
        throw new Error(j.error ?? "Send failed");
      }
      toast.success("Reply sent");
      setReplyText("");
      await loadDetail(detail.message.id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Reply failed");
    } finally {
      setReplying(false);
    }
  }

  async function deleteMessage(id: string) {
    if (!confirm("Delete this conversation? Replies will also be removed.")) return;
    try {
      const r = await fetch(`/api/inbox/${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast.success("Deleted");
      closeDetail();
      loadList();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  const unreadCount = useMemo(
    () => (list ? list.filter((m) => !m.read).length : 0),
    [list]
  );

  if (upgradeRequired) {
    return (
      <div className="space-y-6">
        <header className="max-w-5xl">
          <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
          <p className="text-muted-foreground mt-1">
            Read replies from your contacts and respond without leaving SwiftReach.
          </p>
        </header>
        <UpgradePrompt
          feature="Two-way Inbox"
          description="See replies from your contacts and respond directly. STOP messages are filed automatically; everything else lands here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            Inbox
            {unreadCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
                {unreadCount} unread
              </span>
            )}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Replies from your contacts. STOP messages don&apos;t appear here — they&apos;re filed in /contacts as opted out.
          </p>
        </div>
      </header>

      {/* Layout: list left, detail right on lg+, stacked on small screens */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px,1fr] gap-4">
        {/* List */}
        <Card className="overflow-hidden flex flex-col max-h-[calc(100vh-220px)]">
          <div className="p-3 border-b space-y-2 bg-zinc-50">
            <Input
              placeholder="Search messages or names"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={filterUnread}
                onChange={(e) => setFilterUnread(e.target.checked)}
              />
              Show unread only
            </label>
          </div>
          <div className="overflow-y-auto flex-1">
            {listLoading && !list && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                Loading…
              </div>
            )}
            {list && list.length === 0 && (
              <div className="p-12 text-center">
                <InboxIcon className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-semibold mb-1">No messages yet</h3>
                <p className="text-xs text-muted-foreground">
                  When a contact replies to one of your campaigns, it&apos;ll appear here.
                </p>
              </div>
            )}
            <ul className="divide-y">
              {list?.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => openMessage(m.id)}
                    className={`w-full text-left px-4 py-3 transition-colors hover:bg-zinc-50 ${
                      selectedId === m.id ? "bg-emerald-50 hover:bg-emerald-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {!m.read && (
                        <span
                          className="w-2 h-2 rounded-full bg-red-500 shrink-0"
                          aria-label="Unread"
                        />
                      )}
                      <span className="font-medium text-sm truncate flex-1">
                        {m.contactName || "Unknown"}
                      </span>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {timeAgo(m.createdAt)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mb-0.5 font-mono">
                      +{m.fromPhone}
                    </div>
                    <div className="text-sm text-zinc-700 line-clamp-2">
                      {m.messageText}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {/* Detail */}
        <Card className="overflow-hidden flex flex-col max-h-[calc(100vh-220px)]">
          {!selectedId && (
            <div className="flex-1 flex items-center justify-center p-12 text-center">
              <div>
                <InboxIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-semibold mb-1">Pick a conversation</h3>
                <p className="text-sm text-muted-foreground">
                  Select a message from the list to view + reply.
                </p>
              </div>
            </div>
          )}

          {selectedId && detailLoading && (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading conversation…
            </div>
          )}

          {selectedId && detail && (
            <>
              <header className="p-4 border-b flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closeDetail}
                  className="lg:hidden"
                  aria-label="Back"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">
                    {detail.message.contactName || "Unknown"}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    +{detail.message.fromPhone}
                  </div>
                  {detail.campaign && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      From campaign:{" "}
                      <a
                        href={`/campaigns/${detail.campaign.id}`}
                        className="text-whatsapp hover:underline"
                      >
                        {detail.campaign.name}
                      </a>
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteMessage(detail.message.id)}
                  aria-label="Delete"
                  className="text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </header>

              {detail.optedOut && (
                <div className="px-4 py-3 bg-red-50 border-b border-red-200 flex items-start gap-2">
                  <ShieldOff className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                  <div className="text-xs text-red-900">
                    This contact has been opted out (sent STOP or similar).
                    Replying to them may violate WhatsApp policy unless they
                    explicitly request to be re-engaged.
                  </div>
                </div>
              )}

              <CardContent className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-50">
                {/* Inbound (left) */}
                <div className="flex">
                  <div className="max-w-[75%] rounded-lg bg-white border px-3 py-2 shadow-sm">
                    <div className="text-sm whitespace-pre-wrap">{detail.message.messageText}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {fmtFull(detail.message.createdAt)}
                    </div>
                  </div>
                </div>
                {/* Outbound replies (right) */}
                {detail.replies.map((r) => (
                  <div key={r.id} className="flex justify-end">
                    <div
                      className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm ${
                        r.status === "failed"
                          ? "bg-red-100 border border-red-200"
                          : "bg-emerald-100"
                      }`}
                    >
                      <div className="text-sm whitespace-pre-wrap">{r.messageText}</div>
                      <div className="flex items-center justify-end gap-1 text-[10px] text-zinc-600 mt-1">
                        {r.status === "failed" ? (
                          <>
                            <AlertCircle className="w-3 h-3" />
                            failed
                          </>
                        ) : (
                          <CheckCheck className="w-3 h-3" />
                        )}
                        {fmtFull(r.sentAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>

              <div className="p-3 border-t bg-background">
                <div className="flex items-end gap-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type a reply…"
                    rows={2}
                    className="flex-1 resize-none rounded-md border border-input px-3 py-2 text-sm bg-background"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                  />
                  <Button
                    onClick={sendReply}
                    disabled={replying || !replyText.trim()}
                    className="gap-1.5"
                  >
                    {replying ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendIcon className="w-4 h-4" />}
                    Send
                  </Button>
                </div>
                <div className="text-[11px] text-muted-foreground mt-2">
                  ⚠ Replies only work within 24 hrs of the contact&apos;s last message (WhatsApp session window). Ctrl/⌘+Enter to send.
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
