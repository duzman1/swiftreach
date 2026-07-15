// Data Deletion Request page. Public route — middleware.ts whitelists
// /data-deletion. This URL is submitted to Meta's App Dashboard as our
// "User Data Deletion" instructions URL, per Meta's requirement that
// apps accessing user data must provide either a callback or human-
// readable instructions. We chose instructions because SwiftReach
// keys users by Clerk userId, not fb_user_id, so Meta's per-user
// callback flow has no reliable lookup path in our schema.
//
// Editing this file: keep section ids in sync with the TOC `sections`
// array below, and bump the `lastUpdated` string on material changes.

import type { Metadata } from "next";
import { LegalPage, LegalSection, type Section } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Data Deletion Request",
  description:
    "How to request deletion of your SwiftReach account and all associated data, including WhatsApp Business credentials and campaign history.",
};

const sections: Section[] = [
  { id: "overview", number: 1, title: "Overview" },
  { id: "what-we-store", number: 2, title: "What Data We Store" },
  { id: "how-to-request", number: 3, title: "How to Request Deletion" },
  { id: "what-happens", number: 4, title: "What Happens After You Request" },
  { id: "timeline", number: 5, title: "Timeline" },
  { id: "meta-users", number: 6, title: "For Users Arriving from Facebook / Meta" },
  { id: "questions", number: 7, title: "Questions" },
];

const DELETION_EMAIL = "privacy@swiftreach.app";
const MAILTO = `mailto:${DELETION_EMAIL}?subject=Data%20Deletion%20Request`;

export default function DataDeletionPage() {
  return (
    <LegalPage
      title="Data Deletion Request"
      lastUpdated="May 19, 2026"
      intro={
        <p>
          You can request deletion of your SwiftReach account and all data
          associated with it at any time. This page explains what data we
          hold, how to submit a deletion request, and what happens after we
          receive it.
        </p>
      }
      sections={sections}
    >
      <LegalSection id="overview" number={1} title="Overview">
        <p>
          SwiftReach lets businesses send WhatsApp messages via the Meta
          WhatsApp Business Cloud API. To do that we store your account
          information, your encrypted Meta API credentials, and the contact
          lists and message history required to run your campaigns. If you
          no longer want us to hold any of this, you can ask us to delete
          all of it.
        </p>
        <p>
          Deletion is permanent. Once processed, your account cannot be
          recovered and any campaigns, contacts, templates, and API keys
          associated with it are removed.
        </p>
      </LegalSection>

      <LegalSection id="what-we-store" number={2} title="What Data We Store">
        <p>
          A SwiftReach deletion request removes all of the following:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Account information:</strong> your name, email address,
            and Clerk authentication record.
          </li>
          <li>
            <strong>WhatsApp Business credentials:</strong> your encrypted
            Meta API token, Phone Number ID, and Business Account ID. Your
            token is also revoked with Meta so it can no longer be used.
          </li>
          <li>
            <strong>Contact lists:</strong> phone numbers and any associated
            fields (names, custom data) you uploaded, imported from Google
            Drive, or saved to your contact book.
          </li>
          <li>
            <strong>Campaign history:</strong> every campaign you ran,
            including message content, delivery status, and per-contact
            results.
          </li>
          <li>
            <strong>Scheduled campaigns:</strong> any campaigns you had
            queued for a future date.
          </li>
          <li>
            <strong>Inbox and replies:</strong> inbound messages from
            recipients and any replies you sent from within SwiftReach.
          </li>
          <li>
            <strong>Templates:</strong> your saved message templates and
            variable mappings.
          </li>
          <li>
            <strong>API keys and webhook logs:</strong> any API keys you
            generated in Settings → API Keys and the request log for those
            keys.
          </li>
          <li>
            <strong>Support requests:</strong> any support tickets you
            submitted from the in-app support form.
          </li>
        </ul>
        <p>
          <strong>What is retained after deletion:</strong> Stripe payment
          records are retained for 7 years to comply with tax and
          accounting law. These records contain only your billing
          identifiers and invoice history, not your operational data. Meta
          message delivery logs stored on Meta&apos;s infrastructure are
          governed by Meta&apos;s own retention policy and are not under
          SwiftReach&apos;s control.
        </p>
      </LegalSection>

      <LegalSection id="how-to-request" number={3} title="How to Request Deletion">
        <p>
          Send an email to{" "}
          <a href={MAILTO} className="text-whatsapp hover:underline">
            {DELETION_EMAIL}
          </a>{" "}
          from the email address on your SwiftReach account, with the
          subject line <strong>&quot;Data Deletion Request&quot;</strong>.
        </p>
        <p>Include the following in the body of your email:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>The email address of the account to be deleted.</li>
          <li>
            Optional: a brief reason for the deletion — this is helpful for
            us but not required.
          </li>
        </ul>
        <p>
          We will only process deletion requests sent from the account
          holder&apos;s registered email address, or where identity can
          otherwise be verified. This is to prevent malicious deletion of
          someone else&apos;s account.
        </p>
      </LegalSection>

      <LegalSection
        id="what-happens"
        number={4}
        title="What Happens After You Request"
      >
        <p>Once we receive and verify your request, we will:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Revoke your WhatsApp access token</strong> with Meta so
            it can no longer be used to send messages on your behalf.
          </li>
          <li>
            <strong>Delete your account record</strong> and every related
            row listed in Section 2 (contacts, campaigns, templates, API
            keys, webhook logs, inbox messages, scheduled campaigns,
            support tickets).
          </li>
          <li>
            <strong>Sign you out</strong> of any active SwiftReach sessions.
          </li>
          <li>
            <strong>Send you a confirmation email</strong> to the address
            that submitted the request, confirming deletion is complete.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="timeline" number={5} title="Timeline">
        <p>
          We process deletion requests <strong>within 30 days</strong> of
          receiving a verified request. In most cases, deletion is
          completed within 1–3 business days; the 30-day window exists for
          cases where verification takes longer or a bulk request is being
          processed.
        </p>
        <p>
          You will receive a confirmation email at the address that made
          the request as soon as deletion is complete.
        </p>
      </LegalSection>

      <LegalSection
        id="meta-users"
        number={6}
        title="For Users Arriving from Facebook / Meta"
      >
        <p>
          If you connected your WhatsApp Business Account to SwiftReach
          through Meta&apos;s Embedded Signup and now want SwiftReach to
          stop having access to your data, you have two options:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Revoke access at Meta:</strong> visit{" "}
            <a
              href="https://business.facebook.com/settings"
              target="_blank"
              rel="noreferrer"
              className="text-whatsapp hover:underline"
            >
              Meta Business Settings
            </a>{" "}
            → Business Integrations → SwiftReach → Remove. This immediately
            invalidates our access token. Note: this does not delete your
            SwiftReach account or the data we have already stored.
          </li>
          <li>
            <strong>Delete your SwiftReach account too:</strong> follow
            Section 3 above to also delete every piece of data SwiftReach
            has stored, including any contact lists, campaign history, and
            inbox messages. This is the complete option.
          </li>
        </ul>
        <p>
          If you want both — revoke Meta access <em>and</em> delete
          SwiftReach data — do the Meta revocation first, then email us for
          the SwiftReach deletion.
        </p>
      </LegalSection>

      <LegalSection id="questions" number={7} title="Questions">
        <p>
          For any question about this process or the status of an existing
          deletion request, email{" "}
          <a href={MAILTO} className="text-whatsapp hover:underline">
            {DELETION_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
