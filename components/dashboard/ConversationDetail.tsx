"use client";

import { useState, useRef, useEffect } from "react";
import { X, Phone, MessageSquare, Calendar, Clock, MapPin, Play, Pause, Volume2, Film, Download, Link2, ArrowLeft, Loader2 } from "lucide-react";

interface Conversation {
  id: string;
  transcript: string | null;
  quotable_quote: string | null;
  frustration_score: number | null;
  recording_url: string | null;
  duration_seconds: number | null;
  session_type: "voice" | "text";
  created_at: string;
  city: string | null;
  region: string | null;
  country: string | null;
}

interface ConversationDetailProps {
  conversation: Conversation;
  onClose: () => void;
}

export default function ConversationDetail({ conversation, onClose }: ConversationDetailProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [clipMode, setClipMode] = useState<'view' | 'select' | 'generating' | 'result'>('view');
  const [exchanges, setExchanges] = useState<Array<{ index: number; physicianText: string; docText: string }>>([]);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [clipError, setClipError] = useState<string | null>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getLocation = () => {
    const parts = [conversation.city, conversation.region, conversation.country].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  // Format transcript with speaker labels
  const formatTranscript = (transcript: string | null) => {
    if (!transcript) return null;

    const lines = transcript.split("\n").filter((line) => line.trim());
    return lines.map((line, index) => {
      const isUser = line.startsWith("You:");
      const isDoc = line.startsWith("Doc:");
      const content = line.replace(/^(You:|Doc:)\s*/, "");

      return (
        <div
          key={index}
          className={`mb-3 ${isUser ? "text-right" : ""}`}
        >
          {(isUser || isDoc) && (
            <span className={`text-xs font-medium mb-1 block ${isUser ? "text-blue-400" : "text-meroka-primary"}`}>
              {isUser ? "You" : "Doc"}
            </span>
          )}
          <p
            className={`inline-block px-3 py-2 rounded-lg text-sm max-w-[85%] ${
              isUser
                ? "bg-blue-500/20 text-blue-100"
                : isDoc
                ? "bg-gray-800 text-gray-200"
                : "bg-gray-800/50 text-gray-300"
            }`}
          >
            {content}
          </p>
        </div>
      );
    });
  };

  const parseExchanges = (transcript: string) => {
    const lines = transcript.split('\n').filter(line => line.trim());
    const result: Array<{ index: number; physicianText: string; docText: string }> = [];

    let current: { physicianLines: string[]; docLines: string[] } | null = null;
    let idx = 0;

    for (const line of lines) {
      const isPhysician = line.startsWith('You:');
      const isDoc = line.startsWith('Doc:');
      const content = line.replace(/^(You:|Doc:)\s*/, '').trim();

      if (isPhysician) {
        if (current && current.docLines.length > 0) {
          result.push({
            index: idx,
            physicianText: current.physicianLines.join(' '),
            docText: current.docLines.join(' '),
          });
          idx++;
        }
        if (!current || current.docLines.length > 0) {
          current = { physicianLines: [content], docLines: [] };
        } else {
          current.physicianLines.push(content);
        }
      } else if (isDoc && current) {
        current.docLines.push(content);
      }
    }

    if (current && current.docLines.length > 0) {
      result.push({
        index: idx,
        physicianText: current.physicianLines.join(' '),
        docText: current.docLines.join(' '),
      });
    }

    return result;
  };

  const handleCreateClip = () => {
    if (conversation.transcript) {
      setExchanges(parseExchanges(conversation.transcript));
      setClipMode('select');
    }
  };

  const handleSelectExchange = async (exchangeIndex: number) => {
    setClipMode('generating');
    setClipError(null);

    try {
      const response = await fetch('/api/generate-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId: conversation.id,
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

  const handleCopyLink = async () => {
    if (clipUrl) {
      await navigator.clipboard.writeText(clipUrl);
    }
  };

  const handleBackToView = () => {
    setClipMode('view');
    setClipUrl(null);
    setClipError(null);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-meroka-secondary border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                conversation.session_type === "voice"
                  ? "bg-blue-500/20 text-blue-400"
                  : "bg-green-500/20 text-green-400"
              }`}
            >
              {conversation.session_type === "voice" ? (
                <Phone size={18} />
              ) : (
                <MessageSquare size={18} />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                {conversation.session_type === "voice" ? "Voice Call" : "Text Confession"}
              </h2>
              <p className="text-gray-400 text-sm">{formatDate(conversation.created_at)}</p>
            </div>
          </div>
          <div className="flex items-center">
            {conversation.transcript && conversation.session_type === 'voice' && clipMode === 'view' && (
              <button
                onClick={handleCreateClip}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-meroka-primary hover:bg-meroka-primary-hover text-white rounded-lg transition-colors mr-2"
              >
                <Film size={16} />
                Create Clip
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {clipMode === 'select' && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={handleBackToView}
                  className="p-1 text-gray-400 hover:text-white"
                >
                  <ArrowLeft size={20} />
                </button>
                <h3 className="text-lg font-medium text-white">Select an exchange to clip</h3>
              </div>
              {clipError && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
                  {clipError}
                </div>
              )}
              <div className="space-y-3">
                {exchanges.map((exchange) => (
                  <button
                    key={exchange.index}
                    onClick={() => handleSelectExchange(exchange.index)}
                    className="w-full text-left p-4 bg-gray-800/50 hover:bg-gray-800 rounded-xl transition-colors"
                  >
                    <div className="mb-2">
                      <span className="text-xs text-blue-400 font-medium">You</span>
                      <p className="text-gray-300 text-sm line-clamp-2">{exchange.physicianText}</p>
                    </div>
                    <div>
                      <span className="text-xs text-meroka-primary font-medium">Doc</span>
                      <p className="text-gray-400 text-sm line-clamp-2">{exchange.docText}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {clipMode === 'generating' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={48} className="text-meroka-primary animate-spin mb-4" />
              <p className="text-gray-300">Creating your clip...</p>
              <p className="text-gray-500 text-sm mt-1">This may take a few moments</p>
            </div>
          )}

          {clipMode === 'result' && clipUrl && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={handleBackToView}
                  className="p-1 text-gray-400 hover:text-white"
                >
                  <ArrowLeft size={20} />
                </button>
                <h3 className="text-lg font-medium text-white">Your clip is ready!</h3>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-4 mb-4">
                <video
                  src={clipUrl}
                  controls
                  className="w-full rounded-lg"
                />
              </div>
              <div className="flex gap-3">
                <a
                  href={clipUrl}
                  download
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-meroka-primary hover:bg-meroka-primary-hover text-white rounded-lg transition-colors"
                >
                  <Download size={18} />
                  Download
                </a>
                <button
                  onClick={handleCopyLink}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  <Link2 size={18} />
                  Copy Link
                </button>
              </div>
              <button
                onClick={() => setClipMode('select')}
                className="w-full mt-3 px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm"
              >
                Create another clip
              </button>
            </div>
          )}

          {clipMode === 'view' && (
            <>
              {/* Meta info */}
              <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                {conversation.session_type === "voice" && conversation.duration_seconds && (
                  <span className="flex items-center gap-1.5">
                    <Clock size={14} />
                    {formatTime(conversation.duration_seconds)} duration
                  </span>
                )}
                {getLocation() && (
                  <span className="flex items-center gap-1.5">
                    <MapPin size={14} />
                    {getLocation()}
                  </span>
                )}
                {conversation.frustration_score !== null && conversation.frustration_score > 0 && (
                  <span
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded ${
                      conversation.frustration_score >= 7
                        ? "bg-red-500/20 text-red-400"
                        : conversation.frustration_score >= 4
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-green-500/20 text-green-400"
                    }`}
                  >
                    Frustration: {conversation.frustration_score}/10
                  </span>
                )}
              </div>

              {/* Audio player for voice calls */}
              {conversation.session_type === "voice" && conversation.recording_url && (
                <div className="bg-gray-800/50 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Volume2 size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-300 font-medium">Recording</span>
                  </div>

                  <audio
                    ref={audioRef}
                    src={conversation.recording_url}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onEnded={handleEnded}
                  />

                  <div className="flex items-center gap-3">
                    <button
                      onClick={togglePlayback}
                      className="w-10 h-10 rounded-full bg-meroka-primary hover:bg-meroka-primary-hover flex items-center justify-center text-white transition-colors"
                    >
                      {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                    </button>

                    <div className="flex-1">
                      <input
                        type="range"
                        min={0}
                        max={duration || 100}
                        value={currentTime}
                        onChange={handleSeek}
                        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-meroka-primary"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Quotable quote */}
              {conversation.quotable_quote && (
                <div className="bg-meroka-primary/10 border border-meroka-primary/20 rounded-xl p-4">
                  <p className="text-sm text-gray-400 mb-2">Highlight</p>
                  <p className="text-meroka-cream italic">
                    &ldquo;{conversation.quotable_quote}&rdquo;
                  </p>
                </div>
              )}

              {/* Transcript */}
              {conversation.transcript && (
                <div>
                  <p className="text-sm text-gray-400 mb-3">
                    {conversation.session_type === "voice" ? "Transcript" : "Your confession"}
                  </p>
                  <div className="bg-gray-900/50 rounded-xl p-4">
                    {conversation.session_type === "voice" ? (
                      formatTranscript(conversation.transcript)
                    ) : (
                      <p className="text-gray-300 text-sm whitespace-pre-wrap">
                        {conversation.transcript}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
