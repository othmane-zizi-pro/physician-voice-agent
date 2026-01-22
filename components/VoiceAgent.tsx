"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Vapi from "@vapi-ai/web";
import { Mic, MicOff, Phone, PhoneOff, Share2, Twitter, Linkedin, Link2, Clock } from "lucide-react";
import { VAPI_ASSISTANT_CONFIG, PHYSICIAN_THERAPIST_PERSONA } from "@/lib/persona";
import { supabase } from "@/lib/supabase";
import PostCallForm from "./PostCallForm";

type CallStatus = "idle" | "connecting" | "active" | "ending";

interface FeaturedQuote {
  id: string;
  quote: string;
  location: string;
}

// Rate limit constants
const RATE_LIMIT_SECONDS = 7 * 60; // 7 minutes
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

interface UsageData {
  usedSeconds: number;
  windowStart: number;
}

function getUsageData(): UsageData {
  if (typeof window === "undefined") return { usedSeconds: 0, windowStart: Date.now() };

  const stored = localStorage.getItem("doc_usage");
  if (!stored) return { usedSeconds: 0, windowStart: Date.now() };

  try {
    const data = JSON.parse(stored) as UsageData;
    // Reset if window has expired
    if (Date.now() - data.windowStart > RATE_LIMIT_WINDOW_MS) {
      return { usedSeconds: 0, windowStart: Date.now() };
    }
    return data;
  } catch {
    return { usedSeconds: 0, windowStart: Date.now() };
  }
}

function saveUsageData(data: UsageData) {
  if (typeof window === "undefined") return;
  localStorage.setItem("doc_usage", JSON.stringify(data));
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatTimeUntilReset(windowStart: number): string {
  const resetTime = windowStart + RATE_LIMIT_WINDOW_MS;
  const msUntilReset = resetTime - Date.now();
  if (msUntilReset <= 0) return "now";

  const hours = Math.floor(msUntilReset / (60 * 60 * 1000));
  const mins = Math.floor((msUntilReset % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function VoiceAgent() {
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState<"user" | "assistant" | null>(null);
  const [lastCallId, setLastCallId] = useState<string | null>(null);
  const [showPostCallForm, setShowPostCallForm] = useState(false);
  const [featuredQuotes, setFeaturedQuotes] = useState<FeaturedQuote[]>([]);
  const [lastTranscript, setLastTranscript] = useState<string>("");

  // Live feed state
  const [shareMenuOpen, setShareMenuOpen] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Stats state
  const [todayCount, setTodayCount] = useState<number | null>(null);

  // Rate limiting state
  const [usageData, setUsageData] = useState<UsageData>({ usedSeconds: 0, windowStart: Date.now() });
  const [currentCallSeconds, setCurrentCallSeconds] = useState(0);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [showLowTimeWarning, setShowLowTimeWarning] = useState(false);
  const [showTimeLimitMessage, setShowTimeLimitMessage] = useState(false);


  const vapiRef = useRef<Vapi | null>(null);
  const ipAddressRef = useRef<string | null>(null);
  const callStartTimeRef = useRef<number | null>(null);
  const fullTranscriptRef = useRef<string[]>([]);
  const vapiCallIdRef = useRef<string | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch IP address, featured quotes, and check rate limit on mount
  useEffect(() => {
    fetch("/api/ip")
      .then((res) => res.json())
      .then((data) => {
        ipAddressRef.current = data.ip;
      })
      .catch(console.error);

    fetch("/api/featured-quotes")
      .then((res) => res.json())
      .then((data) => {
        if (data.quotes) {
          setFeaturedQuotes(data.quotes);
        }
      })
      .catch(console.error);

    fetch("/api/stats")
      .then((res) => res.json())
      .then((data) => {
        setTodayCount(data.todayCount || 0);
      })
      .catch(console.error);

    // Initialize rate limiting - check backend first, fallback to localStorage
    fetch("/api/rate-limit")
      .then((res) => res.json())
      .then((data) => {
        const usage = {
          usedSeconds: data.usedSeconds || 0,
          windowStart: new Date(data.windowStart).getTime() || Date.now(),
        };
        setUsageData(usage);
        setIsRateLimited(data.isLimited || false);
        saveUsageData(usage); // Sync localStorage with backend
      })
      .catch(() => {
        // Fallback to localStorage
        const usage = getUsageData();
        setUsageData(usage);
        setIsRateLimited(usage.usedSeconds >= RATE_LIMIT_SECONDS);
      });
  }, []);

  // Call timer for rate limiting
  useEffect(() => {
    if (callStatus === "active") {
      callTimerRef.current = setInterval(() => {
        setCurrentCallSeconds((prev) => {
          const newSeconds = prev + 1;
          const totalUsed = usageData.usedSeconds + newSeconds;
          const remainingSeconds = RATE_LIMIT_SECONDS - totalUsed;

          // Update localStorage periodically
          if (newSeconds % 5 === 0) {
            saveUsageData({ ...usageData, usedSeconds: totalUsed });
          }

          // Show warning when 1 minute remaining
          if (remainingSeconds <= 60 && remainingSeconds > 0 && !showLowTimeWarning) {
            setShowLowTimeWarning(true);
          }

          // Check if limit reached
          if (totalUsed >= RATE_LIMIT_SECONDS) {
            // Show time limit message and auto-end call
            setShowTimeLimitMessage(true);
            if (vapiRef.current) {
              vapiRef.current.stop();
            }
          }

          return newSeconds;
        });
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
      // Reset warning when call ends
      setShowLowTimeWarning(false);
    }

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [callStatus, usageData, showLowTimeWarning]);

  // Save call to database
  const saveCallToDatabase = useCallback(async () => {
    const durationSeconds = callStartTimeRef.current
      ? Math.round((Date.now() - callStartTimeRef.current) / 1000)
      : null;

    const transcriptText = fullTranscriptRef.current.join("\n");

    if (!transcriptText) return null;

    const { data, error } = await supabase
      .from("calls")
      .insert({
        transcript: transcriptText,
        duration_seconds: durationSeconds,
        ip_address: ipAddressRef.current,
        vapi_call_id: vapiCallIdRef.current,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to save call:", error);
      return null;
    }

    return data.id;
  }, []);

  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (!publicKey) {
      console.error("Missing NEXT_PUBLIC_VAPI_PUBLIC_KEY");
      return;
    }

    const vapi = new Vapi(publicKey);
    vapiRef.current = vapi;

    vapi.on("call-start", () => {
      setCallStatus("active");
      setTranscript([]);
      fullTranscriptRef.current = [];
      callStartTimeRef.current = Date.now();
    });

    vapi.on("call-end", async () => {
      setCallStatus("idle");
      setCurrentSpeaker(null);

      // Finalize rate limit tracking
      const callDuration = callStartTimeRef.current
        ? Math.round((Date.now() - callStartTimeRef.current) / 1000)
        : 0;

      // Sync to backend
      if (callDuration > 0) {
        fetch("/api/rate-limit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seconds: callDuration }),
        })
          .then((res) => res.json())
          .then((data) => {
            setUsageData((prev) => ({
              usedSeconds: data.usedSeconds || prev.usedSeconds + callDuration,
              windowStart: prev.windowStart,
            }));
            setIsRateLimited(data.isLimited || false);
          })
          .catch(console.error);
      }

      // Also update localStorage
      setUsageData((prev) => {
        const newData = {
          usedSeconds: prev.usedSeconds + callDuration,
          windowStart: prev.windowStart,
        };
        saveUsageData(newData);
        setIsRateLimited(newData.usedSeconds >= RATE_LIMIT_SECONDS);
        return newData;
      });
      setCurrentCallSeconds(0);

      // Save transcript for post-call form
      const transcriptText = fullTranscriptRef.current.join("\n");
      setLastTranscript(transcriptText);

      // Always show the form after a call ends
      setShowPostCallForm(true);

      // Save call to database
      const callId = await saveCallToDatabase();
      if (callId) {
        setLastCallId(callId);

        // Extract quotable quote in background
        const transcriptText = fullTranscriptRef.current.join("\n");
        fetch("/api/extract-quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callId, transcript: transcriptText }),
        }).catch(console.error);

        // Geolocate IP in background
        if (ipAddressRef.current) {
          fetch("/api/geolocate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callId, ipAddress: ipAddressRef.current }),
          }).catch(console.error);
        }
      } else {
        console.warn("Call not saved to database - transcript may be empty or save failed");
      }
    });

    vapi.on("speech-start", () => {
      setCurrentSpeaker("assistant");
    });

    vapi.on("speech-end", () => {
      setCurrentSpeaker(null);
    });

    vapi.on("message", (message) => {
      if (message.type === "transcript") {
        if (message.transcriptType === "final") {
          const speaker = message.role === "user" ? "You" : "Doc";
          const line = `${speaker}: ${message.transcript}`;
          fullTranscriptRef.current.push(line);
          setTranscript((prev) => [...prev.slice(-6), line]);
        }
      }
    });

    vapi.on("error", (error) => {
      console.error("Vapi error:", error);
      setCallStatus("idle");
    });

    return () => {
      vapi.stop();
    };
  }, [saveCallToDatabase]);

  const startCall = useCallback(async () => {
    if (!vapiRef.current) return;

    // Check rate limit before starting
    const usage = getUsageData();
    if (usage.usedSeconds >= RATE_LIMIT_SECONDS) {
      setIsRateLimited(true);
      setUsageData(usage);
      return;
    }

    setCallStatus("connecting");

    try {
      // Use assistant ID if configured, otherwise use inline config
      const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
      console.log("Starting call with assistant ID:", assistantId || "using inline config");

      let call;
      if (assistantId) {
        // Use assistant ID but override with our persona
        call = await vapiRef.current.start(assistantId, {
          model: {
            provider: "openai",
            model: "gpt-4o",
            temperature: 0.9,
            messages: [
              { role: "system", content: PHYSICIAN_THERAPIST_PERSONA }
            ],
          },
          firstMessage: "Hey. Long day? I've got nowhere to be if you need to vent about the latest circle of healthcare hell.",
        } as any);
      } else {
        call = await vapiRef.current.start(VAPI_ASSISTANT_CONFIG as any);
      }
      // Capture call ID from start response
      if (call?.id) {
        vapiCallIdRef.current = call.id;
      }
    } catch (error) {
      console.error("Failed to start call:", error);
      setCallStatus("idle");
    }
  }, []);

  // Share functions
  const getBaseUrl = () => typeof window !== "undefined" ? window.location.origin : "https://doc.meroka.co";
  const getShareUrl = (quoteId: string) => `${getBaseUrl()}/share/${quoteId}`;

  const shareToTwitter = useCallback((quote: FeaturedQuote) => {
    const shareUrl = getShareUrl(quote.id);
    const text = `"${quote.quote.length > 100 ? quote.quote.slice(0, 97) + "..." : quote.quote}"\n\nTalk to Doc:`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "width=550,height=420");
    setShareMenuOpen(null);
  }, []);

  const shareToLinkedIn = useCallback((quote: FeaturedQuote) => {
    const shareUrl = getShareUrl(quote.id);
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "width=550,height=420");
    setShareMenuOpen(null);
  }, []);

  const copyLink = useCallback(async (quote: FeaturedQuote) => {
    const shareUrl = getShareUrl(quote.id);
    await navigator.clipboard.writeText(shareUrl);
    setCopiedId(quote.id);
    setTimeout(() => setCopiedId(null), 2000);
    setShareMenuOpen(null);
  }, []);

  const endCall = useCallback(() => {
    if (!vapiRef.current) return;
    setCallStatus("ending");
    vapiRef.current.stop();
  }, []);

  const toggleMute = useCallback(() => {
    if (!vapiRef.current) return;
    const newMuteState = !isMuted;
    vapiRef.current.setMuted(newMuteState);
    setIsMuted(newMuteState);
  }, [isMuted]);

  // Dismiss time limit message
  const dismissTimeLimitMessage = useCallback(() => {
    setShowTimeLimitMessage(false);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 relative overflow-hidden">
      {/* Animated gradient background - Meroka dark slate */}
      <div className="absolute inset-0 bg-gradient-to-br from-meroka-secondary via-[#0f151d] to-meroka-secondary">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(155,66,15,0.15)_0%,_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(247,245,242,0.05)_0%,_transparent_50%)]" />
      </div>

      {/* Side Quote Feed - hidden on mobile, shown on lg screens */}
      {callStatus === "idle" && featuredQuotes.length > 0 && (
        <div className="hidden lg:flex flex-col fixed right-6 top-1/2 -translate-y-1/2 w-72 max-h-[70vh] z-20">
          <p className="text-gray-500 text-xs mb-3 uppercase tracking-wide">
            What others are saying
          </p>

          <div className="overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
            {featuredQuotes.map((quote) => (
              <div
                key={quote.id}
                className="bg-gray-900/70 backdrop-blur-sm rounded-lg p-4 border border-gray-800"
              >
                <p className="text-gray-300 text-sm italic leading-relaxed">
                  &ldquo;{quote.quote}&rdquo;
                </p>
                <div className="flex items-center justify-between mt-3">
                  <p className="text-gray-500 text-xs">— {quote.location}</p>

                  {/* Share button */}
                  <div className="relative">
                    <button
                      onClick={() => setShareMenuOpen(
                        shareMenuOpen === quote.id ? null : quote.id
                      )}
                      className="p-1.5 rounded-full hover:bg-gray-800 transition-colors text-gray-500 hover:text-gray-300"
                      title="Share this quote"
                    >
                      <Share2 size={14} />
                    </button>

                    {/* Share menu dropdown */}
                    {shareMenuOpen === quote.id && (
                      <div className="absolute right-0 top-8 bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-1 z-20 min-w-[140px]">
                        <button
                          onClick={() => shareToTwitter(quote)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                        >
                          <Twitter size={14} />
                          Twitter/X
                        </button>
                        <button
                          onClick={() => shareToLinkedIn(quote)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                        >
                          <Linkedin size={14} />
                          LinkedIn
                        </button>
                        <button
                          onClick={() => copyLink(quote)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                        >
                          <Link2 size={14} />
                          {copiedId === quote.id ? "Copied!" : "Copy Link"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content container */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="relative inline-block mb-3">
            <svg className="absolute -left-14 top-1/2 -translate-y-1/2 w-10 h-10 text-white" viewBox="0 0 100 100" fill="none">
              <path d="M50 12 L22 70 L35 70 L35 58 L50 58 L50 70 L78 70 Z" fill="currentColor" />
              <path d="M65 28 L82 70 L68 70 Z" fill="currentColor" />
              <path d="M10 64 Q20 64 28 64 L32 58 L38 70 L44 50 L50 78 L56 58 L62 64 Q75 64 90 64" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            <h1 className="text-5xl font-bold text-white tracking-tight">Doc</h1>
            <p className="text-gray-500 text-sm">by <span className="font-medium tracking-tight">Meroka</span></p>
          </div>
          <p className="text-gray-400 text-lg max-w-md leading-relaxed">
            A sardonic AI companion for burnt-out healthcare workers.
            <br />
            <span className="text-gray-500">Vent about the system with someone who gets it.</span>
          </p>
        </div>

        {/* Trust signals */}
        <div className="flex items-center gap-4 mb-6 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Anonymous
          </span>
          <span className="text-gray-700">|</span>
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            No account needed
          </span>
          <span className="text-gray-700">|</span>
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Free
          </span>
        </div>

        {/* Today's venting counter */}
        {todayCount !== null && callStatus === "idle" && (
          <div className="mb-6 px-4 py-2 bg-meroka-primary/20 border border-meroka-primary/30 rounded-full flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <p className="text-meroka-cream text-sm">
              <span className="font-semibold">{(1531 + todayCount).toLocaleString()}</span> healthcare workers vented today
            </p>
          </div>
        )}


      {/* Rate limit indicator */}
      {callStatus === "idle" && !isRateLimited && usageData.usedSeconds > 0 && (
        <div className="flex items-center gap-2 text-gray-500 text-xs mb-4">
          <Clock size={12} />
          <span>{formatTime(RATE_LIMIT_SECONDS - usageData.usedSeconds)} remaining today</span>
        </div>
      )}

      {/* Rate limited message */}
      {isRateLimited && callStatus === "idle" && (
        <div className="w-full max-w-md mb-6 bg-yellow-900/20 border border-yellow-800/50 rounded-lg p-4 text-center">
          <p className="text-yellow-400 text-sm font-medium mb-1">Daily limit reached</p>
          <p className="text-gray-400 text-xs">
            Your time resets in {formatTimeUntilReset(usageData.windowStart)}
          </p>
        </div>
      )}

      {/* Call Button Area */}
      <div className="relative mb-12">
        {/* Pulse rings when active */}
        {callStatus === "active" && (
          <>
            <div className="absolute inset-0 bg-meroka-primary/20 rounded-full pulse-ring"
                 style={{ width: "200px", height: "200px", left: "-30px", top: "-30px" }} />
            <div className="absolute inset-0 bg-meroka-primary/10 rounded-full pulse-ring"
                 style={{ width: "240px", height: "240px", left: "-50px", top: "-50px", animationDelay: "0.5s" }} />
          </>
        )}

        {/* Main call button */}
        <button
          onClick={callStatus === "idle" ? startCall : endCall}
          disabled={callStatus === "connecting" || callStatus === "ending" || isRateLimited}
          className={`
            relative z-10 w-36 h-36 rounded-full flex flex-col items-center justify-center
            transition-all duration-300 transform hover:scale-105
            ${isRateLimited
              ? "bg-gray-700 cursor-not-allowed"
              : callStatus === "idle"
              ? "bg-meroka-primary hover:bg-meroka-primary-hover shadow-lg shadow-meroka-primary/30"
              : callStatus === "active"
              ? "bg-red-600 hover:bg-red-500 shadow-lg shadow-red-500/30"
              : "bg-gray-600 cursor-not-allowed"
            }
          `}
        >
          {callStatus === "idle" && !isRateLimited && <Phone size={48} className="text-white" />}
          {callStatus === "idle" && isRateLimited && (
            <Clock size={48} className="text-gray-400" />
          )}
          {callStatus === "connecting" && (
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          {callStatus === "active" && (
            <>
              <PhoneOff size={36} className="text-white" />
              <span className="text-white text-sm mt-1 font-mono">
                {formatTime(RATE_LIMIT_SECONDS - usageData.usedSeconds - currentCallSeconds)}
              </span>
            </>
          )}
          {callStatus === "ending" && (
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          )}
        </button>
      </div>

      {/* Low time warning */}
      {showLowTimeWarning && callStatus === "active" && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-yellow-900/90 border border-yellow-700 rounded-lg px-4 py-2 z-20 animate-pulse">
          <p className="text-yellow-400 text-sm font-medium">
            Less than 1 minute remaining
          </p>
        </div>
      )}

      {/* Time limit reached message */}
      {showTimeLimitMessage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-meroka-secondary border border-gray-700 rounded-2xl p-8 max-w-sm w-full text-center">
            <div className="text-4xl mb-4">⏰</div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Time&apos;s up for today
            </h2>
            <p className="text-gray-300 mb-2">
              Doc says: &quot;Hey, you&apos;ve used your 7 minutes. Even I need a break from this broken system.&quot;
            </p>
            <p className="text-gray-400 text-sm mb-6">
              Your time resets in {formatTimeUntilReset(usageData.windowStart)}
            </p>
            <button
              onClick={dismissTimeLimitMessage}
              className="py-3 px-6 bg-meroka-primary hover:bg-meroka-primary-hover text-white font-medium rounded-lg transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Status text */}
      <div className="text-center mb-8">
        {callStatus === "idle" && !isRateLimited && (
          <p className="text-gray-400">Tap to start venting</p>
        )}
        {callStatus === "idle" && isRateLimited && (
          <p className="text-gray-500">Come back later for more venting</p>
        )}
        {callStatus === "connecting" && (
          <p className="text-yellow-400">Connecting to Doc...</p>
        )}
        {callStatus === "active" && (
          <div className="flex items-center gap-2 text-meroka-cream">
            {currentSpeaker === "assistant" ? (
              <>
                <span>Doc is talking</span>
                <div className="flex items-center gap-1 h-8">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-meroka-primary rounded-full waveform-bar"
                      style={{ height: "8px" }}
                    />
                  ))}
                </div>
              </>
            ) : (
              <span>Listening...</span>
            )}
          </div>
        )}
        {callStatus === "ending" && (
          <p className="text-gray-400">Ending call...</p>
        )}
      </div>

      {/* Mute button (only when active) */}
      {callStatus === "active" && (
        <button
          onClick={toggleMute}
          className={`
            p-4 rounded-full transition-all duration-200
            ${isMuted
              ? "bg-red-600/20 text-red-400 hover:bg-red-600/30"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }
          `}
        >
          {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
      )}

      {/* Transcript (recent messages) */}
      {transcript.length > 0 && (
        <div className="mt-12 w-full max-w-lg">
          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-3">Recent</p>
            <div className="space-y-2">
              {transcript.map((line, i) => (
                <p
                  key={i}
                  className={`text-sm ${
                    line.startsWith("You:") ? "text-blue-400" : "text-gray-300"
                  }`}
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>{/* End content container */}

      {/* Footer disclaimer */}
      <div className="fixed bottom-4 text-center text-gray-600 text-xs">
        <p>Not a real therapist. For entertainment and venting purposes only.</p>
        <div className="flex items-center justify-center gap-3 mt-2">
          <a href="/privacy" className="hover:text-gray-400 transition-colors underline">
            Privacy Policy
          </a>
          <span className="text-gray-700">|</span>
          <a
            href="https://www.meroka.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-gray-400 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 100 100" fill="none">
              <path d="M50 12 L22 70 L35 70 L35 58 L50 58 L50 70 L78 70 Z" fill="currentColor" />
              <path d="M65 28 L82 70 L68 70 Z" fill="currentColor" />
              <path d="M10 64 Q20 64 28 64 L32 58 L38 70 L44 50 L50 78 L56 58 L62 64 Q75 64 90 64" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            <span className="font-medium tracking-tight">Meroka</span>
          </a>
        </div>
      </div>

      {/* Post-call form */}
      {showPostCallForm && (
        <PostCallForm
          callId={lastCallId}
          transcript={lastTranscript}
          onComplete={() => {
            setShowPostCallForm(false);
            setLastCallId(null);
            setTranscript([]);
            setLastTranscript("");
          }}
        />
      )}
    </div>
  );
}
