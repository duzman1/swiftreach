// Pure post-campaign analysis. Takes the aggregate stats for a
// completed campaign and produces zero-or-more PerformanceAlerts.
// No DB access, no email send — pure function so it's easy to unit
// test and reuse in both the API route and the send-loop trigger.

export interface CampaignStats {
  totalCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  skippedCount: number;
  optOutCount: number;
}

export interface PerformanceAlert {
  type: "success" | "warning" | "critical" | "info";
  category: "delivery" | "engagement" | "optout" | "compliance" | "general";
  title: string;
  message: string;
  recommendation?: string;
  metric?: string;
}

export function analyzeCampaignPerformance(
  stats: CampaignStats
): PerformanceAlert[] {
  const alerts: PerformanceAlert[] = [];

  const {
    totalCount,
    sentCount,
    deliveredCount,
    readCount,
    failedCount,
    skippedCount,
    optOutCount,
  } = stats;

  // Nothing to analyse if no send attempts landed. Prevents div-by-zero
  // and prevents "critical: 0% delivery" alerts on cancelled campaigns.
  if (sentCount === 0) return alerts;

  const deliveryRate = (deliveredCount / sentCount) * 100;
  const readRate = (readCount / sentCount) * 100;
  const optOutRate = (optOutCount / sentCount) * 100;
  const invalidRate = totalCount > 0 ? (skippedCount / totalCount) * 100 : 0;

  // ── DELIVERY RATE ────────────────────────────────────────
  if (deliveryRate >= 95) {
    alerts.push({
      type: "success",
      category: "delivery",
      title: "Excellent delivery rate!",
      message: `${deliveryRate.toFixed(1)}% of messages were delivered successfully.`,
      recommendation: "Your contact list is in great shape. Keep it up!",
      metric: `${deliveryRate.toFixed(1)}%`,
    });
  } else if (deliveryRate >= 85) {
    alerts.push({
      type: "info",
      category: "delivery",
      title: "Good delivery rate",
      message: `${deliveryRate.toFixed(1)}% delivery rate. ${failedCount} messages did not deliver.`,
      recommendation:
        "Review failed contacts and remove numbers that are not on WhatsApp.",
      metric: `${deliveryRate.toFixed(1)}%`,
    });
  } else if (deliveryRate >= 70) {
    alerts.push({
      type: "warning",
      category: "delivery",
      title: "Below average delivery rate",
      message: `Only ${deliveryRate.toFixed(1)}% of messages delivered. ${failedCount} contacts could not be reached.`,
      recommendation:
        "Clean your contact list — many numbers may not be on WhatsApp. Export failed contacts and verify their numbers.",
      metric: `${deliveryRate.toFixed(1)}%`,
    });
  } else {
    alerts.push({
      type: "critical",
      category: "delivery",
      title: "⚠️ Low delivery rate — action needed",
      message: `Only ${deliveryRate.toFixed(1)}% delivered. ${failedCount} of ${sentCount} messages failed. This is significantly below average.`,
      recommendation:
        "Your contact list needs urgent cleaning. Export and review all failed contacts. Consider collecting phone numbers more carefully.",
      metric: `${deliveryRate.toFixed(1)}%`,
    });
  }

  // ── READ RATE — only meaningful once some reads are recorded ─
  if (readCount > 0) {
    if (readRate >= 50) {
      alerts.push({
        type: "success",
        category: "engagement",
        title: "High engagement!",
        message: `${readRate.toFixed(1)}% of contacts read your message — well above average.`,
        recommendation:
          "Great open rate! Note what worked in this message for future campaigns.",
        metric: `${readRate.toFixed(1)}% read`,
      });
    } else if (readRate >= 25) {
      alerts.push({
        type: "info",
        category: "engagement",
        title: "Moderate engagement",
        message: `${readRate.toFixed(1)}% read rate. ${readCount} contacts opened your message.`,
        recommendation:
          "Try sending at a different time of day or use a more compelling opening line.",
        metric: `${readRate.toFixed(1)}% read`,
      });
    } else {
      alerts.push({
        type: "warning",
        category: "engagement",
        title: "Low read rate",
        message: `Only ${readRate.toFixed(1)}% of delivered messages were read.`,
        recommendation:
          "Consider sending at peak hours (9-11am or 6-8pm). Also ensure your message is relevant and personalized.",
        metric: `${readRate.toFixed(1)}% read`,
      });
    }
  }

  // ── OPT-OUTS ─────────────────────────────────────────────
  if (optOutCount > 0) {
    if (optOutRate >= 2) {
      alerts.push({
        type: "critical",
        category: "optout",
        title: "🚨 High opt-out rate — review content",
        message: `${optOutCount} contacts (${optOutRate.toFixed(1)}%) replied STOP to opt out. This is above the 2% threshold and may affect your WhatsApp account quality.`,
        recommendation:
          "Review your message content and targeting. Ensure contacts have opted in to receive messages. Consider reducing send frequency.",
        metric: `${optOutRate.toFixed(1)}% opted out`,
      });
    } else if (optOutRate >= 1) {
      alerts.push({
        type: "warning",
        category: "optout",
        title: "Some opt-outs detected",
        message: `${optOutCount} contact${optOutCount > 1 ? "s" : ""} opted out of future messages.`,
        recommendation:
          "Monitor this trend. If opt-outs increase, review your message relevance and frequency.",
        metric: `${optOutCount} opted out`,
      });
    } else {
      alerts.push({
        type: "info",
        category: "optout",
        title: "Minimal opt-outs",
        message: `${optOutCount} contact${optOutCount > 1 ? "s" : ""} opted out. They have been removed from future campaigns automatically.`,
        metric: `${optOutCount} opted out`,
      });
    }
  }

  // ── INVALID NUMBERS ──────────────────────────────────────
  if (invalidRate >= 10) {
    alerts.push({
      type: "warning",
      category: "compliance",
      title: "Many invalid numbers in your list",
      message: `${skippedCount} contacts (${invalidRate.toFixed(1)}%) had invalid phone numbers and were skipped.`,
      recommendation:
        "Clean your contact list. Verify phone numbers are in international format with country code.",
      metric: `${skippedCount} invalid`,
    });
  }

  // ── FAILED CONTACTS (small volume, actionable) ───────────
  if (failedCount > 0 && failedCount <= 20) {
    alerts.push({
      type: "info",
      category: "delivery",
      title: `${failedCount} contact${failedCount > 1 ? "s" : ""} could not be reached`,
      message:
        "These contacts are not on WhatsApp or their number has changed.",
      recommendation:
        'Click "Retry failed" on the campaign detail page to attempt redelivery, or export failed contacts to verify their numbers.',
      metric: `${failedCount} failed`,
    });
  }

  // ── OVERALL SUCCESS SUMMARY ──────────────────────────────
  if (deliveryRate >= 90 && optOutCount === 0) {
    alerts.push({
      type: "success",
      category: "general",
      title: "🎉 Campaign completed successfully!",
      message: `${deliveredCount} of ${sentCount} messages delivered with no opt-outs.`,
      metric: `${sentCount} sent`,
    });
  }

  return alerts;
}
