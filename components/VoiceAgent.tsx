"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Room, RoomEvent, Track, RemoteParticipant, RemoteTrack, RemoteTrackPublication } from "livekit-client";
import { Mic, MicOff, PhoneOff, Share2, Link2, Clock, Send } from "lucide-react";
import { useSession } from "next-auth/react";
import { supabase } from "@/lib/supabase";
import { trackClick } from "@/lib/trackClick";
import { trackLinkedInConversion } from "@/lib/linkedin";
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

    // Chat state
    const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
    const [isChatMode, setIsChatMode] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);

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
    const callIdRef = useRef<string | null>(null); // Store call ID created at start

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

    // Create call record when call starts (so webhook can find it)
    const createCallRecord = useCallback(async (roomName: string) => {
        const { data, error } = await supabase
            .from("calls")
            .insert({
                livekit_room_name: roomName,
                user_id: userId || null,
                ip_address: ipAddressRef.current,
            })
            .select("id")
            .single();

        if (error) {
            console.error("Failed to create call record:", error);
            return null;
        }

        console.log("Call record created with id:", data.id);
        return data.id;
    }, [userId]);

    // Update call record when call ends with transcript and duration
    // Uses server-side API to bypass Supabase RLS
    const updateCallRecord = useCallback(async () => {
        if (!callIdRef.current) {
            console.warn("No call ID to update");
            return null;
        }

        const durationSeconds = callStartTimeRef.current
            ? Math.round((Date.now() - callStartTimeRef.current) / 1000)
            : null;

        const transcriptText = fullTranscriptRef.current.join("\n");
        console.log("Updating call record via API:", {
            callId: callIdRef.current,
            durationSeconds,
            transcriptLength: transcriptText.length,
            transcriptLines: fullTranscriptRef.current.length,
            timestampedEntries: timestampedTranscriptRef.current.length,
        });

        // Get timestamped transcript for video clip feature
        const transcriptObject = timestampedTranscriptRef.current.length > 0
            ? timestampedTranscriptRef.current
            : null;

        try {
            const response = await fetch("/api/calls/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    callId: callIdRef.current,
                    transcript: transcriptText,
                    transcriptObject,
                    durationSeconds,
                }),
                keepalive: true, // Ensures request completes even if page is closing
            });

            const result = await response.json();

            if (!response.ok) {
                console.error("Failed to update call:", result.error);
                return null;
            }

            console.log("Call record updated successfully:", result.data);
            return callIdRef.current;
        } catch (error) {
            console.error("Failed to update call:", error);
            return null;
        }
    }, []);

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
                keepalive: true, // Ensures request completes even if page is closing
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

        // Update call record with transcript and duration
        const callId = await updateCallRecord();
        if (callId) {
            setLastCallId(callId);

            // Show the form after a call ends (only if not already completed this session)
            // Must happen AFTER setLastCallId so the form has the correct callId
            if (!hasCompletedFormRef.current) {
                setShowPostCallForm(true);
            }

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
            console.warn("Call update failed - call record may not exist");
            // Still show form for lead collection (clips won't work without callId)
            if (!hasCompletedFormRef.current) {
                setShowPostCallForm(true);
            }
        }

        // Reset call ID ref
        callIdRef.current = null;
    }, [updateCallRecord, userId]);

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

        // Track LinkedIn conversion (fire-and-forget, non-blocking)
        trackLinkedInConversion({ eventType: "call_started" });

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

            // Create call record immediately so webhook can find it
            const callId = await createCallRecord(roomName);
            if (callId) {
                callIdRef.current = callId;
            }

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
                    audioElement.autoplay = true;
                    (audioElement as any).playsInline = true; // For iOS compatibility
                    document.body.appendChild(audioElement);
                    // Explicitly play (needed for some browsers)
                    audioElement.play().catch((err) => {
                        console.warn("Audio autoplay blocked:", err);
                    });
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
                    console.log("DataReceived:", data.type, data);

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
    }, [user, userId, handleCallEnd, createCallRecord]);

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

    // Send chat message
    const sendChatMessage = useCallback(async () => {
        if (!confessionText.trim() || isSubmittingConfession) return;

        const userMessage = confessionText.trim();
        setConfessionText("");
        setIsSubmittingConfession(true);
        setConfessionError(null);

        // Enter chat mode and add user message
        setIsChatMode(true);
        setChatMessages((prev) => [...prev, { role: "user", content: userMessage }]);

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: chatMessages,
                    message: userMessage,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setConfessionError(data.error || "Failed to get response. Please try again.");
                setIsSubmittingConfession(false);
                return;
            }

            // Add Doc's response to chat
            setChatMessages((prev) => [...prev, { role: "assistant", content: data.response }]);

            // Scroll to bottom of chat
            setTimeout(() => {
                chatContainerRef.current?.scrollTo({
                    top: chatContainerRef.current.scrollHeight,
                    behavior: "smooth",
                });
            }, 100);
        } catch (error) {
            console.error("Failed to send message:", error);
            setConfessionError("Something went wrong. Please try again.");
        }

        setIsSubmittingConfession(false);
    }, [confessionText, isSubmittingConfession, chatMessages]);

    // End chat and show post-call form
    const endChat = useCallback(async () => {
        if (chatMessages.length === 0) {
            setIsChatMode(false);
            return;
        }

        // Save the chat transcript
        const transcript = chatMessages
            .map((msg) => `${msg.role === "user" ? "You" : "Doc"}: ${msg.content}`)
            .join("\n");

        try {
            const response = await fetch("/api/submit-confession", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: transcript }),
            });

            const data = await response.json();

            if (response.ok) {
                setLastCallId(data.callId);
                setLastTranscript(transcript);
                if (!hasCompletedFormRef.current) {
                    setShowPostCallForm(true);
                }
            }
        } catch (error) {
            console.error("Failed to save chat:", error);
        }

        // Reset chat state
        setChatMessages([]);
        setIsChatMode(false);
    }, [chatMessages]);

    return (
        <div className="flex flex-col items-center min-h-screen p-8 pt-12 relative overflow-x-hidden text-brand-navy-900 font-sans selection:bg-brand-ice">
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

            {/* Conversation history sidebar - TEMPORARILY DISABLED
            <ConversationSidebar />
            */}

            {/* User auth button - TEMPORARILY DISABLED
            <div className="fixed top-4 right-4 z-30">
                <UserAuthButton />
            </div>
            */}

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
            <div className="relative z-10 flex flex-col items-center justify-center flex-grow w-full max-w-4xl mx-auto py-8">
                {/* Header - Simple headline (hidden in chat mode) */}
                {!isChatMode && (
                    <motion.div
                        className="text-center mb-8"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                    >
                        <h1 className="text-4xl md:text-5xl font-bold text-brand-navy-900 tracking-tight">
                            Ready when you are.
                        </h1>
                        <p className="text-brand-navy-500 text-lg mt-3 font-light">
                            Your AI companion for venting about healthcare.
                        </p>
                    </motion.div>
                )}

                {/* Chat mode header - minimal */}
                {isChatMode && (
                    <div className="text-center mb-4">
                        <p className="text-brand-navy-500 text-sm font-medium">Chatting with Doc</p>
                    </div>
                )}

                {/* Today's venting counter - below tagline (hidden in chat mode) */}
                <AnimatePresence>
                    {todayCount !== null && callStatus === "idle" && !isChatMode && (
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


                {/* Rate limit indicator (hidden in chat mode) */}
                {callStatus === "idle" && !isRateLimited && usageData.usedSeconds > 0 && !isChatMode && (
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


                {/* Chat Messages Display - ChatGPT style (messages above, scrollable) */}
                {isChatMode && callStatus === "idle" && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="w-full max-w-2xl mx-auto flex-1 flex flex-col min-h-0 mb-4"
                    >
                        {/* Scrollable messages area */}
                        <div
                            ref={chatContainerRef}
                            className="flex-1 overflow-y-auto px-2 py-4 space-y-4 min-h-[200px] max-h-[50vh]"
                        >
                            {chatMessages.map((msg, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={cn(
                                        "flex",
                                        msg.role === "user" ? "justify-end" : "justify-start"
                                    )}
                                >
                                    <div
                                        className={cn(
                                            "max-w-[85%] rounded-2xl px-4 py-3",
                                            msg.role === "user"
                                                ? "bg-brand-brown text-white rounded-br-sm"
                                                : "bg-white/80 backdrop-blur-sm border border-brand-neutral-200 text-brand-navy-800 rounded-bl-sm shadow-sm"
                                        )}
                                    >
                                        {msg.role === "assistant" && (
                                            <p className="text-xs text-brand-brown font-medium mb-1">Doc</p>
                                        )}
                                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                    </div>
                                </motion.div>
                            ))}
                            {isSubmittingConfession && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex justify-start"
                                >
                                    <div className="bg-white/80 backdrop-blur-sm border border-brand-neutral-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                                        <p className="text-xs text-brand-brown font-medium mb-1">Doc</p>
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-2 h-2 bg-brand-navy-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                            <div className="w-2 h-2 bg-brand-navy-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                            <div className="w-2 h-2 bg-brand-navy-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    </motion.div>
                )}

                {/* Unified Input Bar - ChatGPT style */}
                <AnimatePresence mode="wait">
                    {callStatus === "idle" && !isRateLimited && (
                        <motion.div
                            key="idle-input"
                            className="w-full max-w-2xl mx-auto mb-6"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3 }}
                        >
                            <div className="relative flex items-center bg-white/80 backdrop-blur-md border border-brand-neutral-200 rounded-2xl px-4 py-3 focus-within:border-brand-brown/50 focus-within:shadow-lg transition-all">
                                {/* Text Input */}
                                <input
                                    type="text"
                                    placeholder={isChatMode ? "Reply to Doc..." : "What's on your mind?"}
                                    className="flex-1 bg-transparent outline-none text-brand-navy-900 placeholder-brand-navy-400 text-base"
                                    value={confessionText}
                                    onChange={(e) => setConfessionText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey && confessionText.trim().length >= 1 && !isSubmittingConfession) {
                                            e.preventDefault();
                                            sendChatMessage();
                                        }
                                    }}
                                    maxLength={2000}
                                    disabled={isSubmittingConfession}
                                />

                                {/* Send button - visible when text is entered */}
                                {confessionText.trim().length > 0 && (
                                    <button
                                        onClick={sendChatMessage}
                                        disabled={isSubmittingConfession}
                                        className="p-2 hover:bg-brand-neutral-100 rounded-full transition-colors mr-1"
                                        title="Send message"
                                    >
                                        {isSubmittingConfession ? (
                                            <div className="w-5 h-5 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
                                        ) : (
                                            <Send size={20} className="text-brand-navy-500 hover:text-brand-brown" />
                                        )}
                                    </button>
                                )}

                                {/* Voice Button - Primary CTA (hide during chat mode) */}
                                {!isChatMode && (
                                    <button
                                        onClick={startCall}
                                        className="p-2.5 bg-brand-brown text-white rounded-full hover:bg-brand-brown-dark transition-colors shadow-md hover:shadow-lg"
                                        title="Talk to Doc"
                                    >
                                        <Mic size={20} />
                                    </button>
                                )}
                            </div>

                            {confessionError && (
                                <p className="mt-2 text-red-500 text-sm text-center">{confessionError}</p>
                            )}

                            {/* End conversation button - visible in chat mode */}
                            {isChatMode && chatMessages.length > 0 && (
                                <div className="flex justify-center mt-3">
                                    <button
                                        onClick={endChat}
                                        className="text-brand-navy-400 hover:text-brand-navy-600 text-sm font-medium transition-colors"
                                    >
                                        End conversation
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* Connecting state */}
                    {callStatus === "connecting" && (
                        <motion.div
                            key="connecting"
                            className="w-full max-w-2xl mx-auto mb-6"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                        >
                            <div className="flex items-center justify-center gap-3 bg-white/80 backdrop-blur-md border border-brand-neutral-200 rounded-2xl px-6 py-4">
                                <div className="w-5 h-5 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
                                <span className="text-brand-brown font-medium">Connecting to Doc...</span>
                            </div>
                        </motion.div>
                    )}

                    {/* Active call controls */}
                    {callStatus === "active" && (
                        <motion.div
                            key="active-call"
                            className="w-full max-w-2xl mx-auto mb-6"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                        >
                            <div className="flex items-center justify-center gap-4 bg-white/80 backdrop-blur-md border border-brand-neutral-200 rounded-2xl px-6 py-4">
                                {/* Speaking indicator */}
                                <div className="flex items-center gap-3 flex-1">
                                    {currentSpeaker === "assistant" ? (
                                        <>
                                            <div className="flex items-center gap-1 h-5">
                                                {[...Array(4)].map((_, i) => (
                                                    <motion.div
                                                        key={i}
                                                        className="w-1 bg-brand-brown rounded-full"
                                                        animate={{ height: [4, 16, 4] }}
                                                        transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                                                    />
                                                ))}
                                            </div>
                                            <span className="text-brand-brown font-medium">Doc is talking</span>
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                            <span className="text-brand-navy-600 font-medium">Listening...</span>
                                        </>
                                    )}
                                </div>

                                {/* Timer */}
                                <div className="flex items-center gap-2 text-brand-navy-500 font-mono text-sm bg-brand-navy-50 px-3 py-1 rounded-full">
                                    <Clock size={14} />
                                    <span>{formatTime(RATE_LIMIT_SECONDS - usageData.usedSeconds - currentCallSeconds)}</span>
                                </div>

                                {/* Mute button */}
                                <button
                                    onClick={toggleMute}
                                    className={cn(
                                        "p-3 rounded-full transition-all",
                                        isMuted
                                            ? "bg-red-100 text-red-500 hover:bg-red-200"
                                            : "bg-brand-neutral-100 text-brand-navy-600 hover:bg-brand-neutral-200"
                                    )}
                                    title={isMuted ? "Unmute" : "Mute"}
                                >
                                    {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                                </button>

                                {/* End call button */}
                                <button
                                    onClick={endCall}
                                    className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-md"
                                    title="End call"
                                >
                                    <PhoneOff size={20} />
                                </button>
                            </div>

                            {/* Low time warning */}
                            {showLowTimeWarning && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-3 text-center"
                                >
                                    <span className="bg-amber-100 text-amber-800 px-4 py-1.5 rounded-full text-xs font-semibold">
                                        Less than 1 minute remaining
                                    </span>
                                </motion.div>
                            )}
                        </motion.div>
                    )}

                    {/* Ending state */}
                    {callStatus === "ending" && (
                        <motion.div
                            key="ending"
                            className="w-full max-w-2xl mx-auto mb-6"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <div className="flex items-center justify-center gap-3 bg-white/80 backdrop-blur-md border border-brand-neutral-200 rounded-2xl px-6 py-4">
                                <div className="w-5 h-5 border-2 border-brand-navy-300/30 border-t-brand-navy-400 rounded-full animate-spin" />
                                <span className="text-brand-navy-500 font-medium">Ending call...</span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Trust signals - below input bar (hidden in chat mode) */}
                {callStatus === "idle" && !isChatMode && (
                    <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 mb-8 text-xs font-medium text-brand-navy-400 uppercase tracking-wider">
                        <span className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Anonymous
                        </span>
                        <span className="hidden md:block w-1 h-1 rounded-full bg-brand-navy-200"></span>
                        <span className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            No account
                        </span>
                        <span className="hidden md:block w-1 h-1 rounded-full bg-brand-navy-200"></span>
                        <span className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Free
                        </span>
                    </div>
                )}

                {/* Transcript (recent messages) */}
                <AnimatePresence>
                    {transcript.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-12 w-full max-w-lg mb-28"
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

            {/* Footer disclaimer - static at bottom */}
            <div className="w-full mt-auto text-center text-brand-navy-400 text-xs z-10 px-4 pt-12 pb-3">
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
                        className="flex items-center hover:opacity-80 transition-opacity"
                    >
                        <svg viewBox="480 860 1060 250" className="h-4 opacity-70 -translate-y-0.5" xmlns="http://www.w3.org/2000/svg">
                            <g fill="#073863">
                                <path d="M583.9,1001.36c0,0-8.68-10.85-23.72-24.15c-24.1,46.33-63.34,83.45-63.34,83.45s36.73-3.76,66.81-64.5c10.61,10.22,13.88,14.85,13.88,14.85L583.9,1001.36z"/>
                                <path d="M733.92,1001.82c0,0,6.65-11.76,21.69-25.07c24.1,46.33,65.37,84.36,65.37,84.36s-38.76-4.68-68.84-65.42c-7.71,10.17-11.86,15.76-11.86,15.76L733.92,1001.82z"/>
                                <path d="M540.37,1052.85c0,0,55.39-58.72,89.23-118.3c28.92-57.56,30.37-61.61,30.37-61.61s49.75,112.51,118.88,182.51c-49.17-7.23-98.63-107.31-98.63-107.31s-2.31,48.01,32.39,76.65c-41.41-21.63-62.03-65.3-62.03-65.3c-2.42-6.23-4.08-10.69-5.43-13.87c-2.14-5.02-6.61-4.67-9.49-0.02C595.72,1009.9,564.56,1041.66,540.37,1052.85z"/>
                                <path d="M723.86,1075.39c-0.72,0.92-1.45,1.81-2.17,2.63c-4.39,4.99-10.85,7.86-17.73,7.86h-42.91c-6.14,0-11.32,4.33-12.04,10.08l-1.45,11.47l-4.76-154.11h-6.37l-0.18,2.17c-0.4,4.88-8.69,106.02-10.75,138.84c-6.43-8.81-14.69-8.31-16.34-8.1c-4.51-0.05-8.79-1.97-11.47-5.19c-0.12-0.14-0.23-0.28-0.34-0.42c-3.52-4.57-6-7.2-8.28-8.81c-3.38-2.39-8.11-2.39-11.49,0c-2.27,1.61-4.75,4.24-8.28,8.81c-0.11,0.15-0.23,0.29-0.35,0.44c-2.71,3.24-7.05,5.17-11.63,5.17h-60.46v4.7h60.46c6.09,0,11.91-2.6,15.54-6.95c0.16-0.19,0.32-0.39,0.48-0.59c3.18-4.11,5.41-6.52,7.24-7.82c1.62-1.15,3.88-1.15,5.5,0c1.84,1.3,4.07,3.71,7.24,7.82c0.16,0.2,0.31,0.4,0.46,0.58c3.64,4.36,9.46,6.97,15.55,6.97l0.2,0l0.22-0.04c0.4-0.06,9.65-1.29,14.97,12.39h5.3c0.17-9.76,5.54-77.51,8.78-117.7l4.37,141.49h6.93l3.86-30.56c0.43-3.38,3.47-5.93,7.09-5.93h42.91c8.37,0,16.24-3.49,21.58-9.56c0.78-0.89,1.57-1.84,2.35-2.84c8.36-10.73,11.55-13.64,18.06-13.64v-4.7C736.42,1059.84,731.82,1065.17,723.86,1075.39z"/>
                                <path d="M788.01,1085.87c-6.88,0-13.35-2.86-17.73-7.86c-0.72-0.82-1.45-1.71-2.17-2.63c-7.97-10.22-12.57-15.55-22.08-15.55v4.7c6.5,0,9.69,2.91,18.06,13.64c0.78,0.99,1.57,1.95,2.35,2.84c5.34,6.08,13.2,9.56,21.58,9.56h32.97v-4.7H788.01z"/>
                                <path d="M885.52,1092.76V964.19h33.79l36.71,98.98l37.07-98.98h31.96v128.57h-21.73v-98.25l0.18-15.89h-0.37l-5.84,15.52l-37.07,98.62h-15.89l-36.71-98.98l-5.66-15.34h-0.37l0.18,16.07v98.25H885.52z"/>
                                <path d="M1091.89,1095.5c-8.77,0-16.56-2.04-23.38-6.12c-6.82-4.08-12.21-9.89-16.16-17.44c-3.96-7.55-5.94-16.37-5.94-26.48c0-10.1,2.01-18.99,6.03-26.66s9.43-13.67,16.25-17.99c6.82-4.32,14.36-6.48,22.65-6.48c8.16,0,15.43,1.95,21.82,5.84c6.39,3.9,11.44,9.65,15.16,17.26c3.71,7.61,5.57,16.96,5.57,28.03h-65.56c0.24,11.81,2.89,20.61,7.94,26.39c5.05,5.78,11.72,8.68,20,8.68c6.45,0,11.99-1.92,16.62-5.75c4.62-3.84,7.85-9.22,9.68-16.16h12.6c-2.31,11.69-7.28,20.76-14.88,27.21C1112.68,1092.28,1103.21,1095.5,1091.89,1095.5z M1090.98,1007.47c-5.6,0-10.32,2.1-14.15,6.3c-3.84,4.2-6.42,10.5-7.76,18.9h42.19c-0.73-8.28-2.89-14.55-6.48-18.81C1101.17,1009.61,1096.58,1007.47,1090.98,1007.47z"/>
                                <path d="M1204.94,1017.7c-2.92-0.73-5.78-1.1-8.58-1.1c-6.82,0-12.18,2.22-16.07,6.67c-3.9,4.45-5.84,11.11-5.84,20v49.49h-20.64v-95.7h19.54v25.57c2.19-8.64,6.12-15.49,11.78-20.55c5.66-5.05,12.26-7.64,19.81-7.76V1017.7z"/>
                                <path d="M1258.99,1095.5c-8.65,0-16.38-2.04-23.19-6.12c-6.82-4.08-12.21-9.86-16.16-17.35c-3.96-7.49-5.94-16.34-5.94-26.57c0-10.35,2.01-19.36,6.03-27.03c4.02-7.67,9.56-13.61,16.62-17.81c7.06-4.2,15.04-6.3,23.92-6.3c8.89,0,16.74,2.07,23.56,6.21c6.82,4.14,12.15,9.92,15.98,17.35c3.84,7.43,5.75,16.19,5.75,26.3c0,10.47-2.01,19.54-6.03,27.21c-4.02,7.67-9.53,13.61-16.53,17.81C1276.01,1093.4,1268,1095.5,1258.99,1095.5z M1260.09,1082.35c6.94,0,12.6-2.92,16.98-8.77c4.38-5.84,6.57-15.22,6.57-28.12c0-12.54-2.25-22.01-6.76-28.4c-4.51-6.39-10.41-9.59-17.72-9.59c-7.06,0-12.75,2.92-17.07,8.77c-4.32,5.84-6.48,15.16-6.48,27.94c0,12.54,2.25,22.04,6.76,28.49C1246.88,1079.13,1252.78,1082.35,1260.09,1082.35z"/>
                                <path d="M1325.29,1092.76V964.19h20.64v77.07l40.73-44.2h20.82l-35.25,35.8l37.07,59.9H1385l-27.03-45.47l-12.05,12.24v33.24H1325.29z"/>
                                <path d="M1441.62,1095.32c-8.16,0-14.79-2.34-19.91-7.03c-5.11-4.69-7.67-10.62-7.67-17.81c0-7.3,2.31-13.27,6.94-17.9c4.63-4.62,12.42-8.28,23.38-10.96c7.42-1.7,13.06-3.35,16.89-4.93c3.84-1.58,6.45-3.38,7.85-5.39c1.4-2.01,2.1-4.35,2.1-7.03c0-3.9-1.64-7.33-4.93-10.32c-3.29-2.98-7.98-4.47-14.06-4.47c-5.97,0-11.05,1.77-15.25,5.3c-4.2,3.53-6.85,8.65-7.94,15.34h-12.6c1.34-10.96,5.72-19.66,13.15-26.11c7.43-6.45,16.68-9.68,27.76-9.68c10.84,0,19.51,3.04,26.02,9.13c6.51,6.09,9.77,14.13,9.77,24.11v43.65c0,3.65,0.79,6.3,2.38,7.95c1.58,1.64,4.14,2.59,7.67,2.83v10.77c-2.31,1.1-5.78,1.64-10.41,1.64c-6.09,0-10.81-1.62-14.15-4.84c-3.35-3.23-5.33-7.64-5.94-13.24c-2.56,5.97-6.51,10.62-11.87,13.97C1455.44,1093.64,1449.04,1095.32,1441.62,1095.32z M1449.65,1080.53c6.69,0,12.17-2.25,16.44-6.76c4.26-4.5,6.39-10.35,6.39-17.53v-17.17c-3.65,5.48-10.59,9.8-20.82,12.97c-5.97,1.95-10.2,4.23-12.69,6.85c-2.5,2.62-3.74,5.69-3.74,9.22c0,3.53,1.28,6.48,3.84,8.86S1445.15,1080.53,1449.65,1080.53z"/>
                            </g>
                        </svg>
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
