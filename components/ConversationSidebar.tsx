"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  Menu,
  X,
  Phone,
  MessageSquare,
  Clock,
  ChevronRight,
  Loader2,
  History,
  Search,
  Trash2,
  Download,
  AlertCircle,
} from "lucide-react";

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

interface GroupedConversations {
  [key: string]: Conversation[];
}

// Skeleton loader component
function ConversationSkeleton() {
  return (
    <div className="px-4 py-3 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-brand-neutral-100" />
        <div className="flex-1">
          <div className="h-4 bg-brand-neutral-100 rounded w-3/4 mb-2" />
          <div className="h-3 bg-brand-neutral-100 rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}

export default function ConversationSidebar() {
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    if (!session) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/user/conversations?limit=50");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch conversations");
      }

      setConversations(data.conversations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  // Fetch conversations when sidebar opens
  useEffect(() => {
    if (isOpen && session) {
      fetchConversations();
    }
  }, [isOpen, session, fetchConversations]);

  // Filter conversations based on search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;

    const query = searchQuery.toLowerCase();
    return conversations.filter((conv) => {
      const transcript = conv.transcript?.toLowerCase() || "";
      const quote = conv.quotable_quote?.toLowerCase() || "";
      return transcript.includes(query) || quote.includes(query);
    });
  }, [conversations, searchQuery]);

  // Group conversations by date
  const groupConversations = (convs: Conversation[]): GroupedConversations => {
    const groups: GroupedConversations = {};
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    convs.forEach((conv) => {
      const date = new Date(conv.created_at);
      let groupKey: string;

      if (date >= today) {
        groupKey = "Today";
      } else if (date >= yesterday) {
        groupKey = "Yesterday";
      } else if (date >= lastWeek) {
        groupKey = "Previous 7 Days";
      } else if (date >= lastMonth) {
        groupKey = "Previous 30 Days";
      } else {
        groupKey = date.toLocaleDateString([], { month: "long", year: "numeric" });
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(conv);
    });

    return groups;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getPreview = (conv: Conversation) => {
    if (conv.quotable_quote) {
      return conv.quotable_quote.length > 60
        ? conv.quotable_quote.slice(0, 57) + "..."
        : conv.quotable_quote;
    }
    if (conv.transcript) {
      const preview = conv.transcript.slice(0, 60);
      return preview.length < conv.transcript.length ? preview + "..." : preview;
    }
    return "No transcript";
  };

  // Delete conversation
  const handleDelete = async (id: string) => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/user/conversations/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete");
      }

      // Remove from local state
      setConversations((prev) => prev.filter((c) => c.id !== id));
      setSelectedConversation(null);
      setDeleteConfirm(null);
    } catch (err) {
      console.error("Delete error:", err);
      alert(err instanceof Error ? err.message : "Failed to delete conversation");
    } finally {
      setIsDeleting(false);
    }
  };

  // Export transcript as text file
  const handleExport = (conv: Conversation) => {
    if (!conv.transcript) return;

    const date = new Date(conv.created_at).toLocaleDateString([], {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    const content = `Doc Conversation - ${date}
Type: ${conv.session_type === "voice" ? "Voice Call" : "Text Confession"}
${conv.duration_seconds ? `Duration: ${formatDuration(conv.duration_seconds)}` : ""}
${conv.quotable_quote ? `\nHighlight: "${conv.quotable_quote}"\n` : ""}
---

${conv.transcript}
`;

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `doc-conversation-${conv.id.slice(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Don't render anything if not authenticated
  if (status === "loading" || !session) {
    return null;
  }

  const groupedConversations = groupConversations(filteredConversations);
  const groupOrder = ["Today", "Yesterday", "Previous 7 Days", "Previous 30 Days"];

  // Render conversation item
  const renderConversationItem = (conv: Conversation) => (
    <button
      key={conv.id}
      onClick={() => setSelectedConversation(conv)}
      className="w-full text-left px-4 py-3 hover:bg-brand-neutral-50 transition-colors group"
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            conv.session_type === "voice"
              ? "bg-brand-ice text-brand-navy-600"
              : "bg-green-100 text-green-600"
          }`}
        >
          {conv.session_type === "voice" ? (
            <Phone size={14} />
          ) : (
            <MessageSquare size={14} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-brand-navy-800 truncate">
            {getPreview(conv)}
          </p>
          <div className="flex items-center gap-2 mt-1 text-xs text-brand-navy-600">
            <span>{formatTime(conv.created_at)}</span>
            {conv.session_type === "voice" && conv.duration_seconds && (
              <>
                <span className="text-brand-navy-300">·</span>
                <span className="flex items-center gap-0.5">
                  <Clock size={10} />
                  {formatDuration(conv.duration_seconds)}
                </span>
              </>
            )}
          </div>
        </div>
        <ChevronRight
          size={16}
          className="flex-shrink-0 text-brand-navy-300 group-hover:text-brand-navy-600 transition-colors mt-1"
        />
      </div>
    </button>
  );

  return (
    <>
      {/* Toggle button - hamburger icon */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-40 p-2 rounded-lg bg-white/80 backdrop-blur-sm border border-brand-neutral-100 hover:bg-white hover:border-brand-navy-300 transition-all shadow-sm"
        aria-label={isOpen ? "Close sidebar" : "Open conversation history"}
      >
        {isOpen ? (
          <X size={20} className="text-brand-navy-800" />
        ) : (
          <Menu size={20} className="text-brand-navy-800" />
        )}
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-brand-navy-900/30 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed top-0 left-0 h-full w-80 bg-white border-r border-brand-neutral-100 z-30
          transform transition-transform duration-300 ease-in-out shadow-lg
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-brand-neutral-100">
          <div className="flex items-center gap-2">
            <History size={18} className="text-brand-navy-600" />
            <span className="font-medium text-brand-navy-900">History</span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg hover:bg-brand-neutral-100 transition-colors lg:hidden"
          >
            <X size={18} className="text-brand-navy-600" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-3 py-2 border-b border-brand-neutral-100">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-navy-300" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-brand-neutral-50 border border-brand-neutral-100 rounded-lg focus:outline-none focus:border-brand-navy-300 focus:bg-white transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-brand-neutral-100 rounded"
              >
                <X size={14} className="text-brand-navy-600" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="h-[calc(100%-7.5rem)] overflow-y-auto">
          {isLoading ? (
            // Skeleton loaders
            <div className="py-2">
              <div className="px-4 py-2">
                <div className="h-3 bg-brand-neutral-100 rounded w-16 animate-pulse" />
              </div>
              {[...Array(5)].map((_, i) => (
                <ConversationSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 px-4">
              <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
              <p className="text-red-500 text-sm mb-3">{error}</p>
              <button
                onClick={fetchConversations}
                className="text-sm text-brand-brown hover:underline"
              >
                Try again
              </button>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-12 px-4">
              {searchQuery ? (
                <>
                  <Search className="w-10 h-10 text-brand-navy-300 mx-auto mb-3" />
                  <p className="text-brand-navy-600 text-sm">No results found</p>
                  <p className="text-brand-navy-300 text-xs mt-1">
                    Try a different search term
                  </p>
                </>
              ) : (
                <>
                  <MessageSquare className="w-10 h-10 text-brand-navy-300 mx-auto mb-3" />
                  <p className="text-brand-navy-600 text-sm">No conversations yet</p>
                  <p className="text-brand-navy-300 text-xs mt-1">
                    Start venting to see your history
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="py-2">
              {/* Render groups in order */}
              {groupOrder.map((groupKey) => {
                const convs = groupedConversations[groupKey];
                if (!convs || convs.length === 0) return null;

                return (
                  <div key={groupKey} className="mb-4">
                    <p className="px-4 py-2 text-xs font-medium text-brand-navy-600 uppercase tracking-wide">
                      {groupKey}
                    </p>
                    <div className="space-y-0.5">
                      {convs.map(renderConversationItem)}
                    </div>
                  </div>
                );
              })}

              {/* Render remaining months */}
              {Object.keys(groupedConversations)
                .filter((key) => !groupOrder.includes(key))
                .map((groupKey) => {
                  const convs = groupedConversations[groupKey];
                  if (!convs || convs.length === 0) return null;

                  return (
                    <div key={groupKey} className="mb-4">
                      <p className="px-4 py-2 text-xs font-medium text-brand-navy-600 uppercase tracking-wide">
                        {groupKey}
                      </p>
                      <div className="space-y-0.5">
                        {convs.map(renderConversationItem)}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Conversation detail modal */}
      {selectedConversation && (
        <div
          className="fixed inset-0 bg-brand-navy-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => {
            setSelectedConversation(null);
            setDeleteConfirm(null);
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
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
                    {selectedConversation.session_type === "voice"
                      ? "Voice Call"
                      : "Text Confession"}
                  </p>
                  <p className="text-xs text-brand-navy-600">
                    {new Date(selectedConversation.created_at).toLocaleDateString([], {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {selectedConversation.duration_seconds && (
                      <span className="ml-2">
                        · {formatDuration(selectedConversation.duration_seconds)}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1">
                {selectedConversation.transcript && (
                  <button
                    onClick={() => handleExport(selectedConversation)}
                    className="p-2 hover:bg-brand-neutral-100 rounded-lg transition-colors"
                    title="Export transcript"
                  >
                    <Download size={18} className="text-brand-navy-600" />
                  </button>
                )}
                <button
                  onClick={() => setDeleteConfirm(selectedConversation.id)}
                  className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete conversation"
                >
                  <Trash2 size={18} className="text-red-500" />
                </button>
                <button
                  onClick={() => {
                    setSelectedConversation(null);
                    setDeleteConfirm(null);
                  }}
                  className="p-2 hover:bg-brand-neutral-100 rounded-lg transition-colors ml-1"
                >
                  <X size={20} className="text-brand-navy-600" />
                </button>
              </div>
            </div>

            {/* Delete confirmation */}
            {deleteConfirm === selectedConversation.id && (
              <div className="px-6 py-3 bg-red-50 border-b border-red-100 flex items-center justify-between">
                <p className="text-red-700 text-sm">Delete this conversation?</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="px-3 py-1 text-sm text-brand-navy-600 hover:bg-white rounded transition-colors"
                    disabled={isDeleting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDelete(selectedConversation.id)}
                    disabled={isDeleting}
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      "Delete"
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Modal content */}
            <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
              {selectedConversation.quotable_quote && (
                <div className="mb-4 p-4 bg-brand-ice/50 rounded-lg border border-brand-ice">
                  <p className="text-xs text-brand-navy-600 uppercase tracking-wide mb-1">
                    Highlight
                  </p>
                  <p className="text-brand-navy-800 italic">
                    "{selectedConversation.quotable_quote}"
                  </p>
                </div>
              )}

              {selectedConversation.transcript ? (
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-brand-navy-800 text-sm leading-relaxed bg-transparent p-0 m-0">
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
    </>
  );
}
