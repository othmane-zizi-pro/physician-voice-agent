"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen relative overflow-hidden text-brand-navy-900 font-sans selection:bg-brand-ice">
      {/* Animated gradient background - matching landing page */}
      <motion.div
        className="fixed inset-0 -z-10"
        animate={{
          background: [
            "radial-gradient(circle at 0% 0%, rgba(154,70,22,0.05) 0%, transparent 50%), radial-gradient(circle at 100% 100%, rgba(212,228,244,0.3) 0%, transparent 50%)",
            "radial-gradient(circle at 100% 0%, rgba(154,70,22,0.05) 0%, transparent 50%), radial-gradient(circle at 0% 100%, rgba(212,228,244,0.3) 0%, transparent 50%)",
            "radial-gradient(circle at 0% 0%, rgba(154,70,22,0.05) 0%, transparent 50%), radial-gradient(circle at 100% 100%, rgba(212,228,244,0.3) 0%, transparent 50%)",
          ],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      />

      <div className="max-w-3xl mx-auto py-16 px-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Link
            href="/"
            className="text-brand-navy-400 hover:text-brand-brown transition-colors mb-8 inline-flex items-center gap-2 text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Doc
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <h1 className="text-4xl font-bold text-brand-navy-900 mb-2 tracking-tight">Privacy Policy</h1>
          <p className="text-brand-navy-400 mb-12 text-sm">Last updated January 2025</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="glass rounded-2xl p-8 shadow-glass space-y-8"
        >
          <p className="text-brand-navy-700 leading-relaxed">
            Doc (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) respects your privacy. This Privacy Policy explains how we collect and use information when you use our Service.
          </p>

          <p className="text-brand-navy-600 leading-relaxed">
            By using the Service, you consent to our collection and use of information as described below.
          </p>

          <section>
            <h2 className="text-xl font-semibold text-brand-navy-900 mb-4">Information We Collect</h2>
            <p className="text-brand-navy-700 leading-relaxed mb-4">
              To provide our voice-based Service, we collect data necessary for the interaction to function properly. This includes:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-brand-navy-600">
              <li>Audio and voice data from your conversations</li>
              <li>Transcripts generated from voice interactions</li>
              <li>Device and browser information</li>
              <li>IP address and approximate location</li>
              <li>Usage patterns and interaction data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-brand-navy-900 mb-4">How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2 text-brand-navy-600">
              <li>Provide and operate the Service</li>
              <li>Process interactions and generate responses</li>
              <li>Improve and develop the Service</li>
              <li>Monitor usage and prevent abuse</li>
              <li>Comply with legal requirements</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-brand-navy-900 mb-4">Service Providers</h2>
            <p className="text-brand-navy-700 leading-relaxed">
              We work with third-party providers to deliver our Service, including voice processing, transcription, AI models, and analytics. These providers are contractually bound to protect your information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-brand-navy-900 mb-4">Data Retention</h2>
            <p className="text-brand-navy-700 leading-relaxed">
              We retain information only as long as necessary for the purposes described here. You may request deletion of your data at any time by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-brand-navy-900 mb-4">Security</h2>
            <p className="text-brand-navy-700 leading-relaxed">
              We implement reasonable measures to protect your information. However, no method of transmission over the internet is completely secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-brand-navy-900 mb-4">Your Rights</h2>
            <p className="text-brand-navy-700 leading-relaxed mb-4">
              Depending on your location, you may have rights to access, delete, or correct your information. Contact us to exercise these rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-brand-navy-900 mb-4">Children&apos;s Privacy</h2>
            <p className="text-brand-navy-700 leading-relaxed">
              Our Service is not directed to children under 13. We do not knowingly collect information from children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-brand-navy-900 mb-4">Changes</h2>
            <p className="text-brand-navy-700 leading-relaxed">
              We may update this Privacy Policy from time to time. Changes will be posted on this page.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-brand-navy-900 mb-4">Contact</h2>
            <p className="text-brand-navy-700 leading-relaxed">
              Questions about this Privacy Policy? Please contact us.
            </p>
          </section>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-12 text-center text-brand-navy-400 text-xs"
        >
          <Link href="/" className="hover:text-brand-brown transition-colors font-medium">
            Doc
          </Link>
          <span className="mx-2">|</span>
          <span>Privacy Policy</span>
        </motion.div>
      </div>
    </div>
  );
}
