// Terms of Service. Public route — middleware.ts whitelists /terms.
// Content is required for Google OAuth verification (the URL is one of
// the two we'll submit to Google's homepage / privacy / terms fields).
//
// Editing this file: keep section ids in sync with the TOC `sections`
// array below, and bump the `lastUpdated` string whenever you make a
// material change.

import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, type Section } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "SwiftReach Terms of Service — your agreement when using our WhatsApp Business marketing platform.",
};

const sections: Section[] = [
  { id: "acceptance", number: 1, title: "Acceptance of Terms" },
  { id: "description", number: 2, title: "Description of Service" },
  { id: "accounts", number: 3, title: "User Accounts" },
  { id: "acceptable-use", number: 4, title: "Acceptable Use" },
  { id: "meta-policies", number: 5, title: "WhatsApp and Meta Platform Policies" },
  { id: "google-drive", number: 6, title: "Google Drive Integration" },
  { id: "billing", number: 7, title: "Subscription and Billing" },
  { id: "data-privacy", number: 8, title: "Data and Privacy" },
  { id: "ip", number: 9, title: "Intellectual Property" },
  { id: "disclaimers", number: 10, title: "Disclaimers and Limitations" },
  { id: "termination", number: 11, title: "Termination" },
  { id: "changes", number: 12, title: "Changes to Terms" },
  { id: "contact", number: 13, title: "Contact Us" },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      lastUpdated="May 12, 2026"
      sections={sections}
    >
      <LegalSection id="acceptance" number={1} title="Acceptance of Terms">
        <p>
          By accessing or using SwiftReach (&quot;Service&quot;, &quot;we&quot;,
          &quot;us&quot;, &quot;our&quot;), you agree to be bound by these Terms
          of Service. If you do not agree to these terms, do not use the
          Service. These terms apply to all users, including free and paid
          subscribers.
        </p>
      </LegalSection>

      <LegalSection id="description" number={2} title="Description of Service">
        <p>
          SwiftReach is a WhatsApp Business messaging platform that enables
          businesses and individuals to send personalized bulk messages to
          their contacts via the Meta WhatsApp Business Cloud API. The Service
          includes campaign management, contact organization, message
          templates, delivery tracking, and analytics.
        </p>
      </LegalSection>

      <LegalSection id="accounts" number={3} title="User Accounts">
        <ul className="list-disc pl-6 space-y-2">
          <li>You must provide accurate information when creating an account.</li>
          <li>You are responsible for maintaining the security of your account credentials.</li>
          <li>You must be at least 18 years old to use the Service.</li>
          <li>One account per person or business entity.</li>
          <li>You are responsible for all activity under your account.</li>
          <li>Notify us immediately of any unauthorized account access.</li>
        </ul>
      </LegalSection>

      <LegalSection id="acceptable-use" number={4} title="Acceptable Use">
        <p>You agree NOT to use SwiftReach to:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            Send unsolicited messages (spam) to contacts who have not opted in
            to receive communications from you.
          </li>
          <li>
            Send messages that are illegal, harmful, threatening, abusive,
            harassing, defamatory, or discriminatory.
          </li>
          <li>Impersonate any person, business, or entity.</li>
          <li>Distribute malware, viruses, or malicious code.</li>
          <li>Violate any applicable laws or regulations.</li>
          <li>Circumvent any usage limits or restrictions.</li>
          <li>
            Resell or sublicense access to the Service without written
            permission.
          </li>
          <li>
            Use the Service for any purpose that violates Meta&apos;s WhatsApp
            Business Policy.
          </li>
        </ul>
        <p className="font-medium text-zinc-900">
          You are solely responsible for ensuring all contacts in your
          campaigns have opted in to receive WhatsApp messages from your
          business.
        </p>
      </LegalSection>

      <LegalSection
        id="meta-policies"
        number={5}
        title="WhatsApp and Meta Platform Policies"
      >
        <p>
          SwiftReach operates through Meta&apos;s WhatsApp Business Cloud API.
          Your use of the Service is subject to:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <a
              href="https://www.facebook.com/terms"
              target="_blank"
              rel="noreferrer"
              className="text-whatsapp hover:underline"
            >
              Meta&apos;s Terms of Service
            </a>
          </li>
          <li>
            <a
              href="https://www.whatsapp.com/legal/business-policy"
              target="_blank"
              rel="noreferrer"
              className="text-whatsapp hover:underline"
            >
              WhatsApp Business Policy
            </a>
          </li>
          <li>WhatsApp Commerce Policy</li>
        </ul>
        <p>
          We reserve the right to suspend your account if your usage violates
          Meta&apos;s policies or results in your WhatsApp Business account
          being restricted or banned. SwiftReach is not responsible for actions
          taken by Meta against your WhatsApp Business account.
        </p>

        <div>
          <p className="font-medium text-zinc-900">
            Meta Data Use Restrictions:
          </p>
          <p>
            You agree not to use data obtained through the WhatsApp Business
            API to:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>
              Contact people outside of WhatsApp using data obtained from
              WhatsApp.
            </li>
            <li>Build advertising profiles or targeting lists.</li>
            <li>Sell or transfer WhatsApp user data to any third party.</li>
            <li>
              Store message content beyond what is necessary for your
              legitimate business operations.
            </li>
          </ul>
          <p className="mt-3">
            These restrictions are required by Meta&apos;s{" "}
            <a
              href="https://www.facebook.com/terms/platformterms"
              target="_blank"
              rel="noreferrer"
              className="text-whatsapp hover:underline"
            >
              Platform Terms
            </a>{" "}
            and violation may result in immediate account termination.
          </p>
        </div>
      </LegalSection>

      <LegalSection id="google-drive" number={6} title="Google Drive Integration">
        <p>
          SwiftReach offers an optional integration with Google Drive
          (available on paid plans) that allows you to import contact lists
          directly from your Google Drive files. When you use this feature:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            You authorize SwiftReach to access only the specific files you
            select through Google&apos;s file picker.
          </li>
          <li>
            SwiftReach requests read-only access to your selected files (scope:{" "}
            <code className="px-1 py-0.5 bg-zinc-100 rounded text-sm">
              drive.readonly
            </code>
            ).
          </li>
          <li>
            We do not store your Google credentials or OAuth tokens beyond the
            duration of the import session.
          </li>
          <li>
            File contents are processed to extract contact data and are not
            stored on our servers beyond what is necessary to complete the
            import.
          </li>
          <li>
            You can revoke SwiftReach&apos;s access to your Google account at
            any time through your Google Account settings at{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
              className="text-whatsapp hover:underline"
            >
              myaccount.google.com/permissions
            </a>
            .
          </li>
          <li>
            Our use of Google user data is governed by our{" "}
            <Link href="/privacy" className="text-whatsapp hover:underline">
              Privacy Policy
            </Link>{" "}
            and complies with Google&apos;s API Services User Data Policy,
            including the Limited Use requirements.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="billing" number={7} title="Subscription and Billing">
        <ul className="list-disc pl-6 space-y-2">
          <li>
            Free plan: subject to usage limits as specified on the pricing
            page.
          </li>
          <li>Paid plans are billed monthly through Stripe.</li>
          <li>Subscriptions automatically renew unless cancelled.</li>
          <li>
            You may cancel your subscription at any time; access continues
            until the end of the billing period.
          </li>
          <li>We do not offer refunds for partial billing periods.</li>
          <li>
            We reserve the right to change pricing with 30 days notice to
            existing subscribers.
          </li>
          <li>Failure to pay may result in service suspension.</li>
        </ul>
      </LegalSection>

      <LegalSection id="data-privacy" number={8} title="Data and Privacy">
        <p>
          Your use of the Service is also governed by our{" "}
          <Link href="/privacy" className="text-whatsapp hover:underline">
            Privacy Policy
          </Link>
          , which is incorporated into these Terms. By using SwiftReach, you
          consent to the collection and use of your data as described in the
          Privacy Policy.
        </p>
      </LegalSection>

      <LegalSection id="ip" number={9} title="Intellectual Property">
        <ul className="list-disc pl-6 space-y-2">
          <li>
            SwiftReach and its original content, features, and functionality
            are owned by SwiftReach and protected by intellectual property
            laws.
          </li>
          <li>
            You retain ownership of your contact data, message templates, and
            campaign content.
          </li>
          <li>
            You grant SwiftReach a limited license to process your data solely
            to provide the Service.
          </li>
          <li>
            You may not copy, modify, or reverse engineer any part of the
            Service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection
        id="disclaimers"
        number={10}
        title="Disclaimers and Limitations"
      >
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY
          KIND. TO THE MAXIMUM EXTENT PERMITTED BY LAW:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>We do not guarantee uninterrupted or error-free service.</li>
          <li>We are not responsible for failed message deliveries.</li>
          <li>
            We are not liable for any indirect, incidental, or consequential
            damages.
          </li>
          <li>
            Our total liability to you shall not exceed the amount you paid us
            in the 12 months preceding the claim.
          </li>
          <li>
            We are not responsible for third-party services including Meta
            WhatsApp API or Google Drive.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="termination" number={11} title="Termination">
        <p>
          We may terminate or suspend your account immediately, without notice,
          if you breach these Terms. You may terminate your account at any
          time by contacting us. Upon termination, your right to use the
          Service ceases immediately. We may retain your data for up to 90
          days after termination before deletion.
        </p>
      </LegalSection>

      <LegalSection id="changes" number={12} title="Changes to Terms">
        <p>
          We reserve the right to modify these Terms at any time. We will
          notify users of material changes via email or in-app notification at
          least 14 days before the change takes effect. Continued use of the
          Service after changes constitutes acceptance of the new Terms.
        </p>
      </LegalSection>

      <LegalSection id="contact" number={13} title="Contact Us">
        <p>For questions about these Terms of Service, contact us:</p>
        <ul className="list-none space-y-1 pl-0">
          <li>
            Email:{" "}
            <a
              href="mailto:legal@swiftreach.app"
              className="text-whatsapp hover:underline"
            >
              legal@swiftreach.app
            </a>
          </li>
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
      </LegalSection>
    </LegalPage>
  );
}
