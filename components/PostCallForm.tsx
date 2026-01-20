"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

type FormStep =
  | "physician_question"
  | "collective_question"
  | "contact_form"
  | "thank_you"
  | "thank_you_not_physician";

interface FeaturedQuote {
  quote: string;
  location: string;
}

interface PostCallFormProps {
  callId: string | null;
  onComplete: () => void;
}

export default function PostCallForm({ callId, onComplete }: PostCallFormProps) {
  const [step, setStep] = useState<FormStep>("physician_question");
  const [isPhysicianOwner, setIsPhysicianOwner] = useState<boolean | null>(null);
  const [interestedInCollective, setInterestedInCollective] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const handlePhysicianAnswer = (answer: boolean) => {
    setIsPhysicianOwner(answer);
    if (answer) {
      setStep("collective_question");
    } else {
      setStep("thank_you_not_physician");
      saveLead({ is_physician_owner: false });
    }
  };

  const handleCollectiveAnswer = (answer: boolean) => {
    setInterestedInCollective(answer);
    if (answer) {
      setStep("contact_form");
    } else {
      setStep("thank_you");
      saveLead({ is_physician_owner: true, interested_in_collective: false });
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    setIsSubmitting(true);
    await saveLead({
      is_physician_owner: true,
      interested_in_collective: true,
      name: name.trim(),
      email: email.trim(),
    });
    setIsSubmitting(false);
    setStep("thank_you");
  };

  const saveLead = async (data: {
    is_physician_owner?: boolean;
    interested_in_collective?: boolean;
    name?: string;
    email?: string;
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

  const showSocials = step !== "thank_you" && step !== "thank_you_not_physician";

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full shadow-2xl">
        {/* Physician Question */}
        {step === "physician_question" && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-semibold text-white mb-6 text-center">
              Are you a US independent physician owner?
            </h2>
            <div className="flex gap-4">
              <button
                onClick={() => handlePhysicianAnswer(true)}
                className="flex-1 py-3 px-6 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors"
              >
                Yes
              </button>
              <button
                onClick={() => handlePhysicianAnswer(false)}
                className="flex-1 py-3 px-6 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
              >
                No
              </button>
            </div>
          </div>
        )}

        {/* Collective Question */}
        {step === "collective_question" && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-semibold text-white mb-6 text-center">
              Are you interested in joining a collective to stand your ground against the system?
            </h2>
            <div className="flex gap-4">
              <button
                onClick={() => handleCollectiveAnswer(true)}
                className="flex-1 py-3 px-6 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors"
              >
                Yes
              </button>
              <button
                onClick={() => handleCollectiveAnswer(false)}
                className="flex-1 py-3 px-6 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
              >
                No
              </button>
            </div>
          </div>
        )}

        {/* Contact Form */}
        {step === "contact_form" && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-semibold text-white mb-6 text-center">
              What&apos;s your name and email?
            </h2>
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

        {/* Thank You - Interested */}
        {step === "thank_you" && (
          <div className="animate-fade-in text-center">
            <div className="text-4xl mb-4">🙏</div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Thank you{name ? `, ${name}` : ""}!
            </h2>
            <p className="text-gray-400 mb-6">
              {interestedInCollective
                ? "We'll be in touch soon."
                : "Thanks for your time."}
            </p>
            <button
              onClick={onComplete}
              className="py-2 px-6 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {/* Thank You - Not Physician */}
        {step === "thank_you_not_physician" && (
          <div className="animate-fade-in text-center">
            <div className="text-4xl mb-4">👋</div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Thank you for your time
            </h2>
            <p className="text-gray-400 mb-6">
              We appreciate you trying Doc.
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
        {showSocials && featuredQuotes.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-800">
            <p className="text-gray-500 text-xs text-center mb-4">What other physicians are saying</p>
            <div className="space-y-3 max-h-48 overflow-y-auto pr-2 scrollbar-thin">
              {featuredQuotes.map((item, index) => (
                <div
                  key={index}
                  className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50"
                >
                  <p className="text-gray-300 text-sm italic leading-relaxed">
                    &ldquo;{item.quote}&rdquo;
                  </p>
                  <p className="text-gray-500 text-xs mt-2">
                    — {item.location}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Social Links - shown during form questions */}
        {showSocials && (
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
