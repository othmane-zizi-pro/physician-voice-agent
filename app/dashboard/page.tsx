"use client";

import { useState, useEffect, useCallback } from "react";
import { Phone, MessageSquare, Calendar, Clock, MapPin, ChevronRight, Filter, Loader2 } from "lucide-react";
import ConversationDetail from "@/components/dashboard/ConversationDetail";

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

export default function DashboardPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "voice" | "text">("all");
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [total, setTotal] = useState(0);

  const fetchConversations = useCallback(async () => {
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
  }, [filter]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

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

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">My Conversations</h1>
          <p className="text-gray-400 text-sm mt-1">
            {total} conversation{total !== 1 ? "s" : ""} total
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-500" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | "voice" | "text")}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-meroka-primary"
          >
            <option value="all">All types</option>
            <option value="voice">Voice calls</option>
            <option value="text">Text confessions</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-meroka-primary animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-400">{error}</p>
          <button
            onClick={fetchConversations}
            className="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
          >
            Try again
          </button>
        </div>
      ) : conversations.length === 0 ? (
        <div className="text-center py-12 bg-gray-900/50 rounded-xl border border-gray-800">
          <MessageSquare className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No conversations yet</h3>
          <p className="text-gray-400 text-sm mb-4">
            {filter === "all"
              ? "Start a voice call or type a confession to see your history here."
              : filter === "voice"
              ? "You haven't made any voice calls yet."
              : "You haven't typed any confessions yet."}
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-meroka-primary hover:bg-meroka-primary-hover text-white rounded-lg transition-colors"
          >
            Start venting
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedConversation(conv)}
              className="w-full text-left bg-gray-900/50 hover:bg-gray-900/70 border border-gray-800 hover:border-gray-700 rounded-xl p-4 transition-colors group"
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div
                  className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                    conv.session_type === "voice"
                      ? "bg-blue-500/20 text-blue-400"
                      : "bg-green-500/20 text-green-400"
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
                    <span className="text-xs font-medium text-gray-500 uppercase">
                      {conv.session_type === "voice" ? "Voice Call" : "Text"}
                    </span>
                    {conv.frustration_score !== null && conv.frustration_score > 0 && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          conv.frustration_score >= 7
                            ? "bg-red-500/20 text-red-400"
                            : conv.frustration_score >= 4
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-green-500/20 text-green-400"
                        }`}
                      >
                        {conv.frustration_score}/10
                      </span>
                    )}
                  </div>

                  <p className="text-gray-300 text-sm line-clamp-2 mb-2">
                    {getPreview(conv)}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
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
                    {getLocation(conv) && (
                      <span className="flex items-center gap-1">
                        <MapPin size={12} />
                        {getLocation(conv)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                <ChevronRight
                  size={20}
                  className="flex-shrink-0 text-gray-600 group-hover:text-gray-400 transition-colors"
                />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Conversation detail modal */}
      {selectedConversation && (
        <ConversationDetail
          conversation={selectedConversation}
          onClose={() => setSelectedConversation(null)}
        />
      )}
    </div>
  );
}
