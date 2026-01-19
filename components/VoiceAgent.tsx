"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Vapi from "@vapi-ai/web";
import { Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { VAPI_ASSISTANT_CONFIG } from "@/lib/persona";
import { supabase } from "@/lib/supabase";
import PostCallForm from "./PostCallForm";

type CallStatus = "idle" | "connecting" | "active" | "ending";

export default function VoiceAgent() {
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState<"user" | "assistant" | null>(null);
  const [lastCallId, setLastCallId] = useState<string | null>(null);
  const [showPostCallForm, setShowPostCallForm] = useState(false);

  const vapiRef = useRef<Vapi | null>(null);
  const ipAddressRef = useRef<string | null>(null);
  const callStartTimeRef = useRef<number | null>(null);
  const fullTranscriptRef = useRef<string[]>([]);

  // Fetch IP address on mount
  useEffect(() => {
    fetch("/api/ip")
      .then((res) => res.json())
      .then((data) => {
        ipAddressRef.current = data.ip;
      })
      .catch(console.error);
  }, []);

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

      // Save call to database
      const callId = await saveCallToDatabase();
      if (callId) {
        setLastCallId(callId);
        setShowPostCallForm(true);

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

    setCallStatus("connecting");

    try {
      // Use assistant ID if configured, otherwise use inline config
      const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

      if (assistantId) {
        await vapiRef.current.start(assistantId);
      } else {
        await vapiRef.current.start(VAPI_ASSISTANT_CONFIG as any);
      }
    } catch (error) {
      console.error("Failed to start call:", error);
      setCallStatus("idle");
    }
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

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-2 text-white">Doc</h1>
        <p className="text-gray-400 text-lg max-w-md">
          A sardonic AI companion for burnt-out physicians.
          <br />
          <span className="text-gray-500">Vent about the system with someone who gets it.</span>
        </p>
      </div>

      {/* Call Button Area */}
      <div className="relative mb-12">
        {/* Pulse rings when active */}
        {callStatus === "active" && (
          <>
            <div className="absolute inset-0 bg-green-500/20 rounded-full pulse-ring"
                 style={{ width: "200px", height: "200px", left: "-30px", top: "-30px" }} />
            <div className="absolute inset-0 bg-green-500/10 rounded-full pulse-ring"
                 style={{ width: "240px", height: "240px", left: "-50px", top: "-50px", animationDelay: "0.5s" }} />
          </>
        )}

        {/* Main call button */}
        <button
          onClick={callStatus === "idle" ? startCall : endCall}
          disabled={callStatus === "connecting" || callStatus === "ending"}
          className={`
            relative z-10 w-36 h-36 rounded-full flex items-center justify-center
            transition-all duration-300 transform hover:scale-105
            ${callStatus === "idle"
              ? "bg-green-600 hover:bg-green-500 shadow-lg shadow-green-500/30"
              : callStatus === "active"
              ? "bg-red-600 hover:bg-red-500 shadow-lg shadow-red-500/30"
              : "bg-gray-600 cursor-not-allowed"
            }
          `}
        >
          {callStatus === "idle" && <Phone size={48} className="text-white" />}
          {callStatus === "connecting" && (
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          {callStatus === "active" && <PhoneOff size={48} className="text-white" />}
          {callStatus === "ending" && (
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          )}
        </button>
      </div>

      {/* Status text */}
      <div className="text-center mb-8">
        {callStatus === "idle" && (
          <p className="text-gray-400">Tap to start venting</p>
        )}
        {callStatus === "connecting" && (
          <p className="text-yellow-400">Connecting to Doc...</p>
        )}
        {callStatus === "active" && (
          <div className="flex items-center gap-2 text-green-400">
            {currentSpeaker === "assistant" ? (
              <>
                <span>Doc is talking</span>
                <div className="flex items-center gap-1 h-8">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-green-400 rounded-full waveform-bar"
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

      {/* Footer disclaimer */}
      <div className="fixed bottom-4 text-center text-gray-600 text-xs">
        <p>Not a real therapist. For entertainment and venting purposes only.</p>
        <a href="/privacy" className="hover:text-gray-400 transition-colors underline mt-1 inline-block">
          Privacy Policy
        </a>
      </div>

      {/* Post-call form */}
      {showPostCallForm && lastCallId && (
        <PostCallForm
          callId={lastCallId}
          onComplete={() => {
            setShowPostCallForm(false);
            setLastCallId(null);
            setTranscript([]);
          }}
        />
      )}
    </div>
  );
}
