"use client";

import { useState, useEffect } from "react";
import { Twitter, Linkedin, Link2, Check, Film, Download, Loader2, ArrowRight, ArrowLeft, Heart, Share2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { trackClick } from "@/lib/trackClick";
import type { TranscriptEntry } from "@/types/database";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type FormStep =
  | "healthcare_question"
  | "workplace_question"
  | "role_question"
  | "collective_question"
  | "contact_form"
  | "video_clip"
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

// Parse timestamped transcript into exchanges (user turn + doc response)
function parseTranscriptIntoExchanges(entries: TranscriptEntry[]): Array<{
  index: number;
  physicianText: string;
  docText: string;
  startSeconds: number;
  endSeconds: number;
}> {
  const exchanges: Array<{
    index: number;
    physicianText: string;
    docText: string;
    startSeconds: number;
    endSeconds: number;
  }> = [];

  let current: {
    physicianLines: string[];
    docLines: string[];
    startSeconds: number;
    endSeconds: number;
  } | null = null;
  let idx = 0;

  for (const entry of entries) {
    const isUser = entry.speaker === 'user';
    const isDoc = entry.speaker === 'agent';

    if (isUser) {
      if (current && current.docLines.length > 0) {
        exchanges.push({
          index: idx,
          physicianText: current.physicianLines.join(' '),
          docText: current.docLines.join(' '),
          startSeconds: current.startSeconds,
          endSeconds: current.endSeconds,
        });
        idx++;
      }
      if (!current || current.docLines.length > 0) {
        current = {
          physicianLines: [entry.text],
          docLines: [],
          startSeconds: entry.startSeconds,
          endSeconds: entry.endSeconds,
        };
      } else {
        current.physicianLines.push(entry.text);
        current.endSeconds = Math.max(current.endSeconds, entry.endSeconds);
      }
    } else if (isDoc && current) {
      current.docLines.push(entry.text);
      current.endSeconds = Math.max(current.endSeconds, entry.endSeconds);
    }
  }

  if (current && current.docLines.length > 0) {
    exchanges.push({
      index: idx,
      physicianText: current.physicianLines.join(' '),
      docText: current.docLines.join(' '),
      startSeconds: current.startSeconds,
      endSeconds: current.endSeconds,
    });
  }

  return exchanges;
}

export default function PostCallForm({ callId, transcript, onComplete }: PostCallFormProps) {
  const [step, setStep] = useState<FormStep>("healthcare_question");

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

  // Video clip state
  const [clipMode, setClipMode] = useState<'select' | 'generating' | 'result'>('select');
  const [exchanges, setExchanges] = useState<Array<{ index: number; physicianText: string; docText: string; startSeconds: number; endSeconds: number }>>([]);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [clipError, setClipError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [transcriptObject, setTranscriptObject] = useState<TranscriptEntry[] | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);

  // Use new brand colors
  // const bgMain = "bg-[#F8F6F3]";
  // const boxBg = "bg-[#E8E2DC]";
  // const textMain = "text-[#0E1219]";
  // const textMuted = "text-[#3C5676]";
  // const accent = "text-[#9A4616]";
  // const accentBg = "bg-[#9A4616]";

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

  useEffect(() => {
    console.log('[PostCallForm] callId:', callId);
    if (!callId) {
      console.log('[PostCallForm] No callId, skipping fetch');
      return;
    }

    const fetchCallData = async () => {
      console.log('[PostCallForm] Fetching call data for:', callId);
      const { data, error } = await supabase
        .from("calls")
        .select("transcript_object, recording_url")
        .eq("id", callId)
        .single();

      console.log('[PostCallForm] Fetch result:', {
        hasData: !!data,
        hasTranscript: !!data?.transcript_object,
        transcriptLength: data?.transcript_object?.length,
        hasRecording: !!data?.recording_url,
        error: error?.message
      });

      if (data?.transcript_object) {
        setTranscriptObject(data.transcript_object as TranscriptEntry[]);
        const parsed = parseTranscriptIntoExchanges(data.transcript_object as TranscriptEntry[]);
        console.log('[PostCallForm] Parsed exchanges:', parsed.length);
        setExchanges(parsed);
      }
      if (data?.recording_url) {
        setRecordingUrl(data.recording_url);
      }
    };

    fetchCallData();
    const interval = setInterval(fetchCallData, 3000);
    const timeout = setTimeout(() => clearInterval(interval), 60000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [callId]);

  const handleSelectExchange = async (exchangeIndex: number) => {
    setClipMode('generating');
    setClipError(null);

    try {
      const response = await fetch('/api/generate-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId,
          exchangeIndex,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate clip');
      }

      setClipUrl(data.clipUrl);
      setClipMode('result');
    } catch (error) {
      setClipError(error instanceof Error ? error.message : 'Failed to generate clip');
      setClipMode('select');
    }
  };

  const handleCopyClipLink = async () => {
    if (clipUrl) {
      await navigator.clipboard.writeText(clipUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const shareClipToTwitter = () => {
    if (!clipUrl) return;
    const text = "Listen to what healthcare workers are really going through.\n\nTalk to Doc:";
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(clipUrl)}`;
    trackClick("form_clip_twitter", url);
    window.open(url, "_blank", "width=550,height=420");
  };

  const shareClipToLinkedIn = () => {
    if (!clipUrl) return;
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(clipUrl)}`;
    trackClick("form_clip_linkedin", url);
    window.open(url, "_blank", "width=550,height=420");
  };

  const handleHealthcareAnswer = (answer: boolean) => {
    setWorksInHealthcare(answer);
    if (answer) {
      setStep("workplace_question");
    } else {
      saveLead({
        works_in_healthcare: false,
      });
      setStep("video_clip");
    }
  };

  const handleWorkplaceAnswer = (type: WorkplaceType) => {
    setWorkplaceType(type);
    if (type === "independent") {
      setStep("role_question");
    } else {
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
        is_physician_owner: workplaceType === "independent" && roleType === "owner",
        works_at_independent_clinic: workplaceType === "independent",
      });
      setStep("video_clip");
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
      is_physician_owner: workplaceType === "independent" && roleType === "owner",
      works_at_independent_clinic: workplaceType === "independent",
    });
    setIsSubmitting(false);
    setStep("video_clip");
  };

  const saveLead = async (data: any) => {
    try {
      await supabase.from("leads").insert({
        call_id: callId,
        ...data,
      });
    } catch (error) {
      console.error("Failed to save lead:", error);
    }
  };

  const variants = {
    enter: { opacity: 0, scale: 0.95, y: 10 },
    center: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: -10 },
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-brand-navy-900/60 backdrop-blur-sm"
      />

      {/* Modal Card */}
      <motion.div
        className="relative w-full max-w-lg bg-[#F8F6F3] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        initial="enter"
        animate="center"
        exit="exit"
        variants={variants}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        {/* Close Button (top right) */}
        <button
          onClick={onComplete}
          className="absolute top-4 right-4 p-2 text-brand-navy-300 hover:text-brand-navy-900 hover:bg-brand-neutral-100 rounded-full transition-colors z-20"
        >
          <X size={20} />
        </button>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-8 scrollbar-thin">
          <AnimatePresence mode="wait">
            {/* Healthcare Question */}
            {step === "healthcare_question" && (
              <motion.div
                key="healthcare"
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                className="flex flex-col items-center text-center py-4"
              >
                <div className="w-16 h-16 bg-[#D4E4F4] rounded-full flex items-center justify-center mb-6 text-[#3C5676] relative">
                  <Heart size={32} fill="currentColor" className="text-[#3C5676]/20" stroke="currentColor" />
                  <Heart size={32} className="absolute text-[#3C5676]" />
                </div>
                <h2 className="text-2xl font-bold text-[#0E1219] mb-3">
                  Do you work in US healthcare?
                </h2>
                <p className="text-[#3C5676] mb-8 max-w-xs mx-auto">
                  We're gathering insights to help improve conditions for workers.
                </p>
                <div className="grid grid-cols-2 gap-4 w-full">
                  <button
                    onClick={() => handleHealthcareAnswer(true)}
                    className="flex flex-col items-center justify-center gap-2 py-6 px-4 bg-white border-2 border-transparent hover:border-[#9A4616]/20 hover:shadow-lg rounded-2xl transition-all group"
                  >
                    <span className="text-3xl group-hover:scale-110 transition-transform">👍</span>
                    <span className="font-semibold text-[#0E1219]">Yes</span>
                  </button>
                  <button
                    onClick={() => handleHealthcareAnswer(false)}
                    className="flex flex-col items-center justify-center gap-2 py-6 px-4 bg-white border-2 border-transparent hover:border-[#9A4616]/20 hover:shadow-lg rounded-2xl transition-all group"
                  >
                    <span className="text-3xl group-hover:scale-110 transition-transform">👋</span>
                    <span className="font-semibold text-[#0E1219]">No</span>
                  </button>
                </div>
              </motion.div>
            )}

            {/* Workplace Question */}
            {step === "workplace_question" && (
              <motion.div
                key="workplace"
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                className="flex flex-col"
              >
                <h2 className="text-2xl font-bold text-[#0E1219] mb-6 text-center">
                  Where do you work?
                </h2>
                <div className="space-y-4">
                  <button
                    onClick={() => handleWorkplaceAnswer("independent")}
                    className="w-full p-5 bg-white hover:bg-[#E8E2DC]/50 border border-[#E8E2DC] hover:border-[#9A4616]/30 rounded-xl transition-all text-left group shadow-sm hover:shadow-md"
                  >
                    <h3 className="text-lg font-semibold text-[#0E1219] group-hover:text-[#9A4616] transition-colors">Independent Practice</h3>
                    <p className="text-[#3C5676] text-sm mt-1">Private practice, physician-owned clinic</p>
                  </button>
                  <button
                    onClick={() => handleWorkplaceAnswer("hospital")}
                    className="w-full p-5 bg-white hover:bg-[#E8E2DC]/50 border border-[#E8E2DC] hover:border-[#9A4616]/30 rounded-xl transition-all text-left group shadow-sm hover:shadow-md"
                  >
                    <h3 className="text-lg font-semibold text-[#0E1219] group-hover:text-[#9A4616] transition-colors">Hospital System</h3>
                    <p className="text-[#3C5676] text-sm mt-1">Hospital, large health system, corporate</p>
                  </button>
                </div>
              </motion.div>
            )}

            {/* Role Question */}
            {step === "role_question" && (
              <motion.div
                key="role"
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <h2 className="text-2xl font-bold text-[#0E1219] mb-6 text-center">
                  What's your role?
                </h2>
                <div className="space-y-3">
                  {[
                    { id: "owner", title: "Owner / Partner", desc: "You own or co-own the practice" },
                    { id: "provider", title: "Provider", desc: "Physician, NP, PA, or other clinician" },
                    { id: "front_office", title: "Admin / Staff", desc: "Office manager, billing, reception" }
                  ].map((role) => (
                    <button
                      key={role.id}
                      onClick={() => handleRoleAnswer(role.id as RoleType)}
                      className="w-full p-4 bg-white hover:bg-[#E8E2DC]/30 border border-[#E8E2DC] hover:border-[#9A4616]/30 rounded-xl transition-all text-left flex items-center justify-between group"
                    >
                      <div>
                        <h3 className="font-semibold text-[#0E1219] group-hover:text-[#9A4616] transition-colors">{role.title}</h3>
                        <p className="text-[#3C5676] text-sm">{role.desc}</p>
                      </div>
                      <ArrowRight size={18} className="text-[#E8E2DC] group-hover:text-[#9A4616] transition-colors opacity-0 group-hover:opacity-100 transform translate-x-[-10px] group-hover:translate-x-0 transition-all" />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Collective Question */}
            {step === "collective_question" && (
              <motion.div
                key="collective"
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <div className="bg-[#D4E4F4]/40 border border-[#D4E4F4] rounded-2xl p-6 mb-8">
                  <p className="text-[#9A4616] text-xs font-bold uppercase tracking-wider mb-2">Join the movement</p>
                  <p className="text-[#0E1219] leading-relaxed font-medium">
                    The system is rigged against solo practices. We're changing that.
                  </p>
                </div>

                <h2 className="text-xl font-bold text-[#0E1219] mb-6 text-center">
                  Want to learn more about the Meroka collective?
                </h2>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => handleCollectiveAnswer(true)}
                    className="w-full py-4 px-6 bg-[#9A4616] hover:bg-[#69311E] text-white font-semibold rounded-xl shadow-lg shadow-[#9A4616]/20 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Yes, tell me more
                  </button>
                  <button
                    onClick={() => handleCollectiveAnswer(false)}
                    className="w-full py-4 px-6 bg-transparent text-[#3C5676] font-medium hover:text-[#0E1219] transition-colors"
                  >
                    Not right now
                  </button>
                </div>
              </motion.div>
            )}

            {/* Contact Form */}
            {step === "contact_form" && (
              <motion.div
                key="contact"
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <h2 className="text-2xl font-bold text-[#0E1219] mb-2 text-center">
                  Let's stay in touch
                </h2>
                <p className="text-[#3C5676] text-center mb-8 text-sm">
                  We'll share more details about the collective and how we can help.
                </p>

                <form onSubmit={handleContactSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#3C5676] ml-1">NAME</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-[#E8E2DC] focus:border-[#9A4616] rounded-xl text-[#0E1219] placeholder-[#A9BCD0] focus:outline-none focus:ring-2 focus:ring-[#9A4616]/10 transition-all"
                      placeholder="Jane Doe"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#3C5676] ml-1">EMAIL</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-[#E8E2DC] focus:border-[#9A4616] rounded-xl text-[#0E1219] placeholder-[#A9BCD0] focus:outline-none focus:ring-2 focus:ring-[#9A4616]/10 transition-all"
                      placeholder="jane@example.com"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!name.trim() || !email.trim() || isSubmitting}
                    className="w-full mt-4 py-4 px-6 bg-[#9A4616] hover:bg-[#69311E] disabled:bg-[#E8E2DC] disabled:text-[#A9BCD0] disabled:cursor-not-allowed text-white font-semibold rounded-xl shadow-lg shadow-[#9A4616]/20 transition-all flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <span>Submit</span>
                    )}
                  </button>
                </form>
              </motion.div>
            )}

            {/* Video Clip */}
            {step === "video_clip" && (
              <motion.div
                key="video_clip"
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                {clipMode === 'select' && (
                  <>
                    <div className="flex flex-col items-center mb-6">
                      <div className="w-12 h-12 bg-[#9A4616]/10 rounded-full flex items-center justify-center mb-3">
                        <Film size={24} className="text-[#9A4616]" />
                      </div>
                      <h2 className="text-xl font-bold text-[#0E1219] text-center">
                        Create a shareable clip
                      </h2>
                      <p className="text-[#3C5676] text-sm text-center max-w-xs mt-2">
                        Choose a moment from your session to share.
                      </p>
                    </div>

                    {clipError && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm">
                        {clipError}
                      </div>
                    )}

                    <div className="bg-[#E8E2DC]/30 rounded-2xl p-1 max-h-60 overflow-y-auto scrollbar-thin">
                      {exchanges.length > 0 && recordingUrl ? (
                        <div className="space-y-1">
                          {exchanges.map((exchange) => (
                            <button
                              key={exchange.index}
                              onClick={() => handleSelectExchange(exchange.index)}
                              className="w-full text-left p-4 hover:bg-white rounded-xl transition-all border border-transparent hover:border-[#E8E2DC] hover:shadow-sm group"
                            >
                              <div className="flex gap-3">
                                <div className="min-w-1 w-1 bg-[#D4E4F4] group-hover:bg-[#9A4616] rounded-full mt-1 h-auto transition-colors" />
                                <div>
                                  <p className="text-[#0E1219] text-sm font-medium line-clamp-2 mb-1">
                                    "{exchange.physicianText}"
                                  </p>
                                  <p className="text-[#3C5676] text-xs line-clamp-1">
                                    Doc: {exchange.docText}
                                  </p>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12 flex flex-col items-center">
                          <Loader2 size={24} className="text-[#9A4616] animate-spin mb-3" />
                          <p className="text-[#3C5676] text-sm">Processing conversation...</p>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setStep("thank_you")}
                      className="w-full mt-4 py-3 text-[#3C5676] text-sm hover:text-[#0E1219] font-medium transition-colors"
                    >
                      Skip this step
                    </button>
                  </>
                )}

                {clipMode === 'generating' && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
                      <motion.div
                        className="absolute inset-0 border-4 border-[#9A4616]/20 rounded-full"
                        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                      <motion.div
                        className="absolute inset-0 border-4 border-[#9A4616]/40 rounded-full"
                        animate={{ scale: [1, 1.1, 1], opacity: [0.8, 0, 0.8] }}
                        transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                      />
                      <Film size={32} className="text-[#9A4616] relative z-10" />
                    </div>
                    <p className="text-[#0E1219] font-bold text-lg">Generating Clip...</p>
                    <p className="text-[#3C5676] text-sm mt-1">Stitching audio and subtitles</p>
                  </div>
                )}

                {clipMode === 'result' && clipUrl && (
                  <div className="space-y-4">
                    <div className="bg-black rounded-xl overflow-hidden shadow-lg aspect-video relative group">
                      <video src={clipUrl} controls className="w-full h-full object-cover" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={shareClipToTwitter} className="flex items-center justify-center gap-2 py-3 px-4 bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 text-[#1DA1F2] rounded-xl transition-colors font-medium text-sm">
                        <Twitter size={16} /> Twitter
                      </button>
                      <button onClick={shareClipToLinkedIn} className="flex items-center justify-center gap-2 py-3 px-4 bg-[#0A66C2]/10 hover:bg-[#0A66C2]/20 text-[#0A66C2] rounded-xl transition-colors font-medium text-sm">
                        <Linkedin size={16} /> LinkedIn
                      </button>
                    </div>

                    <div className="flex gap-3">
                      <a href={clipUrl} download className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-[#E8E2DC] hover:bg-[#D4E4F4] text-[#0E1219] rounded-xl transition-colors text-sm font-medium">
                        <Download size={16} /> Save
                      </a>
                      <button onClick={handleCopyClipLink} className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-[#E8E2DC] hover:bg-[#D4E4F4] text-[#0E1219] rounded-xl transition-colors text-sm font-medium">
                        {copiedLink ? <Check size={16} className="text-green-600" /> : <Link2 size={16} />}
                        {copiedLink ? "Copied" : "Copy Link"}
                      </button>
                    </div>

                    <div className="pt-4 border-t border-[#E8E2DC]">
                      <button onClick={onComplete} className="w-full py-4 text-[#9A4616] font-bold text-sm tracking-wide uppercase hover:underline">
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Thank You */}
            {step === "thank_you" && (
              <motion.div
                key="thank_you"
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                className="flex flex-col items-center text-center py-8"
              >
                <div className="w-20 h-20 bg-[#D4E4F4] rounded-full flex items-center justify-center mb-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                  >
                    <Check size={40} className="text-[#3C5676]" strokeWidth={3} />
                  </motion.div>
                </div>
                <h2 className="text-2xl font-bold text-[#0E1219] mb-3">
                  All set{name ? `, ${name}` : ""}!
                </h2>
                <p className="text-[#3C5676] mb-8 max-w-xs">
                  {interestedInCollective
                    ? "We'll be in touch soon with more info about the collective."
                    : "Thanks for taking a moment to vent. Come back anytime."}
                </p>
                <button
                  onClick={onComplete}
                  className="py-3 px-8 bg-[#9A4616] hover:bg-[#69311E] text-white font-semibold rounded-xl shadow-lg shadow-[#9A4616]/20 transition-all"
                >
                  Close
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer with social links - Only show on certain steps */}
        {(step !== 'thank_you' && step !== 'video_clip') && (
          <div className="bg-[#E8E2DC]/30 p-4 flex justify-between items-center text-xs text-[#A9BCD0]">
            <div className="flex gap-4">
              <a href="https://x.com/MerokaInc" target="_blank" className="hover:text-[#9A4616] transition-colors"><Twitter size={16} /></a>
              <a href="https://www.linkedin.com/company/merokainc" target="_blank" className="hover:text-[#9A4616] transition-colors"><Linkedin size={16} /></a>
            </div>
            <span>Built by Meroka</span>
          </div>
        )}
      </motion.div>
    </div>
  );
}
