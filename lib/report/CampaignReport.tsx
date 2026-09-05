// react-pdf template for the white-label campaign report.
//
// Layout:
//   Page 1 header — logo (or company name), title, range/date, gen date
//   Summary tiles — campaigns, messages sent, delivered, delivery rate,
//                   failed, opt-outs (opt-outs suppressed on single-campaign)
//   Table         — per campaign, sorted by createdAt desc, paginates
//                   with the header row repeated on each page
//   Footer        — footerText + page number + optional "Generated with
//                   SwiftReach" byline
//
// Everything is rendered from the ReportData + Branding shapes; the
// template makes no DB or network calls.

import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Branding } from "../branding";
import type { ReportData } from "./reportData";

// Uses pdfkit's bundled Helvetica (the default). We used to register
// Inter from Google Fonts server-side but Vercel's serverless
// runtime can't always fetch it at render time — cold-start
// networking is restricted and any failure blocks the whole
// render. Helvetica is a clean, well-metricked face for a report
// like this and ships with pdfkit at zero cost.

interface Props {
  data: ReportData;
  branding: Branding;
  timezone: string;
  generatedAt: Date;
  title: string; // "Campaign Report" | campaign name
  subtitle: string; // date range copy OR campaign send-date copy
}

function fmtNum(n: number): string {
  return n.toLocaleString();
}
function fmtPct(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(1)}%`;
}
function fmtDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: tz,
  }).format(d);
}
function fmtDateTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
    timeZoneName: "short",
  }).format(d);
}

const INK = "#18181b";
const INK_MUTED = "#71717a";
const INK_FAINT = "#a1a1aa";
const HAIRLINE = "#e4e4e7";
const SUBTLE_BG = "#fafafa";

function styles(accent: string) {
  return StyleSheet.create({
    page: {
      paddingTop: 40,
      paddingHorizontal: 36,
      paddingBottom: 48, // leave room for footer
      fontFamily: "Helvetica",
      fontSize: 10,
      color: INK,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingBottom: 14,
      borderBottom: `1px solid ${HAIRLINE}`,
    },
    logo: { height: 36, maxWidth: 120, objectFit: "contain" },
    companyText: {
      fontSize: 15,
      fontWeight: 700,
      color: INK,
      maxWidth: 200,
    },
    titleBlock: { flexGrow: 1, minWidth: 0 },
    title: {
      fontSize: 18,
      fontWeight: 700,
      color: accent,
      letterSpacing: -0.2,
    },
    subtitle: { fontSize: 10, color: INK_MUTED, marginTop: 2 },

    accentBar: {
      height: 3,
      backgroundColor: accent,
      borderRadius: 2,
      marginTop: 8,
      marginBottom: 18,
    },

    // ── Summary tiles ──
    tileRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 20,
    },
    tile: {
      width: "31.5%", // three per row
      border: `1px solid ${HAIRLINE}`,
      borderRadius: 4,
      padding: 10,
      backgroundColor: SUBTLE_BG,
    },
    tileLabel: {
      fontSize: 8,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      color: INK_MUTED,
      fontWeight: 600,
    },
    tileValue: {
      fontSize: 20,
      fontWeight: 700,
      color: INK,
      marginTop: 4,
    },
    tileAccent: {
      fontSize: 20,
      fontWeight: 700,
      color: accent,
      marginTop: 4,
    },

    sectionHeading: {
      fontSize: 12,
      fontWeight: 700,
      color: INK,
      marginBottom: 8,
    },

    // ── Table ──
    table: { width: "100%", borderTop: `1px solid ${HAIRLINE}` },
    thead: {
      flexDirection: "row",
      backgroundColor: SUBTLE_BG,
      borderBottom: `1px solid ${HAIRLINE}`,
    },
    trow: {
      flexDirection: "row",
      borderBottom: `1px solid ${HAIRLINE}`,
    },
    th: {
      fontSize: 8,
      fontWeight: 700,
      color: INK_MUTED,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      padding: "6 8",
    },
    td: {
      fontSize: 9,
      color: INK,
      padding: "6 8",
    },
    // Column widths — sum to 100% of the row.
    colName:      { width: "34%" },
    colDate:      { width: "16%" },
    colRecip:     { width: "12%", textAlign: "right" },
    colDelivered: { width: "12%", textAlign: "right" },
    colFailed:    { width: "12%", textAlign: "right" },
    colRate:      { width: "14%", textAlign: "right" },

    empty: {
      padding: 40,
      textAlign: "center",
      color: INK_MUTED,
      fontSize: 11,
      border: `1px dashed ${HAIRLINE}`,
      borderRadius: 4,
    },

    // ── Footer ──
    footer: {
      position: "absolute",
      bottom: 18,
      left: 36,
      right: 36,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      fontSize: 8,
      color: INK_FAINT,
      paddingTop: 6,
      borderTop: `1px solid ${HAIRLINE}`,
    },
    footerLeft: { maxWidth: "60%" },
    footerRight: { textAlign: "right" },
    byline: { color: INK_FAINT, marginTop: 1 },
  });
}

export function CampaignReport(props: Props) {
  const { data, branding, timezone, generatedAt, title, subtitle } = props;
  const s = styles(branding.accentColor);

  // Truncate company name to keep the header from overflowing on a
  // very long value — react-pdf clips at style.maxWidth but ellipsis
  // needs the explicit character cap so it looks intentional.
  const displayName =
    branding.companyName.length > 32
      ? branding.companyName.slice(0, 31).trimEnd() + "…"
      : branding.companyName;

  return (
    <Document
      title={`${branding.companyName} — ${title}`}
      author={branding.companyName}
      creator="SwiftReach"
      producer="SwiftReach"
    >
      <Page size="LETTER" style={s.page}>
        {/* ─── Header ─── */}
        <View style={s.header}>
          {branding.logoUrl ? (
            <Image src={branding.logoUrl} style={s.logo} />
          ) : (
            <Text style={s.companyText}>{displayName}</Text>
          )}
          <View style={s.titleBlock}>
            <Text style={s.title}>{title}</Text>
            <Text style={s.subtitle}>{subtitle}</Text>
          </View>
        </View>
        <View style={s.accentBar} />

        {/* ─── Summary tiles ─── */}
        <Text style={s.sectionHeading}>Summary</Text>
        <View style={s.tileRow}>
          <View style={s.tile}>
            <Text style={s.tileLabel}>Campaigns</Text>
            <Text style={s.tileValue}>{fmtNum(data.summary.campaigns)}</Text>
          </View>
          <View style={s.tile}>
            <Text style={s.tileLabel}>Messages sent</Text>
            <Text style={s.tileValue}>{fmtNum(data.summary.messagesSent)}</Text>
          </View>
          <View style={s.tile}>
            <Text style={s.tileLabel}>Delivered</Text>
            <Text style={s.tileValue}>{fmtNum(data.summary.delivered)}</Text>
          </View>
          <View style={s.tile}>
            <Text style={s.tileLabel}>Delivery rate</Text>
            <Text style={s.tileAccent}>{fmtPct(data.summary.deliveryRatePct)}</Text>
          </View>
          <View style={s.tile}>
            <Text style={s.tileLabel}>Failed</Text>
            <Text style={s.tileValue}>{fmtNum(data.summary.failed)}</Text>
          </View>
          {data.kind === "range" && (
            <View style={s.tile}>
              <Text style={s.tileLabel}>Opt-outs</Text>
              <Text style={s.tileValue}>{fmtNum(data.summary.optOuts)}</Text>
            </View>
          )}
        </View>

        {/* ─── Table ─── */}
        <Text style={s.sectionHeading}>
          {data.kind === "campaign" ? "Campaign detail" : "Campaigns"}
        </Text>
        {data.rows.length === 0 ? (
          <View style={s.empty}>
            <Text>No campaigns were sent in this period.</Text>
          </View>
        ) : (
          <View style={s.table}>
            {/* fixed on the top of every page in this section */}
            <View style={s.thead} fixed>
              <Text style={[s.th, s.colName]}>Campaign</Text>
              <Text style={[s.th, s.colDate]}>Sent</Text>
              <Text style={[s.th, s.colRecip]}>Recipients</Text>
              <Text style={[s.th, s.colDelivered]}>Delivered</Text>
              <Text style={[s.th, s.colFailed]}>Failed</Text>
              <Text style={[s.th, s.colRate]}>Delivery rate</Text>
            </View>
            {data.rows.map((r) => (
              <View key={r.id} style={s.trow} wrap={false}>
                <Text style={[s.td, s.colName]}>{r.name}</Text>
                <Text style={[s.td, s.colDate]}>{fmtDate(r.createdAt, timezone)}</Text>
                <Text style={[s.td, s.colRecip]}>{fmtNum(r.totalCount)}</Text>
                <Text style={[s.td, s.colDelivered]}>{fmtNum(r.delivered)}</Text>
                <Text style={[s.td, s.colFailed]}>{fmtNum(r.failed)}</Text>
                <Text style={[s.td, s.colRate]}>{fmtPct(r.deliveryRatePct)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ─── Footer, repeated on every page ─── */}
        <View style={s.footer} fixed>
          <View style={s.footerLeft}>
            {branding.footerText && <Text>{branding.footerText}</Text>}
            {!branding.hideSwiftReachBranding && (
              <Text style={s.byline}>Generated with SwiftReach</Text>
            )}
          </View>
          <Text
            style={s.footerRight}
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages} · Generated ${fmtDateTime(generatedAt, timezone)}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
