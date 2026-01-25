"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Room, RoomEvent, Track, RemoteParticipant, RemoteTrack, RemoteTrackPublication } from "livekit-client";
import { Mic, MicOff, Phone, PhoneOff, Share2, Link2, Clock, Send, Stethoscope } from "lucide-react";
import { useSession } from "next-auth/react";
import { supabase } from "@/lib/supabase";
import { trackClick } from "@/lib/trackClick";
import PostCallForm from "./PostCallForm";
import UserAuthButton from "./UserAuthButton";
import ConversationSidebar from "./ConversationSidebar";
import SignUpPrompt from "./SignUpPrompt";
import type { TranscriptEntry } from "@/types/database";

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
  const router = useRouter();
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
  const [shareMenuPos, setShareMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [shareMenuSource, setShareMenuSource] = useState<"sidebar" | "mobile">("sidebar");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Stats state
  const [todayCount, setTodayCount] = useState<number | null>(null);

  // Rate limiting state
  const [usageData, setUsageData] = useState<UsageData>({ usedSeconds: 0, windowStart: Date.now() });
  const [currentCallSeconds, setCurrentCallSeconds] = useState(0);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [showLowTimeWarning, setShowLowTimeWarning] = useState(false);
  const [showTimeLimitMessage, setShowTimeLimitMessage] = useState(false);

  // Text confession state
  const [confessionText, setConfessionText] = useState("");
  const [isSubmittingConfession, setIsSubmittingConfession] = useState(false);
  const [confessionError, setConfessionError] = useState<string | null>(null);

  // Sign-up prompt state (for anonymous users after first conversation)
  const [showSignUpPrompt, setShowSignUpPrompt] = useState(false);

  // Track if user already completed form this session (to avoid asking twice)
  const hasCompletedFormRef = useRef(false);
  const hasShownSignUpPromptRef = useRef(false);

  // Auth state - using NextAuth
  const { data: session } = useSession();
  const user = session?.user;
  const userId = (session as any)?.userId as string | undefined;

  const roomRef = useRef<Room | null>(null);
  const ipAddressRef = useRef<string | null>(null);
  const callStartTimeRef = useRef<number | null>(null);
  const fullTranscriptRef = useRef<string[]>([]);
  const livekitRoomNameRef = useRef<string | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Timestamped transcript entries for video clip feature
  const timestampedTranscriptRef = useRef<TranscriptEntry[]>([]);

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
            if (roomRef.current) {
              roomRef.current.disconnect();
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

    // Get timestamped transcript for video clip feature
    const transcriptObject = timestampedTranscriptRef.current.length > 0
      ? timestampedTranscriptRef.current
      : null;

    const { data, error } = await supabase
      .from("calls")
      .insert({
        transcript: transcriptText,
        transcript_object: transcriptObject,
        duration_seconds: durationSeconds,
        ip_address: ipAddressRef.current,
        livekit_room_name: livekitRoomNameRef.current,
        user_id: userId || null, // Link to user if logged in
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to save call:", error);
      return null;
    }

    return data.id;
  }, [user]);

  // Handle call end logic
  const handleCallEnd = useCallback(async () => {
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

    // Show the form after a call ends (only if not already completed this session)
    if (!hasCompletedFormRef.current) {
      setShowPostCallForm(true);
    }

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

      // Generate AI summary for logged-in users (in background)
      if (userId) {
        fetch("/api/generate-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callId,
            userId,
            transcript: transcriptText,
          }),
        }).catch(console.error);
      }
    } else {
      console.warn("Call not saved to database - transcript may be empty or save failed");
    }
  }, [saveCallToDatabase, userId]);

  // Cleanup room on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
    };
  }, []);

  // Close share menu on scroll
  useEffect(() => {
    if (!shareMenuOpen) return;

    const handleScroll = () => {
      setShareMenuOpen(null);
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [shareMenuOpen]);

  const startCall = useCallback(async () => {
    // Check rate limit before starting
    const usage = getUsageData();
    if (usage.usedSeconds >= RATE_LIMIT_SECONDS) {
      setIsRateLimited(true);
      setUsageData(usage);
      return;
    }

    setCallStatus("connecting");

    try {
      // Get LiveKit token from backend
      const response = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId: userId || `anon-${Date.now()}`,
          userName: user?.name || 'User',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get token');
      }

      const { token, roomName, url } = await response.json();

      if (!token || !url) {
        throw new Error('No token or URL received');
      }

      livekitRoomNameRef.current = roomName;

      // Create and connect to LiveKit room
      const room = new Room();
      roomRef.current = room;

      // Set up event listeners
      room.on(RoomEvent.Connected, () => {
        console.log("Connected to LiveKit room:", roomName);
        setCallStatus("active");
        setTranscript([]);
        fullTranscriptRef.current = [];
        timestampedTranscriptRef.current = []; // Reset timestamped transcript
        callStartTimeRef.current = Date.now();
      });

      room.on(RoomEvent.Disconnected, () => {
        console.log("Disconnected from LiveKit room");
        handleCallEnd();
      });

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          // Attach audio track to play agent's voice
          const audioElement = track.attach();
          audioElement.id = 'agent-audio';
          document.body.appendChild(audioElement);
          setCurrentSpeaker("assistant");
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          track.detach().forEach((el) => el.remove());
          setCurrentSpeaker(null);
        }
      });

      room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
        // Handle transcript data from agent
        try {
          const data = JSON.parse(new TextDecoder().decode(payload));

          if (data.type === 'transcript' && data.text) {
            // Store timestamped entry for video clip feature
            const entry: TranscriptEntry = {
              speaker: data.speaker as 'user' | 'agent',
              text: data.text,
              startSeconds: data.startSeconds ?? 0,
              endSeconds: data.endSeconds ?? 0,
            };
            timestampedTranscriptRef.current.push(entry);

            // Update display transcript
            const speaker = data.speaker === 'agent' ? 'Doc' : 'You';
            const formattedLine = `${speaker}: ${data.text}`;
            if (!fullTranscriptRef.current.includes(formattedLine)) {
              fullTranscriptRef.current.push(formattedLine);
              setTranscript((prev) => [...prev.slice(-6), formattedLine]);
            }
          } else if (data.type === 'transcript_complete' && data.entries) {
            // Final transcript from agent on disconnect - use this if we missed any
            console.log("Received complete transcript with", data.entries.length, "entries");
            if (timestampedTranscriptRef.current.length < data.entries.length) {
              timestampedTranscriptRef.current = data.entries;
            }
          }
        } catch (e) {
          // Ignore non-JSON data
        }
      });

      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        console.log("Agent connected:", participant.identity);
      });

      // Connect to the room
      await room.connect(url, token);

      // Enable microphone
      await room.localParticipant.setMicrophoneEnabled(true);

      console.log("LiveKit call started:", roomName);
    } catch (error) {
      console.error("Failed to start call:", error);
      setCallStatus("idle");
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
    }
  }, [user, handleCallEnd]);

  // Share functions
  const getBaseUrl = () => typeof window !== "undefined" ? window.location.origin : "https://doc.meroka.co";
  const getShareUrl = (quoteId: string) => `${getBaseUrl()}/share/${quoteId}`;

  const shareToTwitter = useCallback((quote: FeaturedQuote, source: "sidebar" | "mobile") => {
    const shareUrl = getShareUrl(quote.id);
    const text = `"${quote.quote.length > 100 ? quote.quote.slice(0, 97) + "..." : quote.quote}"\n\nTalk to Doc:`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
    trackClick(`${source}_quote_twitter`, url);
    window.open(url, "_blank", "width=550,height=420");
    setShareMenuOpen(null);
  }, []);

  const shareToLinkedIn = useCallback((quote: FeaturedQuote, source: "sidebar" | "mobile") => {
    const shareUrl = getShareUrl(quote.id);
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
    trackClick(`${source}_quote_linkedin`, url);
    window.open(url, "_blank", "width=550,height=420");
    setShareMenuOpen(null);
  }, []);

  const copyLink = useCallback(async (quote: FeaturedQuote, source: "sidebar" | "mobile") => {
    const shareUrl = getShareUrl(quote.id);
    trackClick(`${source}_quote_copy`, shareUrl);
    await navigator.clipboard.writeText(shareUrl);
    setCopiedId(quote.id);
    setTimeout(() => setCopiedId(null), 2000);
    setShareMenuOpen(null);
  }, []);

  const endCall = useCallback(() => {
    if (!roomRef.current) return;
    setCallStatus("ending");
    roomRef.current.disconnect();
  }, []);

  const toggleMute = useCallback(async () => {
    if (!roomRef.current) return;
    const newMuteState = !isMuted;
    await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuteState);
    setIsMuted(newMuteState);
  }, [isMuted]);

  // Dismiss time limit message
  const dismissTimeLimitMessage = useCallback(() => {
    setShowTimeLimitMessage(false);
  }, []);

  // Submit text confession
  const submitConfession = useCallback(async () => {
    if (!confessionText.trim() || isSubmittingConfession) return;

    setIsSubmittingConfession(true);
    setConfessionError(null);

    try {
      const response = await fetch("/api/submit-confession", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: confessionText.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setConfessionError(data.error || "Failed to submit. Please try again.");
        setIsSubmittingConfession(false);
        return;
      }

      // Success - show post-call form (only if not already completed this session)
      setLastCallId(data.callId);
      setLastTranscript(confessionText.trim());
      if (!hasCompletedFormRef.current) {
        setShowPostCallForm(true);
      }
      setConfessionText("");
    } catch (error) {
      console.error("Failed to submit confession:", error);
      setConfessionError("Something went wrong. Please try again.");
    }

    setIsSubmittingConfession(false);
  }, [confessionText, isSubmittingConfession]);

  return (
    <div className="flex flex-col items-center min-h-screen p-8 pt-12 pb-24 lg:pb-8 lg:justify-center relative overflow-x-hidden">
      {/* Animated gradient background - Light theme */}
      <div className="fixed inset-0 bg-gradient-to-br from-brand-neutral-50 via-white to-brand-neutral-100 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(154,70,22,0.08)_0%,_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(212,228,244,0.4)_0%,_transparent_50%)]" />
      </div>

      {/* Conversation history sidebar - only for logged in users */}
      <ConversationSidebar />

      {/* User auth button - top right */}
      <div className="fixed top-4 right-4 z-30">
        <UserAuthButton />
      </div>

      {/* Side Quote Feed - hidden on mobile, shown on lg screens */}
      {callStatus === "idle" && featuredQuotes.length > 0 && (
        <div className="hidden lg:flex flex-col fixed right-6 top-1/2 -translate-y-1/2 w-72 max-h-[70vh] z-20">
          <p className="text-brand-navy-600 text-xs mb-3 uppercase tracking-wide">
            What others are saying
          </p>

          <div className="overflow-y-auto space-y-3 pr-2 scrollbar-thin">
            {featuredQuotes.map((quote) => (
              <div
                key={quote.id}
                className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-brand-neutral-100 shadow-sm"
              >
                <p className="text-brand-navy-800 text-sm italic leading-relaxed">
                  &ldquo;{quote.quote}&rdquo;
                </p>
                <div className="flex items-center justify-between mt-3">
                  <p className="text-brand-navy-600 text-xs">— {quote.location}</p>

                  {/* Share button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setShareMenuPos({ x: rect.left - 150, y: rect.top });
                      setShareMenuSource("sidebar");
                      setShareMenuOpen(shareMenuOpen === quote.id ? null : quote.id);
                    }}
                    className="p-1.5 rounded-full hover:bg-brand-neutral-100 transition-colors text-brand-navy-600 hover:text-brand-navy-900"
                    title="Share this quote"
                  >
                    <Share2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Share dropdown - rendered via portal at body level */}
      {shareMenuOpen && shareMenuPos && typeof document !== "undefined" && createPortal(
        <div
          className="fixed bg-white rounded-lg shadow-xl border border-brand-neutral-100 py-1 z-[9999] min-w-[140px]"
          style={{ left: shareMenuPos.x, top: shareMenuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              const quote = featuredQuotes.find(q => q.id === shareMenuOpen);
              if (quote) shareToTwitter(quote, shareMenuSource);
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-brand-navy-800 hover:bg-brand-neutral-100 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            X/Twitter
          </button>
          <button
            onClick={() => {
              const quote = featuredQuotes.find(q => q.id === shareMenuOpen);
              if (quote) shareToLinkedIn(quote, shareMenuSource);
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-brand-navy-800 hover:bg-brand-neutral-100 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            LinkedIn
          </button>
          <button
            onClick={() => {
              const quote = featuredQuotes.find(q => q.id === shareMenuOpen);
              if (quote) copyLink(quote, shareMenuSource);
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-brand-navy-800 hover:bg-brand-neutral-100 transition-colors"
          >
            <Link2 size={14} />
            {copiedId === shareMenuOpen ? "Copied!" : "Copy Link"}
          </button>
        </div>,
        document.body
      )}

      {/* Content container */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="relative inline-block mb-3">
            <svg
              className="absolute -left-14 top-1/2 -translate-y-1/2 w-11 h-11 text-brand-navy-900"
              style={{
                animation: 'stethoscopeIntro 2s ease-out forwards',
                transformOrigin: 'center bottom',
              }}
              viewBox="0 0 64 64"
              fill="none"
            >
              <style>{`
                @keyframes stethoscopeIntro {
                  0% { transform: translateY(-50%) rotate(-12deg) scale(0.9); opacity: 0; }
                  20% { transform: translateY(-50%) rotate(8deg) scale(1.05); opacity: 1; }
                  40% { transform: translateY(-50%) rotate(-5deg) scale(0.98); }
                  60% { transform: translateY(-52%) rotate(3deg) scale(1.02); }
                  80% { transform: translateY(-50%) rotate(-1deg) scale(1); }
                  100% { transform: translateY(-50%) rotate(0deg) scale(1); }
                }
              `}</style>
              {/* Y-shaped tubing */}
              <path
                d="M20 8 Q20 20 28 28 Q32 32 32 40"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M44 8 Q44 20 36 28 Q32 32 32 40"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
              />
              {/* Ear tips */}
              <circle cx="20" cy="6" r="3" fill="currentColor" />
              <circle cx="44" cy="6" r="3" fill="currentColor" />
              {/* Chest piece */}
              <circle cx="32" cy="52" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
              <circle cx="32" cy="52" r="4" fill="currentColor" />
              {/* Connection to chest piece */}
              <line x1="32" y1="40" x2="32" y2="42" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <h1 className="text-5xl font-bold text-brand-navy-900 tracking-tight">Doc</h1>
            <p className="text-brand-navy-600 text-sm">by <a
              href="https://www.meroka.com/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackClick("header_meroka", "https://www.meroka.com/")}
              className="font-medium tracking-tight hover:text-brand-brown transition-colors"
            >Meroka</a></p>
          </div>

          <p className="text-brand-navy-800 text-lg max-w-md leading-relaxed">
            An AI companion for burnt-out healthcare workers.
            <br />
            <span className="text-brand-navy-600">Vent about the system with someone who gets it.</span>
          </p>
        </div>

        {/* Today's venting counter - below tagline */}
        {todayCount !== null && callStatus === "idle" && (
          <div className="mb-6 px-4 py-2 bg-brand-navy-900 border border-brand-navy-600/30 rounded-full flex items-center justify-center gap-2 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <p className="text-white text-sm">
              <span className="font-semibold">{(1531 + todayCount).toLocaleString()}</span> healthcare workers vented today
            </p>
          </div>
        )}


      {/* Rate limit indicator */}
      {callStatus === "idle" && !isRateLimited && usageData.usedSeconds > 0 && (
        <div className="flex items-center gap-2 text-brand-navy-600 text-xs mb-4">
          <Clock size={12} />
          <span>{formatTime(RATE_LIMIT_SECONDS - usageData.usedSeconds)} remaining today</span>
        </div>
      )}

      {/* Rate limited message */}
      {isRateLimited && callStatus === "idle" && (
        <div className="w-full max-w-md mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
          <p className="text-yellow-700 text-sm font-medium mb-1">Daily limit reached</p>
          <p className="text-brand-navy-600 text-xs">
            Your time resets in {formatTimeUntilReset(usageData.windowStart)}
          </p>
        </div>
      )}

      {/* Call Button Area */}
      <div className="relative mb-12">
        {/* Pulse rings when active */}
        {callStatus === "active" && (
          <>
            <div className="absolute inset-0 bg-brand-brown/20 rounded-full pulse-ring"
                 style={{ width: "200px", height: "200px", left: "-30px", top: "-30px" }} />
            <div className="absolute inset-0 bg-brand-brown/10 rounded-full pulse-ring"
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
              ? "bg-brand-navy-300 cursor-not-allowed"
              : callStatus === "idle"
              ? "bg-brand-brown hover:bg-brand-brown-dark shadow-lg shadow-brand-brown/30"
              : callStatus === "active"
              ? "bg-red-600 hover:bg-red-500 shadow-lg shadow-red-500/30"
              : "bg-brand-navy-300 cursor-not-allowed"
            }
          `}
        >
          {callStatus === "idle" && !isRateLimited && <Phone size={48} className="text-white" />}
          {callStatus === "idle" && isRateLimited && (
            <Clock size={48} className="text-brand-navy-600" />
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
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-yellow-50 border border-yellow-300 rounded-lg px-4 py-2 z-20 animate-pulse shadow-lg">
          <p className="text-yellow-700 text-sm font-medium">
            Less than 1 minute remaining
          </p>
        </div>
      )}

      {/* Time limit reached message */}
      {showTimeLimitMessage && (
        <div className="fixed inset-0 bg-brand-navy-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-brand-neutral-100 rounded-2xl p-8 max-w-sm w-full text-center shadow-xl">
            <div className="text-4xl mb-4">⏰</div>
            <h2 className="text-xl font-semibold text-brand-navy-900 mb-2">
              Time&apos;s up for today
            </h2>
            <p className="text-brand-navy-800 mb-2">
              Doc says: &quot;Hey, you&apos;ve used your 7 minutes. Even I need a break from this broken system.&quot;
            </p>
            <p className="text-brand-navy-600 text-sm mb-6">
              Your time resets in {formatTimeUntilReset(usageData.windowStart)}
            </p>
            <button
              onClick={dismissTimeLimitMessage}
              className="py-3 px-6 bg-brand-brown hover:bg-brand-brown-dark text-white font-medium rounded-lg transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Status text */}
      <div className="text-center mb-8">
        {callStatus === "idle" && !isRateLimited && (
          <p className="text-brand-navy-600">Tap to start venting</p>
        )}
        {callStatus === "idle" && isRateLimited && (
          <p className="text-brand-navy-600">Come back later for more venting</p>
        )}
        {callStatus === "connecting" && (
          <p className="text-yellow-600">Connecting to Doc...</p>
        )}
        {callStatus === "active" && (
          <div className="flex items-center gap-2 text-brand-navy-800">
            {currentSpeaker === "assistant" ? (
              <>
                <span>Doc is talking</span>
                <div className="flex items-center gap-1 h-8">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-brand-brown rounded-full waveform-bar"
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
          <p className="text-brand-navy-600">Ending call...</p>
        )}
      </div>

      {/* Trust signals */}
      <div className="flex items-center gap-4 mb-4 text-xs text-brand-navy-600">
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Anonymous
        </span>
        <span className="text-brand-navy-300">|</span>
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          No account needed
        </span>
        <span className="text-brand-navy-300">|</span>
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Free
        </span>
      </div>

      {/* Text confession input bar */}
      {callStatus === "idle" && !isRateLimited && (
        <div className="w-full max-w-lg mb-8 relative z-10">
          <div className="relative flex items-center bg-white/80 backdrop-blur-sm border border-brand-neutral-100 rounded-full px-4 py-2 focus-within:border-brand-navy-300 focus-within:bg-white shadow-sm transition-all">
            <input
              type="text"
              value={confessionText}
              onChange={(e) => setConfessionText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && confessionText.trim().length >= 1 && !isSubmittingConfession) {
                  e.preventDefault();
                  submitConfession();
                }
              }}
              placeholder="I haven't had a real lunch break in three years..."
              className="flex-1 bg-transparent text-brand-navy-900 placeholder-brand-navy-300 text-sm focus:outline-none"
              maxLength={2000}
              disabled={isSubmittingConfession}
            />

            <button
              type="button"
              onClick={() => submitConfession()}
              disabled={confessionText.trim().length < 1 || isSubmittingConfession}
              className={`ml-2 p-2 rounded-full transition-all ${
                confessionText.trim().length >= 1 && !isSubmittingConfession
                  ? "bg-brand-brown hover:bg-brand-brown-dark text-white"
                  : "bg-brand-neutral-100 text-brand-navy-300"
              }`}
            >
              {isSubmittingConfession ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>

          {confessionError && (
            <p className="mt-2 text-red-500 text-sm text-center">{confessionError}</p>
          )}
        </div>
      )}

      {/* Mute button (only when active) */}
      {callStatus === "active" && (
        <button
          onClick={toggleMute}
          className={`
            p-4 rounded-full transition-all duration-200
            ${isMuted
              ? "bg-red-100 text-red-600 hover:bg-red-200"
              : "bg-brand-neutral-100 text-brand-navy-800 hover:bg-brand-neutral-100/80"
            }
          `}
        >
          {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
      )}

      {/* Transcript (recent messages) */}
      {transcript.length > 0 && (
        <div className="mt-12 w-full max-w-lg">
          <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-brand-neutral-100 shadow-sm">
            <p className="text-brand-navy-600 text-xs uppercase tracking-wide mb-3">Recent</p>
            <div className="space-y-2">
              {transcript.map((line, i) => (
                <p
                  key={i}
                  className={`text-sm ${
                    line.startsWith("You:") ? "text-brand-brown" : "text-brand-navy-800"
                  }`}
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Quote Feed - shown only on mobile, hidden on lg screens */}
      {callStatus === "idle" && featuredQuotes.length > 0 && (
        <div className="lg:hidden w-full max-w-md mt-12">
          <p className="text-brand-navy-600 text-xs mb-3 uppercase tracking-wide text-center">
            What others are saying
          </p>
          <div className="space-y-3">
            {featuredQuotes.slice(0, 4).map((quote) => (
              <div
                key={quote.id}
                className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-brand-neutral-100 shadow-sm"
              >
                <p className="text-brand-navy-800 text-sm italic leading-relaxed">
                  &ldquo;{quote.quote}&rdquo;
                </p>
                <div className="flex items-center justify-between mt-3">
                  <p className="text-brand-navy-600 text-xs">— {quote.location}</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setShareMenuPos({ x: Math.max(10, rect.left - 150), y: rect.top - 100 });
                      setShareMenuSource("mobile");
                      setShareMenuOpen(shareMenuOpen === quote.id ? null : quote.id);
                    }}
                    className="p-1.5 rounded-full hover:bg-brand-neutral-100 transition-colors text-brand-navy-600 hover:text-brand-navy-900"
                    title="Share this quote"
                  >
                    <Share2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>{/* End content container */}

      {/* Footer disclaimer */}
      <div className="mt-12 lg:fixed lg:bottom-4 text-center text-brand-navy-600 text-xs relative z-10">
        <p>Not a real therapist. For entertainment and venting purposes only.</p>
        <div className="flex items-center justify-center gap-3 mt-2">
          <a
            href="/privacy"
            onClick={() => trackClick("footer_privacy", "/privacy")}
            className="hover:text-brand-brown transition-colors underline"
          >
            Privacy Policy
          </a>
          <span className="text-brand-navy-300">|</span>
          <a
            href="https://www.meroka.com/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackClick("footer_meroka", "https://www.meroka.com/")}
            className="flex items-center gap-1.5 hover:text-brand-brown transition-colors"
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
            hasCompletedFormRef.current = true;

            // Show sign-up prompt for anonymous users after their first conversation
            if (!session && !hasShownSignUpPromptRef.current) {
              hasShownSignUpPromptRef.current = true;
              // Small delay for smoother UX
              setTimeout(() => setShowSignUpPrompt(true), 500);
            }
          }}
        />
      )}

      {/* Sign-up prompt for anonymous users */}
      {showSignUpPrompt && (
        <SignUpPrompt onClose={() => setShowSignUpPrompt(false)} />
      )}

    </div>
  );
}
