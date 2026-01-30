"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function AboutPage() {
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
          <h1 className="text-4xl font-bold text-brand-navy-900 mb-2 tracking-tight">Who We Are</h1>
          <p className="text-brand-navy-400 mb-12 text-sm">Building a network for independent physicians</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="glass rounded-2xl p-8 shadow-glass space-y-8"
        >
          {/* Mission Statement */}
          <section>
            <h2 className="text-xl font-semibold text-brand-navy-900 mb-4">Our Mission</h2>
            <p className="text-brand-navy-700 leading-relaxed mb-4">
              <strong>We&apos;re gathering pain points from US independent physician owners to better understand how we can serve you.</strong>
            </p>
            <p className="text-brand-navy-600 leading-relaxed">
              Doc was created because we believe healthcare workers deserve to be heard. The system is broken, and the people keeping it running are burning out. We&apos;re building a network for those who feel alone in the fight.
            </p>
          </section>

          {/* Who is Meroka */}
          <section>
            <h2 className="text-xl font-semibold text-brand-navy-900 mb-4">Who is Meroka?</h2>
            <p className="text-brand-navy-700 leading-relaxed mb-4">
              Meroka is a team focused on supporting independent physicians and healthcare workers in the US. We&apos;re not a big insurance company. We&apos;re not here to mine your data for profit.
            </p>
            <p className="text-brand-navy-600 leading-relaxed">
              We&apos;re building tools that actually help—starting with Doc, an AI companion that lets you vent without judgment, without a waitlist, without copays.
            </p>
          </section>

          {/* Why Doc Exists */}
          <section>
            <h2 className="text-xl font-semibold text-brand-navy-900 mb-4">Why Doc Exists</h2>
            <p className="text-brand-navy-700 leading-relaxed mb-4">
              We created Doc because we kept hearing the same story: healthcare workers are exhausted, frustrated, and feel like no one in power is listening.
            </p>
            <p className="text-brand-navy-600 leading-relaxed mb-4">
              Doc gives you a space to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-brand-navy-600">
              <li>Vent about the broken system—prior auths, EHRs, admin burden, all of it</li>
              <li>Talk or type, whatever works for you</li>
              <li>Be heard by someone (or something) that actually gets it</li>
              <li>Contribute to a larger movement for change</li>
            </ul>
          </section>

          {/* What Happens With Your Data */}
          <section>
            <h2 className="text-xl font-semibold text-brand-navy-900 mb-4">What We Do With Your Data</h2>
            <p className="text-brand-navy-700 leading-relaxed mb-4">
              Let&apos;s be transparent: we use what you share to understand the pain points of healthcare workers.
            </p>
            <p className="text-brand-navy-600 leading-relaxed mb-4">
              Here&apos;s exactly what that means:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-brand-navy-600">
              <li><strong>Anonymized insights:</strong> We analyze patterns in what people are frustrated about—not who you are</li>
              <li><strong>No personal selling:</strong> We don&apos;t sell your individual data to anyone, ever</li>
              <li><strong>Research for advocacy:</strong> We use aggregated data to advocate for systemic changes that help healthcare workers</li>
              <li><strong>Product improvement:</strong> Your feedback helps us make Doc better at understanding and supporting you</li>
            </ul>
            <p className="text-brand-navy-600 leading-relaxed mt-4">
              When you use Doc, you&apos;re not just venting into the void. You&apos;re joining a network of physicians working toward real change.
            </p>
          </section>

          {/* The Collective */}
          <section>
            <h2 className="text-xl font-semibold text-brand-navy-900 mb-4">Building a Network</h2>
            <p className="text-brand-navy-700 leading-relaxed mb-4">
              We&apos;re building a network to give power back to independent physicians through three pillars:
            </p>
            <ul className="list-disc pl-6 space-y-3 text-brand-navy-600">
              <li><strong>Community:</strong> Connecting independent physicians who are facing the same battles—so you&apos;re not fighting alone</li>
              <li><strong>Finance:</strong> Tools and resources to help independent practices stay independent and thrive</li>
              <li><strong>Technology:</strong> Building solutions that actually reduce burden instead of adding to it</li>
            </ul>
            <p className="text-brand-navy-600 leading-relaxed mt-4">
              Doc is the first step—understanding what&apos;s really broken from the people living it every day. Your frustrations help us build what comes next.
            </p>
          </section>

          {/* Call to Action */}
          <section className="bg-brand-brown/5 rounded-xl p-6 border border-brand-brown/10">
            <p className="text-brand-navy-800 leading-relaxed font-medium mb-2">
              If you&apos;re angry about the healthcare system, we want to know.
            </p>
            <p className="text-brand-navy-600 leading-relaxed">
              Talk to Doc. Type to Doc. Vent however works for you. Your frustrations aren&apos;t just being heard—they&apos;re being collected to help us help you.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-xl font-semibold text-brand-navy-900 mb-4">Questions?</h2>
            <p className="text-brand-navy-700 leading-relaxed">
              We get it—trust is earned, not given. If you have questions about who we are, what we&apos;re doing, or how your data is used,{" "}
              <a href="https://www.meroka.com/contact" target="_blank" rel="noopener noreferrer" className="text-brand-brown hover:underline">reach out to us</a>.
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
          <Link href="/privacy" className="hover:text-brand-brown transition-colors">
            Privacy Policy
          </Link>
          <span className="mx-2">|</span>
          <span>Who We Are</span>
        </motion.div>
      </div>
    </div>
  );
}
