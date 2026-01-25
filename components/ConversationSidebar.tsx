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
  Film,
  ArrowLeft,
  Link2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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

  // Video clip state
  const [clipMode, setClipMode] = useState<'view' | 'select' | 'generating' | 'result'>('view');
  const [exchanges, setExchanges] = useState<Array<{ index: number; physicianText: string; docText: string }>>([]);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [clipError, setClipError] = useState<string | null>(null);
  const [copiedClipLink, setCopiedClipLink] = useState(false);

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

  // Parse transcript into exchanges for video clips
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
    if (selectedConversation?.transcript) {
      setExchanges(parseExchanges(selectedConversation.transcript));
      setClipMode('select');
      setClipError(null);
    }
  };

  const handleSelectExchange = async (exchangeIndex: number) => {
    if (!selectedConversation) return;

    setClipMode('generating');
    setClipError(null);

    try {
      const response = await fetch('/api/generate-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId: selectedConversation.id,
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
      setCopiedClipLink(true);
      setTimeout(() => setCopiedClipLink(false), 2000);
    }
  };

  const handleBackToView = () => {
    setClipMode('view');
    setClipUrl(null);
    setClipError(null);
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
      className="w-full text-left px-4 py-3 hover:bg-brand-neutral-100/50 transition-all duration-200 group border-b border-brand-neutral-100/50 last:border-0"
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors",
            conv.session_type === "voice"
              ? "bg-brand-ice text-brand-navy-600 group-hover:bg-brand-ice-dark"
              : "bg-emerald-100 text-emerald-600 group-hover:bg-emerald-200"
          )}
        >
          {conv.session_type === "voice" ? (
            <Phone size={14} strokeWidth={2.5} />
          ) : (
            <MessageSquare size={14} strokeWidth={2.5} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-brand-navy-900 truncate leading-snug">
            {getPreview(conv)}
          </p>
          <p className="text-[11px] text-brand-navy-400 mt-1 font-medium">
            {formatTime(conv.created_at)}
            {conv.session_type === "voice" && conv.duration_seconds && (
              <span className="ml-1.5">· {formatDuration(conv.duration_seconds)}</span>
            )}
          </p>
        </div>
        <ChevronRight
          size={14}
          className="flex-shrink-0 text-brand-navy-300 group-hover:text-brand-navy-500 transition-colors opacity-0 group-hover:opacity-100"
        />
      </div>
    </button>
  );

  return (
    <>
      {/* Toggle button - only visible when sidebar is closed */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => setIsOpen(true)}
            className="fixed top-5 left-5 z-40 p-2.5 rounded-full glass hover:bg-white hover:shadow-glass-hover transition-all duration-300 shadow-glass"
            aria-label="Open conversation history"
          >
            <Menu size={20} className="text-brand-navy-700" strokeWidth={2} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Overlay for mobile */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-brand-navy-900/40 backdrop-blur-sm z-30 lg:hidden"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.div
        initial={false}
        animate={{ x: isOpen ? 0 : "-100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed top-0 left-0 h-full w-80 glass border-r border-white/50 z-40 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-brand-neutral-200/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-brand-neutral-100 text-brand-navy-700">
              <History size={18} />
            </div>
            <span className="font-bold text-brand-navy-900 text-base tracking-tight">History</span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-full hover:bg-brand-neutral-100 transition-colors"
            aria-label="Close sidebar"
          >
            <X size={20} className="text-brand-navy-500" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 py-4">
          <div className="relative group">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-navy-400 group-focus-within:text-brand-brown transition-colors" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-10 pr-9 py-2.5 text-sm bg-white/50 border border-brand-neutral-200 rounded-xl focus:outline-none focus:bg-white focus:border-brand-brown/30 focus:shadow-sm transition-all duration-200 placeholder:text-brand-navy-300"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-brand-neutral-200 rounded-full transition-colors"
              >
                <X size={14} className="text-brand-navy-500" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="h-[calc(100%-8.5rem)] overflow-y-auto scrollbar-thin px-2">
          {isLoading ? (
            // Skeleton loaders
            <div className="py-2 space-y-2">
              <div className="px-4 py-2">
                <div className="h-3 bg-brand-neutral-200 rounded w-20 animate-pulse" />
              </div>
              {[...Array(5)].map((_, i) => (
                <ConversationSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12 px-6">
              <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <p className="text-red-600 text-sm font-medium mb-2">{error}</p>
              <button
                onClick={fetchConversations}
                className="text-xs text-brand-brown font-semibold hover:underline"
              >
                Try again
              </button>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-16 px-6">
              {searchQuery ? (
                <>
                  <div className="bg-brand-neutral-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search className="w-8 h-8 text-brand-navy-300" />
                  </div>
                  <p className="text-brand-navy-700 text-sm font-medium">No results found</p>
                  <p className="text-brand-navy-400 text-xs mt-1">
                    Try a different search term
                  </p>
                </>
              ) : (
                <>
                  <div className="bg-brand-neutral-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MessageSquare className="w-8 h-8 text-brand-navy-300" />
                  </div>
                  <p className="text-brand-navy-700 text-sm font-medium">No conversations yet</p>
                  <p className="text-brand-navy-400 text-xs mt-1">
                    Start venting to see your history
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="pb-4 space-y-6">
              {/* Render groups in order */}
              {groupOrder.map((groupKey) => {
                const convs = groupedConversations[groupKey];
                if (!convs || convs.length === 0) return null;

                return (
                  <div key={groupKey}>
                    <p className="px-4 py-2 text-[10px] font-bold text-brand-navy-400 uppercase tracking-widest sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-brand-neutral-100/50">
                      {groupKey}
                    </p>
                    <div className="mt-1">
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
                    <div key={groupKey}>
                      <p className="px-4 py-2 text-[10px] font-bold text-brand-navy-400 uppercase tracking-widest sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-brand-neutral-100/50">
                        {groupKey}
                      </p>
                      <div className="mt-1">
                        {convs.map(renderConversationItem)}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </motion.div>

      {/* Conversation detail modal */}
      <AnimatePresence>
        {selectedConversation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-brand-navy-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => {
              setSelectedConversation(null);
              setDeleteConfirm(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl border border-white/50"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-brand-neutral-100 bg-brand-neutral-50/50">
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center shadow-sm",
                      selectedConversation.session_type === "voice"
                        ? "bg-brand-ice text-brand-navy-600"
                        : "bg-emerald-100 text-emerald-600"
                    )}
                  >
                    {selectedConversation.session_type === "voice" ? (
                      <Phone size={24} strokeWidth={2} />
                    ) : (
                      <MessageSquare size={24} strokeWidth={2} />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-brand-navy-900 text-lg">
                      {selectedConversation.session_type === "voice"
                        ? "Voice Call"
                        : "Text Confession"}
                    </h3>
                    <p className="text-xs font-medium text-brand-navy-500">
                      {new Date(selectedConversation.created_at).toLocaleDateString([], {
                        weekday: "short",
                        month: "long",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {selectedConversation.duration_seconds && (
                        <span className="ml-2 px-2 py-0.5 rounded-full bg-brand-neutral-200/50 text-brand-navy-600">
                          {formatDuration(selectedConversation.duration_seconds)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  {selectedConversation.transcript && selectedConversation.session_type === 'voice' && clipMode === 'view' && (
                    <button
                      onClick={handleCreateClip}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-brown hover:bg-brand-brown-dark text-white rounded-lg transition-all shadow-md hover:shadow-lg active:scale-95"
                      title="Create video clip"
                    >
                      <Film size={16} />
                      <span className="hidden sm:inline">Create Clip</span>
                    </button>
                  )}
                  {selectedConversation.transcript && clipMode === 'view' && (
                    <button
                      onClick={() => handleExport(selectedConversation)}
                      className="p-2.5 hover:bg-brand-neutral-100 rounded-lg transition-colors text-brand-navy-600 hover:text-brand-navy-900"
                      title="Export transcript"
                    >
                      <Download size={20} />
                    </button>
                  )}
                  {clipMode === 'view' && (
                    <button
                      onClick={() => setDeleteConfirm(selectedConversation.id)}
                      className="p-2.5 hover:bg-red-50 rounded-lg transition-colors text-brand-navy-400 hover:text-red-500"
                      title="Delete conversation"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                  <div className="w-px h-8 bg-brand-neutral-200 mx-1" />
                  <button
                    onClick={() => {
                      setSelectedConversation(null);
                      setDeleteConfirm(null);
                      handleBackToView();
                    }}
                    className="p-2.5 hover:bg-brand-neutral-100 rounded-lg transition-colors text-brand-navy-500 hover:text-brand-navy-900"
                  >
                    <X size={22} />
                  </button>
                </div>
              </div>

              {/* Delete confirmation */}
              <AnimatePresence>
                {deleteConfirm === selectedConversation.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden bg-red-50 border-b border-red-100"
                  >
                    <div className="px-6 py-3 flex items-center justify-between">
                      <p className="text-red-700 text-sm font-medium flex items-center gap-2">
                        <AlertCircle size={16} />
                        Delete this conversation permanently?
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-3 py-1.5 text-sm text-brand-navy-600 hover:bg-white/50 rounded-lg transition-colors font-medium"
                          disabled={isDeleting}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDelete(selectedConversation.id)}
                          disabled={isDeleting}
                          className="px-4 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2 font-medium shadow-sm"
                        >
                          {isDeleting ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              Deleting...
                            </>
                          ) : (
                            "Yes, delete"
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Modal content */}
              <div className="px-8 py-6 overflow-y-auto max-h-[60vh] scrollbar-thin">
                {/* Clip mode: Select exchange */}
                {clipMode === 'select' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="flex items-center gap-3 mb-6">
                      <button
                        onClick={handleBackToView}
                        className="p-2 -ml-2 rounded-full hover:bg-brand-neutral-100 text-brand-navy-600 transition-colors"
                      >
                        <ArrowLeft size={20} />
                      </button>
                      <div>
                        <h3 className="text-lg font-bold text-brand-navy-900">Select a moment to clip</h3>
                        <p className="text-sm text-brand-navy-500">Choose an exchange to turn into a shareable video</p>
                      </div>
                    </div>
                    {clipError && (
                      <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 text-sm">
                        <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
                        <p>{clipError}</p>
                      </div>
                    )}
                    <div className="space-y-4">
                      {exchanges.map((exchange) => (
                        <button
                          key={exchange.index}
                          onClick={() => handleSelectExchange(exchange.index)}
                          className="w-full text-left p-5 bg-white border border-brand-neutral-200 hover:border-brand-brown/50 hover:shadow-md hover:scale-[1.01] rounded-2xl transition-all duration-200 group"
                        >
                          <div className="mb-3 pl-4 border-l-2 border-brand-neutral-200 group-hover:border-brand-brown/30 transition-colors">
                            <span className="text-xs text-brand-navy-500 font-bold uppercase tracking-wider mb-1 block">You</span>
                            <p className="text-brand-navy-900 text-sm leading-relaxed">{exchange.physicianText}</p>
                          </div>
                          <div className="pl-4 border-l-2 border-brand-brown/20 group-hover:border-brand-brown transition-colors">
                            <span className="text-xs text-brand-brown font-bold uppercase tracking-wider mb-1 block">Doc</span>
                            <p className="text-brand-navy-700 text-sm leading-relaxed">{exchange.docText}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Clip mode: Generating */}
                {clipMode === 'generating' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-20"
                  >
                    <div className="relative mb-8">
                      <div className="absolute inset-0 bg-brand-brown/20 blur-xl rounded-full animate-pulse"></div>
                      <Loader2 size={64} className="text-brand-brown animate-spin relative z-10" />
                    </div>
                    <h3 className="text-xl font-bold text-brand-navy-900 mb-2">Creating your clip...</h3>
                    <p className="text-brand-navy-500 text-sm">This magic takes just a moment</p>
                  </motion.div>
                )}

                {/* Clip mode: Result */}
                {clipMode === 'result' && clipUrl && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="flex items-center gap-3 mb-6">
                      <button
                        onClick={handleBackToView}
                        className="p-2 -ml-2 rounded-full hover:bg-brand-neutral-100 text-brand-navy-600 transition-colors"
                      >
                        <ArrowLeft size={20} />
                      </button>
                      <div>
                        <h3 className="text-lg font-bold text-brand-navy-900">Your clip is ready!</h3>
                        <p className="text-sm text-brand-navy-500">Download or share it with the world</p>
                      </div>
                    </div>

                    <div className="bg-black rounded-xl overflow-hidden shadow-2xl mb-8 border border-brand-neutral-200">
                      <video
                        src={clipUrl}
                        controls
                        className="w-full aspect-video"
                        autoPlay
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4">
                      <a
                        href={clipUrl}
                        download
                        className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-brand-brown hover:bg-brand-brown-dark text-white rounded-xl transition-all shadow-lg hover:shadow-xl font-medium"
                      >
                        <Download size={20} />
                        Download Video
                      </a>
                      <button
                        onClick={handleCopyClipLink}
                        className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-white border border-brand-neutral-200 hover:bg-brand-neutral-50 text-brand-navy-900 rounded-xl transition-all shadow-sm hover:shadow-md font-medium"
                      >
                        <Link2 size={20} className="text-brand-navy-500" />
                        {copiedClipLink ? "Link Copied!" : "Copy Link"}
                      </button>
                    </div>

                    <div className="mt-8 text-center">
                      <button
                        onClick={() => setClipMode('select')}
                        className="text-brand-navy-500 hover:text-brand-brown transition-colors text-sm font-medium hover:underline"
                      >
                        Create another clip from this conversation
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Default view mode */}
                {clipMode === 'view' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {selectedConversation.quotable_quote && (
                      <div className="mb-8 p-6 bg-gradient-to-br from-brand-ice/30 to-white rounded-2xl border border-brand-ice/50 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-brand-ice/20 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
                        <p className="text-xs text-brand-navy-500 font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                          <span className="w-1 h-4 bg-brand-brown rounded-full"></span>
                          Highlight
                        </p>
                        <p className="text-brand-navy-900 text-lg italic leading-relaxed font-medium">
                          "{selectedConversation.quotable_quote}"
                        </p>
                      </div>
                    )}

                    {selectedConversation.transcript ? (
                      <div>
                        {selectedConversation.quotable_quote && (
                          <div className="flex items-center gap-4 mb-6">
                            <div className="h-px bg-brand-neutral-200 flex-1"></div>
                            <span className="text-xs text-brand-navy-400 font-medium uppercase tracking-widest">Full Transcript</span>
                            <div className="h-px bg-brand-neutral-200 flex-1"></div>
                          </div>
                        )}
                        <div className="space-y-4 font-sans text-brand-navy-800 leading-relaxed">
                          {/* We'll render the transcript with some nice formatting */}
                          {selectedConversation.transcript.split('\n').map((line, i) => {
                            if (!line.trim()) return null;
                            const isYou = line.startsWith('You:');
                            return (
                              <div key={i} className={cn("p-4 rounded-xl", isYou ? "bg-brand-neutral-50 border border-brand-neutral-100" : "bg-transparent pl-4")}>
                                <p className={cn("text-sm", isYou ? "text-brand-navy-900" : "text-brand-navy-700")}>
                                  {isYou ? (
                                    <span className="font-bold text-brand-navy-500 text-xs uppercase tracking-wide block mb-1">You</span>
                                  ) : (
                                    <span className="font-bold text-brand-brown text-xs uppercase tracking-wide block mb-1">Doc</span>
                                  )}
                                  {line.replace(/^(You:|Doc:)\s*/, '')}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-brand-navy-400 opacity-60">
                        <MessageSquare size={48} className="mb-4" />
                        <p className="text-sm">No transcript available for this session</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
