"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type FormStep =
  | "physician_question"
  | "collective_question"
  | "contact_form"
  | "thank_you"
  | "thank_you_not_physician";

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
      </div>
    </div>
  );
}
