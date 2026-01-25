"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Phone, MessageSquare, Calendar, Clock, MapPin, ChevronRight, ChevronLeft, Filter, Loader2, ArrowLeft } from "lucide-react";

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

export default function HistoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "voice" | "text">("all");
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [total, setTotal] = useState(0);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/history");
    }
  }, [status, router]);

  const fetchConversations = useCallback(async () => {
    if (!session) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filter !== "all") {
        params.set("type", filter);
      }

      const response = await fetch(`/api/user/conversations?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch conversations");
      }

      setConversations(data.conversations);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }, [filter, session]);

  useEffect(() => {
    if (session) {
      fetchConversations();
    }
  }, [fetchConversations, session]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    } else if (diffDays === 1) {
      return `Yesterday at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "long", hour: "numeric", minute: "2-digit" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getLocation = (conv: Conversation) => {
    const parts = [conv.city, conv.region, conv.country].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  };

  const getPreview = (conv: Conversation) => {
    if (conv.quotable_quote) return conv.quotable_quote;
    if (conv.transcript) {
      const preview = conv.transcript.slice(0, 150);
      return preview.length < conv.transcript.length ? preview + "..." : preview;
    }
    return "No transcript available";
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-brand-neutral-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-brown animate-spin" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-brand-neutral-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-brand-neutral-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Link
              href="/"
              className="flex items-center gap-2 text-brand-navy-600 hover:text-brand-navy-900 transition-colors"
            >
              <ArrowLeft size={20} />
              <span className="text-sm font-medium">Back to Doc</span>
            </Link>

            <div className="flex items-center gap-2">
              {session.user?.image ? (
                <img
                  src={session.user.image}
                  alt=""
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-brand-brown flex items-center justify-center text-white text-sm font-medium">
                  {(session.user?.name || session.user?.email || "U")[0].toUpperCase()}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Title and filter */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-brand-navy-900">My Conversations</h1>
            <p className="text-brand-navy-600 text-sm mt-1">
              {total} conversation{total !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Filter size={16} className="text-brand-navy-600" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as "all" | "voice" | "text")}
              className="bg-white border border-brand-neutral-100 rounded-lg px-3 py-1.5 text-sm text-brand-navy-800 focus:outline-none focus:border-brand-brown shadow-sm"
            >
              <option value="all">All types</option>
              <option value="voice">Voice calls</option>
              <option value="text">Text confessions</option>
            </select>
          </div>
        </div>

        {/* Conversations list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-brand-brown animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-500">{error}</p>
            <button
              onClick={fetchConversations}
              className="mt-4 px-4 py-2 bg-brand-neutral-100 hover:bg-brand-neutral-100/80 text-brand-navy-800 rounded-lg transition-colors"
            >
              Try again
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-brand-neutral-100 shadow-sm">
            <MessageSquare className="w-12 h-12 text-brand-navy-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-brand-navy-900 mb-2">No conversations yet</h3>
            <p className="text-brand-navy-600 text-sm mb-4">
              {filter === "all"
                ? "Start a voice call or type a confession to see your history here."
                : filter === "voice"
                ? "You haven't made any voice calls yet."
                : "You haven't typed any confessions yet."}
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-brown hover:bg-brand-brown-dark text-white rounded-lg transition-colors"
            >
              Start venting
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConversation(conv)}
                className="w-full text-left bg-white hover:bg-brand-neutral-50 border border-brand-neutral-100 hover:border-brand-navy-300 rounded-xl p-4 transition-colors group shadow-sm"
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div
                    className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                      conv.session_type === "voice"
                        ? "bg-brand-ice text-brand-navy-600"
                        : "bg-green-100 text-green-600"
                    }`}
                  >
                    {conv.session_type === "voice" ? (
                      <Phone size={18} />
                    ) : (
                      <MessageSquare size={18} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-brand-navy-600 uppercase">
                        {conv.session_type === "voice" ? "Voice Call" : "Text"}
                      </span>
                    </div>

                    <p className="text-brand-navy-800 text-sm line-clamp-2 mb-2">
                      {getPreview(conv)}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-navy-600">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {formatDate(conv.created_at)}
                      </span>
                      {conv.session_type === "voice" && conv.duration_seconds && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatDuration(conv.duration_seconds)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Arrow */}
                  <ChevronRight
                    size={20}
                    className="flex-shrink-0 text-brand-navy-300 group-hover:text-brand-navy-600 transition-colors"
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Conversation detail modal */}
      {selectedConversation && (
        <div className="fixed inset-0 bg-brand-navy-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-brand-neutral-100">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    selectedConversation.session_type === "voice"
                      ? "bg-brand-ice text-brand-navy-600"
                      : "bg-green-100 text-green-600"
                  }`}
                >
                  {selectedConversation.session_type === "voice" ? (
                    <Phone size={18} />
                  ) : (
                    <MessageSquare size={18} />
                  )}
                </div>
                <div>
                  <p className="font-medium text-brand-navy-900">
                    {selectedConversation.session_type === "voice" ? "Voice Call" : "Text Confession"}
                  </p>
                  <p className="text-xs text-brand-navy-600">
                    {formatDate(selectedConversation.created_at)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedConversation(null)}
                className="p-2 hover:bg-brand-neutral-100 rounded-lg transition-colors"
              >
                <ChevronLeft size={20} className="text-brand-navy-600" />
              </button>
            </div>

            {/* Modal content */}
            <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
              {selectedConversation.transcript ? (
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-brand-navy-800 text-sm leading-relaxed">
                    {selectedConversation.transcript}
                  </pre>
                </div>
              ) : (
                <p className="text-brand-navy-600 text-sm">No transcript available</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
