"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

type FormStep =
  | "consent"
  | "healthcare_question"
  | "workplace_question"
  | "role_question"
  | "collective_question"
  | "contact_form"
  | "thank_you";

type WorkplaceType = "independent" | "hospital" | null;
type RoleType = "owner" | "provider" | "front_office" | null;

interface FeaturedQuote {
  quote: string;
  location: string;
}

interface PostCallFormProps {
  callId: string | null;
  transcript: string;
  onComplete: () => void;
}

export default function PostCallForm({ callId, transcript, onComplete }: PostCallFormProps) {
  const [step, setStep] = useState<FormStep>("consent");

  // Consent answers
  const [consentShareQuote, setConsentShareQuote] = useState<boolean | null>(null);
  const [consentStoreChatlog, setConsentStoreChatlog] = useState<boolean | null>(null);

  // Qualification answers
  const [worksInHealthcare, setWorksInHealthcare] = useState<boolean | null>(null);
  const [workplaceType, setWorkplaceType] = useState<WorkplaceType>(null);
  const [roleType, setRoleType] = useState<RoleType>(null);
  const [interestedInCollective, setInterestedInCollective] = useState<boolean | null>(null);

  // Contact info
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Featured quotes for sidebar
  const [featuredQuotes, setFeaturedQuotes] = useState<FeaturedQuote[]>([]);

  // Fetch featured quotes on mount
  useEffect(() => {
    fetch("/api/featured-quotes")
      .then((res) => res.json())
      .then((data) => {
        if (data.quotes) {
          setFeaturedQuotes(data.quotes);
        }
      })
      .catch(console.error);
  }, []);

  // Extract a preview from the transcript (user's words only)
  const getTranscriptPreview = () => {
    if (!transcript) return null;
    const lines = transcript.split("\n");
    const userLines = lines
      .filter((line) => line.startsWith("You:"))
      .map((line) => line.replace("You:", "").trim())
      .filter((line) => line.length > 20); // Only meaningful lines

    if (userLines.length === 0) return null;

    // Get the most substantive line (longest)
    const bestLine = userLines.reduce((a, b) => (a.length > b.length ? a : b));
    return bestLine.length > 150 ? bestLine.slice(0, 150) + "..." : bestLine;
  };

  const transcriptPreview = getTranscriptPreview();

  // Step handlers
  const handleConsentComplete = () => {
    setStep("healthcare_question");
  };

  const handleHealthcareAnswer = (answer: boolean) => {
    setWorksInHealthcare(answer);
    if (answer) {
      setStep("workplace_question");
    } else {
      // Not in healthcare - save and thank
      saveLead({
        works_in_healthcare: false,
        consent_share_quote: consentShareQuote,
        consent_store_chatlog: consentStoreChatlog,
      });
      setStep("thank_you");
    }
  };

  const handleWorkplaceAnswer = (type: WorkplaceType) => {
    setWorkplaceType(type);
    if (type === "independent") {
      setStep("role_question");
    } else {
      // Hospital group - ask about collective
      setStep("collective_question");
    }
  };

  const handleRoleAnswer = (role: RoleType) => {
    setRoleType(role);
    setStep("collective_question");
  };

  const handleCollectiveAnswer = (answer: boolean) => {
    setInterestedInCollective(answer);
    if (answer) {
      setStep("contact_form");
    } else {
      saveLead({
        works_in_healthcare: worksInHealthcare,
        workplace_type: workplaceType,
        role_type: roleType,
        interested_in_collective: false,
        consent_share_quote: consentShareQuote,
        consent_store_chatlog: consentStoreChatlog,
        // Backwards compatibility
        is_physician_owner: workplaceType === "independent" && roleType === "owner",
        works_at_independent_clinic: workplaceType === "independent",
      });
      setStep("thank_you");
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    setIsSubmitting(true);
    await saveLead({
      works_in_healthcare: worksInHealthcare,
      workplace_type: workplaceType,
      role_type: roleType,
      interested_in_collective: true,
      name: name.trim(),
      email: email.trim(),
      consent_share_quote: consentShareQuote,
      consent_store_chatlog: consentStoreChatlog,
      // Backwards compatibility
      is_physician_owner: workplaceType === "independent" && roleType === "owner",
      works_at_independent_clinic: workplaceType === "independent",
    });
    setIsSubmitting(false);
    setStep("thank_you");
  };

  const saveLead = async (data: {
    works_in_healthcare?: boolean | null;
    workplace_type?: WorkplaceType;
    role_type?: RoleType;
    interested_in_collective?: boolean;
    name?: string;
    email?: string;
    consent_share_quote?: boolean | null;
    consent_store_chatlog?: boolean | null;
    is_physician_owner?: boolean;
    works_at_independent_clinic?: boolean | null;
  }) => {
    try {
      await supabase.from("leads").insert({
        call_id: callId,
        ...data,
      });
    } catch (error) {
      console.error("Failed to save lead:", error);
    }
  };

  const showSidebar = step !== "thank_you";

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Consent Step */}
        {step === "consent" && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-semibold text-white mb-2 text-center">
              Thanks for sharing
            </h2>
            <p className="text-gray-400 text-sm text-center mb-6">
              We believe in being upfront about how we use your conversation.
            </p>

            {/* Show transcript preview if available */}
            {transcriptPreview && (
              <div className="bg-gray-800/50 rounded-lg p-4 mb-6 border border-gray-700">
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">
                  From your conversation
                </p>
                <p className="text-gray-300 text-sm italic">
                  &ldquo;{transcriptPreview}&rdquo;
                </p>
              </div>
            )}

            <div className="space-y-4">
              {/* Share quote consent */}
              <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700/50">
                <p className="text-white text-sm mb-3">
                  May we share highlights from your conversation anonymously?
                </p>
                <p className="text-gray-500 text-xs mb-3">
                  This helps other healthcare workers see they&apos;re not alone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConsentShareQuote(true)}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                      consentShareQuote === true
                        ? "bg-green-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    Yes, share
                  </button>
                  <button
                    onClick={() => setConsentShareQuote(false)}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                      consentShareQuote === false
                        ? "bg-gray-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    No thanks
                  </button>
                </div>
              </div>

              {/* Store chatlog consent */}
              <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700/50">
                <p className="text-white text-sm mb-3">
                  Can we store this conversation to improve Doc?
                </p>
                <p className="text-gray-500 text-xs mb-3">
                  Helps us understand healthcare workers better.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConsentStoreChatlog(true)}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                      consentStoreChatlog === true
                        ? "bg-green-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    Yes, store
                  </button>
                  <button
                    onClick={() => setConsentStoreChatlog(false)}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                      consentStoreChatlog === false
                        ? "bg-gray-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    No thanks
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleConsentComplete}
              disabled={consentShareQuote === null || consentStoreChatlog === null}
              className="w-full mt-6 py-3 px-6 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* Healthcare Question */}
        {step === "healthcare_question" && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-semibold text-white mb-6 text-center">
              Do you work in American healthcare?
            </h2>
            <div className="flex gap-4">
              <button
                onClick={() => handleHealthcareAnswer(true)}
                className="flex-1 py-3 px-6 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors"
              >
                Yes
              </button>
              <button
                onClick={() => handleHealthcareAnswer(false)}
                className="flex-1 py-3 px-6 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
              >
                No
              </button>
            </div>
          </div>
        )}

        {/* Workplace Type Question */}
        {step === "workplace_question" && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-semibold text-white mb-6 text-center">
              Which best describes your workplace?
            </h2>
            <div className="space-y-3">
              <button
                onClick={() => handleWorkplaceAnswer("independent")}
                className="w-full py-4 px-6 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-medium rounded-lg transition-colors text-left"
              >
                <span className="block text-white">Independent Practice</span>
                <span className="block text-gray-400 text-sm mt-1">
                  Private practice, physician-owned clinic
                </span>
              </button>
              <button
                onClick={() => handleWorkplaceAnswer("hospital")}
                className="w-full py-4 px-6 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-medium rounded-lg transition-colors text-left"
              >
                <span className="block text-white">Hospital or Health System</span>
                <span className="block text-gray-400 text-sm mt-1">
                  Hospital, large health system, corporate practice
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Role Type Question (for independent practices) */}
        {step === "role_question" && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-semibold text-white mb-6 text-center">
              Which best describes your role?
            </h2>
            <div className="space-y-3">
              <button
                onClick={() => handleRoleAnswer("owner")}
                className="w-full py-4 px-6 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-medium rounded-lg transition-colors text-left"
              >
                <span className="block text-white">Owner / Partner</span>
                <span className="block text-gray-400 text-sm mt-1">
                  You own or co-own the practice
                </span>
              </button>
              <button
                onClick={() => handleRoleAnswer("provider")}
                className="w-full py-4 px-6 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-medium rounded-lg transition-colors text-left"
              >
                <span className="block text-white">Provider</span>
                <span className="block text-gray-400 text-sm mt-1">
                  Physician, NP, PA, or other clinician
                </span>
              </button>
              <button
                onClick={() => handleRoleAnswer("front_office")}
                className="w-full py-4 px-6 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-medium rounded-lg transition-colors text-left"
              >
                <span className="block text-white">Front Office / Admin</span>
                <span className="block text-gray-400 text-sm mt-1">
                  Office manager, billing, reception
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Collective Question - with context */}
        {step === "collective_question" && (
          <div className="animate-fade-in">
            <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-4 mb-6">
              <p className="text-green-400 text-sm font-medium mb-2">About Meroka</p>
              <p className="text-gray-300 text-sm leading-relaxed">
                We&apos;re building a collective of independent healthcare practices to
                negotiate better rates with payers and reduce administrative burden.
                Together, we have more leverage.
              </p>
            </div>

            <h2 className="text-xl font-semibold text-white mb-6 text-center">
              Interested in learning more?
            </h2>
            <div className="flex gap-4">
              <button
                onClick={() => handleCollectiveAnswer(true)}
                className="flex-1 py-3 px-6 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors"
              >
                Yes, tell me more
              </button>
              <button
                onClick={() => handleCollectiveAnswer(false)}
                className="flex-1 py-3 px-6 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        )}

        {/* Contact Form */}
        {step === "contact_form" && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-semibold text-white mb-2 text-center">
              Great! Let&apos;s stay in touch.
            </h2>
            <p className="text-gray-400 text-sm text-center mb-6">
              We&apos;ll reach out with more information about the collective.
            </p>
            <form onSubmit={handleContactSubmit} className="space-y-4">
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
                autoFocus
              />
              <input
                type="email"
                placeholder="Your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
              />
              <button
                type="submit"
                disabled={!name.trim() || !email.trim() || isSubmitting}
                className="w-full py-3 px-6 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </button>
            </form>
          </div>
        )}

        {/* Thank You */}
        {step === "thank_you" && (
          <div className="animate-fade-in text-center">
            <div className="text-4xl mb-4">🙏</div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Thank you{name ? `, ${name}` : ""}!
            </h2>
            <p className="text-gray-400 mb-6">
              {interestedInCollective
                ? "We'll be in touch soon with more information."
                : "Thanks for trying Doc. Take care of yourself."}
            </p>
            <button
              onClick={onComplete}
              className="py-2 px-6 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {/* Featured Quotes - shown during form questions */}
        {showSidebar && featuredQuotes.length > 0 && step !== "consent" && (
          <div className="mt-6 pt-6 border-t border-gray-800">
            <p className="text-gray-500 text-xs text-center mb-4">
              What other healthcare workers are saying
            </p>
            <div className="space-y-3 max-h-32 overflow-y-auto pr-2 scrollbar-thin">
              {featuredQuotes.slice(0, 2).map((item, index) => (
                <div
                  key={index}
                  className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50"
                >
                  <p className="text-gray-300 text-sm italic leading-relaxed">
                    &ldquo;{item.quote}&rdquo;
                  </p>
                  <p className="text-gray-500 text-xs mt-2">— {item.location}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Social Links - shown during form questions */}
        {showSidebar && (
          <div className="mt-6 pt-4 border-t border-gray-800">
            <p className="text-gray-500 text-xs text-center mb-3">Follow Meroka</p>
            <div className="flex justify-center gap-4">
              <a
                href="https://x.com/MerokaInc"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://www.linkedin.com/company/merokainc"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
