// Privacy Policy. Public route — middleware.ts whitelists /privacy.
// Content is required for Google OAuth verification. Section 3 (Google
// API Services and User Data) is the one Google's reviewers look for
// specifically — it must mention Limited Use, drive.readonly scope, no
// token persistence, no advertising use, no third-party transfers,
// and how to revoke access.
//
// Editing this file: keep section ids in sync with the TOC `sections`
// array below, and bump the `lastUpdated` string whenever you make a
// material change.

import type { Metadata } from "next";
import { LegalPage, LegalSection, type Section } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "SwiftReach Privacy Policy — how we collect, use, and protect your data, including Google API user data.",
};

const sections: Section[] = [
  { id: "info-we-collect", number: 1, title: "Information We Collect" },
  { id: "how-we-use", number: 2, title: "How We Use Your Information" },
  { id: "google-api", number: 3, title: "Google API Services and User Data" },
  {
    id: "meta-whatsapp",
    number: "3b",
    title: "Meta WhatsApp Business API and User Data",
  },
  { id: "sharing", number: 4, title: "Information Sharing and Disclosure" },
  { id: "retention", number: 5, title: "Data Retention" },
  { id: "security", number: 6, title: "Data Security" },
  { id: "rights", number: 7, title: "Your Rights and Choices" },
  { id: "cookies", number: 8, title: "Cookies and Tracking" },
  { id: "children", number: 9, title: "Children's Privacy" },
  { id: "international", number: 10, title: "International Data Transfers" },
  { id: "changes", number: 11, title: "Changes to This Policy" },
  { id: "contact", number: 12, title: "Contact Us" },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated="May 12, 2026"
      intro={
        <p>
          SwiftReach (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is
          committed to protecting your privacy. This Privacy Policy explains
          how we collect, use, disclose, and safeguard your information when
          you use our Service.
        </p>
      }
      sections={sections}
    >
      <LegalSection
        id="info-we-collect"
        number={1}
        title="Information We Collect"
      >
        <p>
          <strong>Account Information:</strong> When you create an account, we
          collect your name, email address, and authentication information
          through Clerk, our authentication provider.
        </p>
        <p>
          <strong>Business Information:</strong> When you connect your WhatsApp
          Business account, we store (encrypted) your Meta API credentials
          including your API token, Phone Number ID, and Business Account ID
          solely to enable message sending on your behalf.
        </p>
        <p>
          <strong>Contact Data:</strong> We store the contact lists you upload
          or import, including phone numbers and any associated fields (names,
          balances, custom data). This data is used exclusively to send your
          campaigns.
        </p>
        <p>
          <strong>Campaign Data:</strong> We store records of campaigns you
          create, messages sent, delivery statuses, and message content for
          reporting and analytics purposes.
        </p>
        <p>
          <strong>Usage Data:</strong> We automatically collect information
          about how you use the Service, including pages visited, features
          used, and actions taken, to improve the Service.
        </p>
        <p>
          <strong>Payment Information:</strong> Payment processing is handled
          by Stripe. We do not store credit card numbers or sensitive payment
          data on our servers. We receive subscription status and billing
          history from Stripe.
        </p>
      </LegalSection>

      <LegalSection id="how-we-use" number={2} title="How We Use Your Information">
        <p>We use the information we collect to:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Provide, operate, and maintain the Service.</li>
          <li>
            Send WhatsApp messages on your behalf using your connected
            WhatsApp Business account.
          </li>
          <li>Process payments and manage subscriptions.</li>
          <li>Send you service-related communications.</li>
          <li>Provide customer support.</li>
          <li>Monitor and analyze usage patterns to improve the Service.</li>
          <li>Detect and prevent fraud or abuse.</li>
          <li>Comply with legal obligations.</li>
        </ul>
        <p className="font-medium text-zinc-900">
          We do not sell your personal information to third parties. We do not
          use your contact data or message content for advertising purposes.
        </p>
      </LegalSection>

      <LegalSection
        id="google-api"
        number={3}
        title="Google API Services and User Data"
      >
        <p className="font-medium text-zinc-900">
          SwiftReach&apos;s use of information received from Google APIs adheres
          to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
            className="text-whatsapp hover:underline"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>

        <p>
          <strong>What we access:</strong> When you use the Google Drive
          import feature (available on paid plans), SwiftReach requests access
          to your Google Drive with read-only scope (
          <code className="px-1 py-0.5 bg-zinc-100 rounded text-sm">
            drive.readonly
          </code>
          ). This allows you to select and import files from your Drive.
        </p>

        <div>
          <p>
            <strong>What we do with Google data:</strong>
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>
              We access only the specific files you select through
              Google&apos;s file picker UI.
            </li>
            <li>
              We read the file content solely to extract contact information
              for your campaign.
            </li>
            <li>We do not store the raw file contents on our servers.</li>
            <li>We do not use Google user data for advertising.</li>
            <li>
              We do not allow humans to read your Google data unless required
              by law or with your explicit consent.
            </li>
            <li>
              We do not transfer Google user data to third parties except as
              necessary to provide the Service.
            </li>
          </ul>
        </div>

        <p>
          <strong>OAuth tokens:</strong> We do not store your Google OAuth
          access tokens beyond the duration of the import session. Tokens are
          used once to download the selected file and are immediately
          discarded.
        </p>

        <p>
          <strong>Revoking access:</strong> You can revoke SwiftReach&apos;s
          access to your Google account at any time at:{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noreferrer"
            className="text-whatsapp hover:underline"
          >
            myaccount.google.com/permissions
          </a>
        </p>
      </LegalSection>

      <LegalSection
        id="meta-whatsapp"
        number="3b"
        title="Meta WhatsApp Business API and User Data"
      >
        <p>
          SwiftReach uses the Meta WhatsApp Business Cloud API to send messages
          on behalf of our users. This section explains how we handle
          WhatsApp-related data in compliance with Meta&apos;s Platform Terms.
        </p>

        <div>
          <p>
            <strong>What WhatsApp data we access and store:</strong>
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>
              Phone numbers of message recipients (stored as part of your
              contact lists and campaign records).
            </li>
            <li>
              Message content you compose and send through our platform
              (stored for campaign history and analytics).
            </li>
            <li>
              Message delivery statuses (sent, delivered, read, failed)
              received via Meta&apos;s webhook callbacks.
            </li>
            <li>
              Inbound message text from contacts who reply to your campaigns
              (stored in your inbox).
            </li>
          </ul>
        </div>

        <div>
          <p>
            <strong>How we use this data:</strong>
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>To send WhatsApp messages on your behalf.</li>
            <li>
              To display delivery and read receipts in your campaign reports.
            </li>
            <li>To power analytics and performance tracking.</li>
            <li>
              We do not use WhatsApp message data for advertising or share it
              with third parties beyond what is necessary to provide the
              Service.
            </li>
          </ul>
        </div>

        <div>
          <p>
            <strong>Data retention:</strong>
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>
              Contact phone numbers and campaign data are retained while your
              account is active and deleted within 90 days of account closure.
            </li>
            <li>
              Message delivery status data follows the same retention schedule.
            </li>
            <li>
              Inbound messages are retained until you delete them or close your
              account.
            </li>
          </ul>
        </div>

        <p>
          <strong>Meta Platform Terms compliance:</strong> Our use of the
          WhatsApp Business API and all data obtained through it complies with{" "}
          <a
            href="https://www.facebook.com/terms/platformterms"
            target="_blank"
            rel="noreferrer"
            className="text-whatsapp hover:underline"
          >
            Meta&apos;s Platform Terms
          </a>{" "}
          and WhatsApp Business Policy. We do not use Meta platform data in
          ways that violate these terms.
        </p>

        <p>
          <strong>Data deletion:</strong> You can delete your contact data,
          campaign history, and all associated WhatsApp message data at any
          time by deleting your SwiftReach account. To request data deletion,
          email{" "}
          <a
            href="mailto:privacy@swiftreach.app"
            className="text-whatsapp hover:underline"
          >
            privacy@swiftreach.app
          </a>{" "}
          or delete your account through Settings. We will process deletion
          requests within 30 days.
        </p>
      </LegalSection>

      <LegalSection
        id="sharing"
        number={4}
        title="Information Sharing and Disclosure"
      >
        <p>We share your information only in these circumstances:</p>

        <div>
          <p>
            <strong>Service Providers:</strong> We share data with trusted
            third-party providers who assist in operating our Service:
          </p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>Clerk (authentication)</li>
            <li>Stripe (payment processing)</li>
            <li>Neon/PostgreSQL (database hosting)</li>
            <li>Vercel (application hosting)</li>
            <li>Resend (transactional email)</li>
            <li>Meta (WhatsApp message delivery)</li>
          </ul>
          <p className="mt-2">
            All service providers are contractually obligated to protect your
            data and use it only for specified purposes.
          </p>
        </div>

        <p>
          <strong>Legal Requirements:</strong> We may disclose your information
          if required by law, court order, or government authority, or to
          protect the rights, property, or safety of SwiftReach, our users, or
          the public.
        </p>

        <p>
          <strong>Business Transfers:</strong> In the event of a merger,
          acquisition, or sale of assets, your information may be transferred.
          We will provide notice before your data is transferred and becomes
          subject to a different privacy policy.
        </p>

        <p className="font-medium text-zinc-900">
          We never sell your personal information.
        </p>
      </LegalSection>

      <LegalSection id="retention" number={5} title="Data Retention">
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Account data:</strong> retained while your account is
            active and for 90 days after deletion.
          </li>
          <li>
            <strong>Campaign and contact data:</strong> retained while your
            account is active; deleted within 90 days of account termination.
          </li>
          <li>
            <strong>Payment records:</strong> retained for 7 years for tax and
            accounting purposes.
          </li>
          <li>
            <strong>Error logs:</strong> retained for 30 days.
          </li>
          <li>
            <strong>Google Drive import data:</strong> raw file contents are
            not retained; extracted contact data follows the contact data
            retention policy above.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="security" number={6} title="Data Security">
        <p>
          We implement appropriate technical and organizational measures to
          protect your information:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            WhatsApp API tokens are encrypted at rest using AES-256 encryption.
          </li>
          <li>All data transmission uses TLS/HTTPS encryption.</li>
          <li>Database access is restricted and monitored.</li>
          <li>We conduct regular security reviews.</li>
        </ul>
        <p>
          However, no method of transmission or storage is 100% secure. We
          cannot guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection id="rights" number={7} title="Your Rights and Choices">
        <p>Depending on your location, you may have the following rights:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Access:</strong> Request a copy of the personal data we
            hold about you.
          </li>
          <li>
            <strong>Correction:</strong> Request correction of inaccurate
            personal data.
          </li>
          <li>
            <strong>Deletion:</strong> Request deletion of your personal data.
            You can delete your account at any time through the app settings.
          </li>
          <li>
            <strong>Portability:</strong> Request an export of your data in a
            machine-readable format.
          </li>
          <li>
            <strong>Objection:</strong> Object to certain processing of your
            personal data.
          </li>
        </ul>
        <p>
          <strong>California Residents (CCPA):</strong> You have the right to
          know what personal information is collected, the right to delete,
          and the right to opt out of sale (we do not sell personal
          information).
        </p>
        <p>
          <strong>EU/UK Residents (GDPR):</strong> We process your data based
          on contractual necessity and legitimate interests. You have the
          right to lodge a complaint with your supervisory authority.
        </p>
        <p>
          To exercise any of these rights, contact us at{" "}
          <a
            href="mailto:privacy@swiftreach.app"
            className="text-whatsapp hover:underline"
          >
            privacy@swiftreach.app
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id="cookies" number={8} title="Cookies and Tracking">
        <p>
          We use essential cookies required for the Service to function,
          including session cookies for authentication (managed by Clerk). We
          do not use advertising or tracking cookies. We do not use
          third-party analytics services that track you across other websites.
        </p>
      </LegalSection>

      <LegalSection id="children" number={9} title="Children's Privacy">
        <p>
          The Service is not directed to children under 13. We do not
          knowingly collect personal information from children under 13. If
          you believe we have inadvertently collected such information, please
          contact us immediately.
        </p>
      </LegalSection>

      <LegalSection
        id="international"
        number={10}
        title="International Data Transfers"
      >
        <p>
          SwiftReach is operated from the United States. If you access the
          Service from outside the US, your information may be transferred to
          and processed in the United States. By using the Service, you
          consent to this transfer.
        </p>
        <p>
          For EU/UK users: we rely on Standard Contractual Clauses for
          international data transfers where required.
        </p>
      </LegalSection>

      <LegalSection id="changes" number={11} title="Changes to This Policy">
        <p>
          We may update this Privacy Policy periodically. We will notify you
          of material changes via email or in-app notification at least 14
          days before the change takes effect. Continued use of the Service
          after changes constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection id="contact" number={12} title="Contact Us">
        <p>
          For privacy-related questions or to exercise your rights:
        </p>
        <ul className="list-none space-y-1 pl-0">
          <li>
            Email:{" "}
            <a
              href="mailto:privacy@swiftreach.app"
              className="text-whatsapp hover:underline"
            >
              privacy@swiftreach.app
            </a>
          </li>
          <li>Address: SwiftReach, California, United States</li>
          <li>
            Website:{" "}
            <a
              href="https://www.swiftreach.app"
              className="text-whatsapp hover:underline"
            >
              swiftreach.app
            </a>
          </li>
        </ul>
        <p className="pt-2">
          <strong>For Google API data concerns specifically:</strong>
        </p>
        <ul className="list-none space-y-1 pl-0">
          <li>
            Email:{" "}
            <a
              href="mailto:privacy@swiftreach.app?subject=Google%20API%20Data%20Request"
              className="text-whatsapp hover:underline"
            >
              privacy@swiftreach.app
            </a>
          </li>
          <li>Subject: Google API Data Request</li>
        </ul>
      </LegalSection>
    </LegalPage>
  );
}
