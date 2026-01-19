import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Doc",
  description: "Privacy Policy for Doc - Voice Therapy for Physicians",
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-black text-gray-300 py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="text-gray-500 hover:text-gray-300 transition-colors mb-8 inline-block"
        >
          &larr; Back to Doc
        </Link>

        <h1 className="text-4xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-gray-500 mb-12">Last updated January 19, 2025</p>

        <div className="prose prose-invert prose-gray max-w-none space-y-8">
          <p>
            Doc and its operators (&quot;Doc&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) are committed to the privacy of our users. This Privacy Policy explains what information we collect when you use our voice-based application and services (the &quot;Service&quot;), and how we use that information.
          </p>

          <p>
            By using the Service, you consent to our collection, storage, use, and disclosure of your information as described in this Privacy Policy.
          </p>

          <section>
            <h2 className="text-2xl font-semibold text-white mt-12 mb-4">1. Information We Collect</h2>
            <p>
              We collect certain categories of information when you use our Service. The information we collect depends on how you interact with Doc.
            </p>

            <h3 className="text-xl font-medium text-white mt-6 mb-3">Voice and Audio Data</h3>
            <p>
              When you use Doc, we collect <strong>voice recordings</strong> and audio data from your conversations. This is necessary to provide the voice-based interaction that is core to our Service. Your voice data may be processed to generate transcripts of your conversations.
            </p>

            <h3 className="text-xl font-medium text-white mt-6 mb-3">Technical Information</h3>
            <p>We may also collect:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Device information and identifiers</li>
              <li>IP address</li>
              <li>Browser type and settings</li>
              <li>Usage data and interaction logs</li>
              <li>Approximate location (city/region level based on IP)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mt-12 mb-4">2. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide, operate, and maintain the Service</li>
              <li>Process your voice input and generate responses</li>
              <li>Improve and develop the Service</li>
              <li>Monitor and analyze usage patterns</li>
              <li>Detect and prevent fraud or abuse</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mt-12 mb-4">3. Third-Party Services</h2>
            <p>
              We use third-party service providers to help deliver our Service. These providers may process your data, including voice data, on our behalf:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Voice processing services</strong> - to enable real-time voice conversations</li>
              <li><strong>Speech-to-text services</strong> - to transcribe your voice input</li>
              <li><strong>AI language models</strong> - to generate conversational responses</li>
              <li><strong>Text-to-speech services</strong> - to generate voice responses</li>
              <li><strong>Analytics providers</strong> - to understand Service usage</li>
            </ul>
            <p className="mt-4">
              These service providers are contractually obligated to protect your information and use it only for the purposes we specify.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mt-12 mb-4">4. Data Retention</h2>
            <p>
              We retain your information only as long as necessary for the purposes described in this Privacy Policy. Voice data and conversation transcripts may be retained for a limited period to improve our Service, after which they are deleted or anonymized.
            </p>
            <p className="mt-4">
              You may request deletion of your data at any time by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mt-12 mb-4">5. Data Security</h2>
            <p>
              We implement reasonable technical and organizational measures to protect your information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mt-12 mb-4">6. Your Rights and Choices</h2>
            <p>Depending on your location, you may have certain rights regarding your information:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Access</strong> - Request a copy of the information we hold about you</li>
              <li><strong>Deletion</strong> - Request deletion of your information</li>
              <li><strong>Correction</strong> - Request correction of inaccurate information</li>
              <li><strong>Opt-out</strong> - Opt out of certain data processing activities</li>
            </ul>
            <p className="mt-4">
              To exercise these rights, please contact us using the information below.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mt-12 mb-4">7. California Privacy Rights</h2>
            <p>
              If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA), including the right to know what personal information we collect, the right to delete your information, and the right to opt out of the sale of your personal information. We do not sell your personal information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mt-12 mb-4">8. Children&apos;s Privacy</h2>
            <p>
              Our Service is not directed to children under the age of 13. We do not knowingly collect personal information from children under 13. If we learn we have collected information from a child under 13, we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mt-12 mb-4">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. If we make material changes, we will notify you by posting the updated policy on this page with a new &quot;Last updated&quot; date.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mt-12 mb-4">10. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy or our data practices, please contact us.
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-gray-800 text-center text-gray-600 text-sm">
          <Link href="/" className="hover:text-gray-400 transition-colors">
            Doc
          </Link>
          {" | "}
          <span>Privacy Policy</span>
        </div>
      </div>
    </div>
  );
}
