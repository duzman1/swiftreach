"use client";

// Send Timing block — inserted into Step 4 (Campaign Settings) of the
// new-campaign wizard. Toggle between "send now" and "schedule for later",
// with optional recurrence.
//
// State is owned by the parent wizard. We only render controls and emit
// changes via the on* callbacks.

import * as React from "react";
import { Calendar, Repeat } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export type SendMoment = "now" | "schedule";
export type Recurrence = "daily" | "weekly" | "monthly";

export interface SendTimingState {
  moment: SendMoment;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24h)
  timezone: string;
  recurring: boolean;
  recurrence: Recurrence;
  // Weekly: 0..6 (Sun..Sat). Monthly: 1..31.
  recurrenceDay: number;
}

interface Props {
  value: SendTimingState;
  onChange: (next: SendTimingState) => void;
}

const COMMON_TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
];

const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export function SendTiming({ value, onChange }: Props) {
  function set<K extends keyof SendTimingState>(k: K, v: SendTimingState[K]) {
    onChange({ ...value, [k]: v });
  }

  return (
    <div className="rounded-md border bg-zinc-50">
      <div className="px-3 py-2 border-b flex items-center gap-2">
        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Send timing
        </div>
      </div>
      <div className="p-3 space-y-3">
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="send-moment"
              value="now"
              checked={value.moment === "now"}
              onChange={() => set("moment", "now")}
            />
            Send immediately
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="send-moment"
              value="schedule"
              checked={value.moment === "schedule"}
              onChange={() => set("moment", "schedule")}
            />
            Schedule for later
          </label>
        </div>

        {value.moment === "schedule" && (
          <div className="space-y-3 border-t pt-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="schedule-date" className="block mb-1.5">Date</Label>
                <Input
                  id="schedule-date"
                  type="date"
                  value={value.date}
                  onChange={(e) => set("date", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="schedule-time" className="block mb-1.5">Time</Label>
                <Input
                  id="schedule-time"
                  type="time"
                  value={value.time}
                  onChange={(e) => set("time", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="schedule-tz" className="block mb-1.5">Timezone</Label>
                <Select
                  id="schedule-tz"
                  value={value.timezone}
                  onChange={(e) => set("timezone", e.target.value)}
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </Select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={value.recurring}
                onChange={(e) => set("recurring", e.target.checked)}
              />
              <Repeat className="w-3.5 h-3.5" />
              Repeat this campaign
            </label>

            {value.recurring && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-6">
                <div>
                  <Label htmlFor="recurrence" className="block mb-1.5">Repeat</Label>
                  <Select
                    id="recurrence"
                    value={value.recurrence}
                    onChange={(e) => set("recurrence", e.target.value as Recurrence)}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </Select>
                </div>
                {value.recurrence === "weekly" && (
                  <div>
                    <Label htmlFor="weekly-day" className="block mb-1.5">On day</Label>
                    <Select
                      id="weekly-day"
                      value={String(value.recurrenceDay)}
                      onChange={(e) => set("recurrenceDay", Number(e.target.value))}
                    >
                      {WEEKDAYS.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </Select>
                  </div>
                )}
                {value.recurrence === "monthly" && (
                  <div>
                    <Label htmlFor="monthly-day" className="block mb-1.5">Day of month</Label>
                    <Select
                      id="monthly-day"
                      value={String(value.recurrenceDay)}
                      onChange={(e) => set("recurrenceDay", Number(e.target.value))}
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Build a UTC ISO string from a (date, time, timezone) triple. We deliberately
// treat the user's tz preference as a label only — date inputs in browsers
// are local-time. For full correctness we'd need a real tz library; for the
// MVP, we send the local-as-if-UTC moment to the server and rely on the
// server using new Date(iso) which interprets "Z" as UTC.
export function combineToISO(date: string, time: string): string | null {
  if (!date || !time) return null;
  // Construct in the browser's local zone, then call toISOString() so the
  // server receives a real UTC instant.
  const d = new Date(`${date}T${time}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
