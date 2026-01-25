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
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Utility for cleaner tailwind classes
function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

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
        <div className="flex flex-col items-center min-h-screen p-8 pt-12 pb-24 lg:pb-8 lg:justify-center relative overflow-x-hidden text-brand-navy-900 font-sans selection:bg-brand-ice">
            {/* Animated gradient background - Light theme */}
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

            {/* Conversation history sidebar - only for logged in users */}
            <ConversationSidebar />

            {/* User auth button - top right */}
            <div className="fixed top-4 right-4 z-30">
                <UserAuthButton />
            </div>

            {/* Side Quote Feed - hidden on mobile, shown on lg screens */}
            <AnimatePresence>
                {callStatus === "idle" && featuredQuotes.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="hidden lg:flex flex-col fixed right-6 top-32 w-72 max-h-[70vh] z-20"
                    >
                        <p className="text-brand-navy-400 text-xs mb-3 uppercase tracking-wider font-bold pl-1">
                            Community Voices
                        </p>

                        <div className="overflow-y-auto space-y-4 pr-2 scrollbar-thin py-2">
                            {featuredQuotes.map((quote) => (
                                <motion.div
                                    key={quote.id}
                                    layoutId={quote.id}
                                    className="glass hover:glass-hover glass-dark:hover:bg-white/90 transition-all rounded-xl p-5 shadow-sm group relative"
                                >
                                    <p className="text-brand-navy-800 text-sm italic leading-relaxed text-pretty">
                                        &ldquo;{quote.quote}&rdquo;
                                    </p>
                                    <div className="flex items-center justify-between mt-4 border-t border-brand-navy-300/20 pt-3">
                                        <p className="text-brand-navy-600 text-xs font-medium">— {quote.location}</p>

                                        {/* Share button */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                setShareMenuPos({ x: rect.left - 150, y: rect.top });
                                                setShareMenuSource("sidebar");
                                                setShareMenuOpen(shareMenuOpen === quote.id ? null : quote.id);
                                            }}
                                            className="p-2 rounded-full hover:bg-brand-neutral-100 transition-colors text-brand-navy-400 hover:text-brand-navy-900 opacity-0 group-hover:opacity-100"
                                            title="Share this quote"
                                        >
                                            <Share2 size={14} />
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Share dropdown - rendered via portal at body level */}
            {shareMenuOpen && shareMenuPos && typeof document !== "undefined" && createPortal(
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="fixed glass rounded-xl shadow-glass border border-white/50 py-1.5 z-[9999] min-w-[150px] overflow-hidden"
                    style={{ left: shareMenuPos.x, top: shareMenuPos.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={() => {
                            const quote = featuredQuotes.find(q => q.id === shareMenuOpen);
                            if (quote) shareToTwitter(quote, shareMenuSource);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-brand-navy-700 hover:bg-brand-neutral-100/50 hover:text-brand-navy-900 transition-colors"
                    >
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                        X/Twitter
                    </button>
                    <button
                        onClick={() => {
                            const quote = featuredQuotes.find(q => q.id === shareMenuOpen);
                            if (quote) shareToLinkedIn(quote, shareMenuSource);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-brand-navy-700 hover:bg-brand-neutral-100/50 hover:text-brand-navy-900 transition-colors"
                    >
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                        </svg>
                        LinkedIn
                    </button>
                    <button
                        onClick={() => {
                            const quote = featuredQuotes.find(q => q.id === shareMenuOpen);
                            if (quote) copyLink(quote, shareMenuSource);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-brand-navy-700 hover:bg-brand-neutral-100/50 hover:text-brand-navy-900 transition-colors"
                    >
                        <Link2 size={16} />
                        {copiedId === shareMenuOpen ? "Copied!" : "Copy Link"}
                    </button>
                </motion.div>,
                document.body
            )}

            {/* Content container */}
            <div className="relative z-10 flex flex-col items-center w-full max-w-4xl mx-auto">
                {/* Header */}
                <motion.div
                    className="text-center mb-10"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                >
                    <div className="relative inline-block mb-3">
                        <motion.div
                            className="absolute -left-16 top-3 w-16 h-16"
                            initial={{ scale: 0.8, rotate: -10, y: 5 }}
                            animate={{
                                scale: [0.8, 1.05, 0.98, 1],
                                rotate: [-10, 12, 4, 8],
                                y: [5, -2, 1, 0],
                            }}
                            transition={{
                                duration: 2.5,
                                ease: "easeOut",
                                times: [0, 0.4, 0.7, 1],
                            }}
                        >
                            <img
                                src="/doc-logo-playful-2.svg"
                                alt="Doc Logo"
                                className="w-full h-full object-contain drop-shadow-sm"
                            />
                        </motion.div>
                        <h1 className="text-6xl font-bold text-brand-navy-900 tracking-tighter drop-shadow-sm">Doc</h1>
                        <p className="text-brand-navy-500 text-sm font-medium tracking-wide">by <a
                            href="https://www.meroka.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => trackClick("header_meroka", "https://www.meroka.com/")}
                            className="hover:text-brand-brown transition-colors underline decoration-brand-brown/30 underline-offset-2 tracking-tight"
                        >Meroka</a></p>
                    </div>

                    <p className="text-brand-navy-700 text-xl max-w-lg leading-relaxed mx-auto font-light">
                        The AI companion for burnt-out healthcare workers.
                        <br />
                        <span className="text-brand-navy-900 font-normal">Vent about the system with someone who gets it.</span>
                    </p>
                </motion.div>

                {/* Today's venting counter - below tagline */}
                <AnimatePresence>
                    {todayCount !== null && callStatus === "idle" && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="mb-8 px-5 py-2 glass rounded-full flex items-center justify-center gap-3 shadow-glass"
                        >
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500 shadow-sm"></span>
                            </span>
                            <p className="text-brand-navy-800 text-sm font-medium">
                                <span className="font-bold text-brand-navy-900">{(1531 + todayCount).toLocaleString()}</span> healthcare workers vented today
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>


                {/* Rate limit indicator */}
                {callStatus === "idle" && !isRateLimited && usageData.usedSeconds > 0 && (
                    <div className="flex items-center gap-2 text-brand-navy-500 text-xs mb-6 font-medium bg-brand-navy-50/50 px-3 py-1 rounded-full">
                        <Clock size={12} />
                        <span>{formatTime(RATE_LIMIT_SECONDS - usageData.usedSeconds)} remaining today</span>
                    </div>
                )}

                {/* Rate limited message */}
                {isRateLimited && callStatus === "idle" && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full max-w-md mb-8 bg-amber-50/80 backdrop-blur-sm border border-amber-200/60 rounded-xl p-5 text-center shadow-sm"
                    >
                        <p className="text-amber-800 text-sm font-semibold mb-1">Daily limit reached</p>
                        <p className="text-amber-700/80 text-xs">
                            Your time resets in {formatTimeUntilReset(usageData.windowStart)}
                        </p>
                    </motion.div>
                )}

                {/* Call Button Area */}
                <div className="relative mb-16 mt-4">
                    {/* Animated rings when active */}
                    <AnimatePresence>
                        {callStatus === "active" && (
                            <>
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 0.2, scale: 1.5 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                    className="absolute inset-0 bg-brand-brown rounded-full -z-10"
                                />
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 0.1, scale: 1.8 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                                    className="absolute inset-0 bg-brand-brown rounded-full -z-20"
                                />
                            </>
                        )}
                    </AnimatePresence>

                    {/* Main call button */}
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={callStatus === "idle" ? startCall : endCall}
                        disabled={callStatus === "connecting" || callStatus === "ending" || isRateLimited}
                        className={cn(
                            "relative z-10 w-40 h-40 rounded-full flex flex-col items-center justify-center transition-all duration-500 shadow-2xl",
                            isRateLimited
                                ? "bg-brand-navy-200 cursor-not-allowed text-brand-navy-400"
                                : callStatus === "idle"
                                    ? "bg-gradient-to-br from-brand-brown-light to-brand-brown text-white shadow-brand-brown/40 border-4 border-white/20"
                                    : callStatus === "active"
                                        ? "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-red-500/40 border-4 border-red-400/30"
                                        : "bg-brand-navy-200 cursor-not-allowed"
                        )}
                    >
                        <AnimatePresence mode="wait">
                            {callStatus === "idle" && !isRateLimited && (
                                <motion.div
                                    key="idle"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                >
                                    <Phone size={48} strokeWidth={1.5} />
                                </motion.div>
                            )}
                            {callStatus === "idle" && isRateLimited && (
                                <motion.div
                                    key="limited"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                >
                                    <Clock size={48} strokeWidth={1.5} />
                                </motion.div>
                            )}
                            {callStatus === "connecting" && (
                                <motion.div
                                    key="connecting"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 border-4 border-white/30 border-t-white rounded-full animate-spin"
                                />
                            )}
                            {callStatus === "active" && (
                                <motion.div
                                    key="active"
                                    initial={{ opacity: 0, scale: 0.5 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.5 }}
                                    className="flex flex-col items-center"
                                >
                                    <PhoneOff size={32} strokeWidth={1.5} />
                                    <span className="text-xs mt-2 font-medium tracking-widest opacity-90 font-mono">
                                        {formatTime(RATE_LIMIT_SECONDS - usageData.usedSeconds - currentCallSeconds)}
                                    </span>
                                </motion.div>
                            )}
                            {callStatus === "ending" && (
                                <motion.div
                                    key="ending"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 border-4 border-white/30 border-t-white rounded-full animate-spin"
                                />
                            )}
                        </AnimatePresence>
                    </motion.button>
                </div>

                {/* Low time warning */}
                <AnimatePresence>
                    {showLowTimeWarning && callStatus === "active" && (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="absolute top-24 left-1/2 -translate-x-1/2 bg-amber-100/90 backdrop-blur border border-amber-200 text-amber-800 px-4 py-1.5 rounded-full text-xs font-semibold shadow-lg z-20 whitespace-nowrap"
                        >
                            Less than 1 minute remaining
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Time limit reached message modal */}
                <AnimatePresence>
                    {showTimeLimitMessage && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-brand-navy-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50"
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl border border-white/50"
                            >
                                <div className="text-5xl mb-4">⏰</div>
                                <h2 className="text-xl font-bold text-brand-navy-900 mb-2">
                                    Time&apos;s up for today
                                </h2>
                                <p className="text-brand-navy-600 mb-6 leading-relaxed">
                                    Doc says: &quot;Hey, you&apos;ve used your 7 minutes. Even I need a break from this broken system.&quot;
                                </p>
                                <div className="bg-brand-navy-50 rounded-lg p-3 mb-6">
                                    <p className="text-brand-navy-500 text-xs font-medium uppercase tracking-wide">Resets in</p>
                                    <p className="text-brand-navy-800 font-mono text-lg font-bold">{formatTimeUntilReset(usageData.windowStart)}</p>
                                </div>
                                <button
                                    onClick={dismissTimeLimitMessage}
                                    className="w-full py-3 px-6 bg-brand-brown hover:bg-brand-brown-dark text-white font-medium rounded-xl transition-colors shadow-lg shadow-brand-brown/20"
                                >
                                    Got it
                                </button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Status text */}
                <div className="text-center h-8 mb-10">
                    <AnimatePresence mode="wait">
                        {callStatus === "idle" && !isRateLimited && (
                            <motion.p key="start" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-brand-navy-500 text-lg font-medium">
                                Tap to start venting
                            </motion.p>
                        )}
                        {callStatus === "idle" && isRateLimited && (
                            <motion.p key="limited" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-brand-navy-400 font-medium">
                                Come back later for more venting
                            </motion.p>
                        )}
                        {callStatus === "connecting" && (
                            <motion.p key="connecting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-brand-brown font-medium animate-pulse">
                                Connecting to Doc...
                            </motion.p>
                        )}
                        {callStatus === "active" && (
                            <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-3 text-brand-navy-800">
                                {currentSpeaker === "assistant" ? (
                                    <>
                                        <span className="font-semibold text-brand-brown">Doc is talking</span>
                                        <div className="flex items-center gap-1 h-4">
                                            {[...Array(4)].map((_, i) => (
                                                <motion.div
                                                    key={i}
                                                    className="w-1 bg-brand-brown rounded-full"
                                                    animate={{ height: [4, 16, 4] }}
                                                    transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                                                />
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <span className="text-brand-navy-400 font-medium animate-pulse">Listening...</span>
                                )}
                            </motion.div>
                        )}
                        {callStatus === "ending" && (
                            <motion.p key="ending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-brand-navy-400">
                                Ending call...
                            </motion.p>
                        )}
                    </AnimatePresence>
                </div>

                {/* Trust signals */}
                <div className="flex items-center gap-6 mb-8 text-xs font-medium text-brand-navy-400 uppercase tracking-widest">
                    <span className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Anonymous
                    </span>
                    <span className="w-1 h-1 rounded-full bg-brand-navy-200"></span>
                    <span className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        No account needed
                    </span>
                    <span className="w-1 h-1 rounded-full bg-brand-navy-200"></span>
                    <span className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Free
                    </span>
                </div>

                {/* Text confession input bar */}
                {callStatus === "idle" && !isRateLimited && (
                    <motion.div
                        className="w-full max-w-lg mb-8 relative z-10"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                    >
                        <div className="relative flex items-center bg-white/60 backdrop-blur-md border border-brand-neutral-200 rounded-full px-2 py-2 focus-within:border-brand-brown/50 focus-within:bg-white focus-within:shadow-glass hover:shadow-glass transition-all duration-300">
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
                                placeholder={'Or just type: "I haven\'t had a real lunch break in three years..."'}
                                className="flex-1 bg-transparent text-brand-navy-900 placeholder-brand-navy-400 text-sm px-4 focus:outline-none"
                                maxLength={2000}
                                disabled={isSubmittingConfession}
                            />

                            <button
                                type="button"
                                onClick={() => submitConfession()}
                                disabled={confessionText.trim().length < 1 || isSubmittingConfession}
                                className={cn(
                                    "p-2.5 rounded-full transition-all duration-300",
                                    confessionText.trim().length >= 1 && !isSubmittingConfession
                                        ? "bg-brand-brown hover:bg-brand-brown-dark text-white shadow-md transform hover:scale-105"
                                        : "bg-brand-neutral-100 text-brand-navy-300 cursor-not-allowed"
                                )}
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
                    </motion.div>
                )}

                {/* Mute button (only when active) */}
                <AnimatePresence>
                    {callStatus === "active" && (
                        <motion.button
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            onClick={toggleMute}
                            className={cn(
                                "p-4 rounded-full transition-all duration-200 shadow-sm border",
                                isMuted
                                    ? "bg-red-50 border-red-100 text-red-500 hover:bg-red-100"
                                    : "bg-white border-brand-neutral-200 text-brand-navy-600 hover:bg-brand-neutral-50 hover:text-brand-navy-900"
                            )}
                        >
                            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                        </motion.button>
                    )}
                </AnimatePresence>

                {/* Transcript (recent messages) */}
                <AnimatePresence>
                    {transcript.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-12 w-full max-w-lg mb-20"
                        >
                            <div className="glass rounded-2xl p-6 shadow-glass">
                                <p className="text-brand-navy-400 text-xs font-bold uppercase tracking-wider mb-4">Live Transcript</p>
                                <div className="space-y-3">
                                    {transcript.map((line, i) => (
                                        <motion.p
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            key={i}
                                            className={cn(
                                                "text-sm leading-relaxed",
                                                line.startsWith("You:") ? "text-brand-brown font-medium" : "text-brand-navy-700"
                                            )}
                                        >
                                            {line}
                                        </motion.p>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Mobile Quote Feed - shown only on mobile, hidden on lg screens */}
                {callStatus === "idle" && featuredQuotes.length > 0 && (
                    <div className="lg:hidden w-full max-w-md mt-12 mb-20">
                        <p className="text-brand-navy-400 text-xs mb-4 uppercase tracking-wider font-bold text-center">
                            Community Voices
                        </p>
                        <div className="space-y-4 px-4">
                            {featuredQuotes.slice(0, 4).map((quote) => (
                                <div
                                    key={quote.id}
                                    className="glass rounded-xl p-5 shadow-sm"
                                >
                                    <p className="text-brand-navy-800 text-sm italic leading-relaxed">
                                        &ldquo;{quote.quote}&rdquo;
                                    </p>
                                    <div className="flex items-center justify-between mt-3 border-t border-brand-navy-300/20 pt-3">
                                        <p className="text-brand-navy-500 text-xs font-medium">— {quote.location}</p>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                // Adjust position for mobile
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                setShareMenuPos({ x: Math.min(window.innerWidth - 160, Math.max(10, rect.left - 100)), y: rect.top - 80 });
                                                setShareMenuSource("mobile");
                                                setShareMenuOpen(shareMenuOpen === quote.id ? null : quote.id);
                                            }}
                                            className="p-2 rounded-full hover:bg-brand-neutral-100 transition-colors text-brand-navy-400 hover:text-brand-navy-900"
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
            <div className="mt-8 lg:fixed lg:bottom-4 text-center text-brand-navy-400 text-xs relative z-10 w-full">
                <p>Not a real therapist. For entertainment and venting purposes only.</p>
                <div className="flex items-center justify-center gap-3 mt-2">
                    <a
                        href="/privacy"
                        onClick={() => trackClick("footer_privacy", "/privacy")}
                        className="hover:text-brand-brown transition-colors underline decoration-transparent hover:decoration-brand-brown"
                    >
                        Privacy Policy
                    </a>
                    <span className="text-brand-navy-200">|</span>
                    <a
                        href="https://www.meroka.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => trackClick("footer_meroka", "https://www.meroka.com/")}
                        className="flex items-center gap-1.5 hover:text-brand-brown transition-colors group"
                    >
                        <svg className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" viewBox="0 0 100 100" fill="none">
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
        </div>);
}
