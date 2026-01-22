"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import type { Call, Lead, FeaturedQuote } from "@/types/database";
import FeaturedQuotesManager from "@/components/FeaturedQuotesManager";
import QuotePreviewModal from "@/components/QuotePreviewModal";
import ConfirmDialog from "@/components/ConfirmDialog";

const CallsMap = dynamic(() => import("@/components/CallsMap"), {
  ssr: false,
  loading: () => (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
      <div className="w-8 h-8 border-4 border-gray-600 border-t-white rounded-full animate-spin mx-auto" />
    </div>
  ),
});

type Tab = "calls" | "leads" | "quotes" | "map" | "form-flow";
type QuotesFilter = "all" | "featured" | "not-featured";

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("calls");
  const [calls, setCalls] = useState<Call[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [featuredQuotes, setFeaturedQuotes] = useState<FeaturedQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [quotesFilter, setQuotesFilter] = useState<QuotesFilter>("all");
  const [addingToFeatured, setAddingToFeatured] = useState<string | null>(null);

  // Phase 5: Bulk actions and modals
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: "remove" | "bulk-remove" | "bulk-feature";
    callId?: string;
    count?: number;
  } | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/admin/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (session) {
      fetchData();
    }
  }, [session]);

  const fetchData = async () => {
    setLoading(true);
    const [callsRes, leadsRes, featuredRes] = await Promise.all([
      supabase.from("calls").select("*").order("created_at", { ascending: false }),
      supabase.from("leads").select("*").order("created_at", { ascending: false }),
      supabase.from("featured_quotes").select("*").order("display_order", { ascending: true }),
    ]);

    if (callsRes.data) setCalls(callsRes.data);
    if (leadsRes.data) setLeads(leadsRes.data);
    if (featuredRes.data) setFeaturedQuotes(featuredRes.data);
    setLoading(false);
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-600 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  // Stats
  const totalCalls = calls.length;
  const totalLeads = leads.length;
  const physicianOwners = leads.filter((l) => l.is_physician_owner).length;
  const interestedLeads = leads.filter((l) => l.interested_in_collective).length;
  const totalDuration = calls.reduce((acc, c) => acc + (c.duration_seconds || 0), 0);
  const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;

  // Filter
  const filteredCalls = calls.filter(
    (c) =>
      c.transcript?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.quotable_quote?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.ip_address?.includes(searchQuery)
  );

  const filteredLeads = leads.filter(
    (l) =>
      l.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get calls with quotes, filtered by search and featured status
  const callsWithQuotes = calls.filter((c) => c.quotable_quote);
  const featuredCallIds = new Set(featuredQuotes.map((fq) => fq.call_id));

  const filteredQuoteCalls = callsWithQuotes.filter((c) => {
    // Search filter
    const matchesSearch =
      c.quotable_quote?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.region?.toLowerCase().includes(searchQuery.toLowerCase());

    // Featured status filter
    const isFeatured = featuredCallIds.has(c.id);
    const matchesFilter =
      quotesFilter === "all" ||
      (quotesFilter === "featured" && isFeatured) ||
      (quotesFilter === "not-featured" && !isFeatured);

    return matchesSearch && matchesFilter;
  });

  // Add quote to featured list
  const addToFeatured = async (call: Call) => {
    if (!call.quotable_quote) return;
    setAddingToFeatured(call.id);
    try {
      const response = await fetch("/api/featured-quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call_id: call.id,
          quote: call.quotable_quote,
          location: [call.city, call.region].filter(Boolean).join(", ") || "Unknown",
        }),
      });
      if (response.ok) {
        await fetchData(); // Refresh data
      }
    } catch (error) {
      console.error("Failed to add to featured:", error);
    }
    setAddingToFeatured(null);
  };

  // Remove quote from featured list
  const removeFromFeatured = async (callId: string) => {
    const featuredQuote = featuredQuotes.find((fq) => fq.call_id === callId);
    if (!featuredQuote) return;
    setAddingToFeatured(callId);
    try {
      const response = await fetch(`/api/featured-quotes/${featuredQuote.id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        await fetchData(); // Refresh data
      }
    } catch (error) {
      console.error("Failed to remove from featured:", error);
    }
    setAddingToFeatured(null);
  };

  // Reorder featured quotes (for drag-drop)
  const handleReorderFeatured = async (reorderedQuotes: FeaturedQuote[]) => {
    // Optimistically update local state
    setFeaturedQuotes(reorderedQuotes);

    const orderedIds = reorderedQuotes.map((q) => q.id);
    const response = await fetch("/api/featured-quotes/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    });

    if (!response.ok) {
      // Revert on error
      await fetchData();
      throw new Error("Failed to reorder");
    }
  };

  // Remove featured quote by ID (for drag-drop manager)
  const handleRemoveFeaturedById = async (id: string) => {
    const response = await fetch(`/api/featured-quotes/${id}`, {
      method: "DELETE",
    });
    if (response.ok) {
      await fetchData();
    } else {
      throw new Error("Failed to remove");
    }
  };

  // Toggle quote selection for bulk actions
  const toggleQuoteSelection = (callId: string) => {
    setSelectedQuoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(callId)) {
        next.delete(callId);
      } else {
        next.add(callId);
      }
      return next;
    });
  };

  // Select/deselect all visible quotes
  const toggleSelectAll = () => {
    if (selectedQuoteIds.size === filteredQuoteCalls.length) {
      setSelectedQuoteIds(new Set());
    } else {
      setSelectedQuoteIds(new Set(filteredQuoteCalls.map((c) => c.id)));
    }
  };

  // Bulk feature selected quotes
  const bulkFeatureQuotes = async () => {
    setBulkProcessing(true);
    const toFeature = filteredQuoteCalls.filter(
      (c) => selectedQuoteIds.has(c.id) && !featuredCallIds.has(c.id)
    );

    for (const call of toFeature) {
      await fetch("/api/featured-quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call_id: call.id,
          quote: call.quotable_quote,
          location: [call.city, call.region].filter(Boolean).join(", ") || "Unknown",
        }),
      });
    }

    await fetchData();
    setSelectedQuoteIds(new Set());
    setBulkProcessing(false);
    setConfirmAction(null);
  };

  // Bulk remove selected quotes from featured
  const bulkRemoveQuotes = async () => {
    setBulkProcessing(true);
    const toRemove = featuredQuotes.filter((fq) =>
      fq.call_id && selectedQuoteIds.has(fq.call_id)
    );

    for (const fq of toRemove) {
      await fetch(`/api/featured-quotes/${fq.id}`, { method: "DELETE" });
    }

    await fetchData();
    setSelectedQuoteIds(new Set());
    setBulkProcessing(false);
    setConfirmAction(null);
  };

  // Handle confirm dialog actions
  const handleConfirmAction = async () => {
    if (!confirmAction) return;

    if (confirmAction.type === "remove" && confirmAction.callId) {
      await removeFromFeatured(confirmAction.callId);
    } else if (confirmAction.type === "bulk-feature") {
      await bulkFeatureQuotes();
    } else if (confirmAction.type === "bulk-remove") {
      await bulkRemoveQuotes();
    }
    setConfirmAction(null);
  };

  // Get counts for bulk actions
  const selectedNotFeaturedCount = Array.from(selectedQuoteIds).filter(
    (id) => !featuredCallIds.has(id)
  ).length;
  const selectedFeaturedCount = Array.from(selectedQuoteIds).filter((id) =>
    featuredCallIds.has(id)
  ).length;

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "-";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-gray-400">Welcome, {session.user?.name}</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/admin/login" })}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
        >
          Sign Out
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-sm">Total Calls</p>
          <p className="text-2xl font-bold text-white">{totalCalls}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-sm">Avg Duration</p>
          <p className="text-2xl font-bold text-white">{formatDuration(avgDuration)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-sm">Physician Owners</p>
          <p className="text-2xl font-bold text-white">{physicianOwners}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-sm">Interested in Collective</p>
          <p className="text-2xl font-bold text-green-400">{interestedLeads}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setActiveTab("calls")}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === "calls"
              ? "bg-white text-black"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          Calls ({calls.length})
        </button>
        <button
          onClick={() => setActiveTab("leads")}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === "leads"
              ? "bg-white text-black"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          Leads ({leads.length})
        </button>
        <button
          onClick={() => setActiveTab("quotes")}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === "quotes"
              ? "bg-white text-black"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          Quotes ({calls.filter(c => c.quotable_quote).length})
        </button>
        <button
          onClick={() => setActiveTab("map")}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === "map"
              ? "bg-white text-black"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          Map
        </button>
        <button
          onClick={() => setActiveTab("form-flow")}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === "form-flow"
              ? "bg-white text-black"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          Form Flow
        </button>
      </div>

      {/* Search */}
      {activeTab !== "map" && activeTab !== "form-flow" && (
        <div className="mb-6 flex flex-wrap gap-4 items-center">
          <input
            type="text"
            placeholder={
              activeTab === "calls"
                ? "Search transcripts, quotes, IPs..."
                : activeTab === "quotes"
                ? "Search quotes, locations..."
                : "Search names, emails..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-md px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600"
          />
          {activeTab === "quotes" && (
            <div className="flex flex-wrap gap-2 items-center">
              <button
                onClick={() => setQuotesFilter("all")}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                  quotesFilter === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setQuotesFilter("featured")}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                  quotesFilter === "featured"
                    ? "bg-green-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                Featured ({featuredQuotes.length})
              </button>
              <button
                onClick={() => setQuotesFilter("not-featured")}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                  quotesFilter === "not-featured"
                    ? "bg-orange-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                Not Featured
              </button>

              {/* Preview Button */}
              <button
                onClick={() => setShowPreview(true)}
                className="px-3 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Preview
              </button>
            </div>
          )}
        </div>
      )}

      {/* Calls Table */}
      {activeTab === "calls" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Date</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Duration</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Recording</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Transcript</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Quote</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">IP</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-gray-500 py-8">
                    No calls found
                  </td>
                </tr>
              ) : (
                filteredCalls.map((call) => (
                  <tr key={call.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-gray-300 text-sm">
                      <div className="flex items-center gap-2">
                        {formatDate(call.created_at)}
                        {call.is_sample && (
                          <span className="bg-orange-500/20 text-orange-400 text-xs px-1.5 py-0.5 rounded">
                            Sample
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-sm">
                      {formatDuration(call.duration_seconds)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {call.recording_url ? (
                        <a
                          href={call.recording_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-green-400 hover:text-green-300"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                          <span>Play</span>
                        </a>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm max-w-xs">
                      {call.transcript ? (
                        <span className="text-gray-300 line-clamp-2 text-xs">
                          {call.transcript.slice(0, 100)}{call.transcript.length > 100 ? "..." : ""}
                        </span>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm max-w-xs">
                      {call.quotable_quote ? (
                        <span className="text-green-400 italic line-clamp-2">
                          &ldquo;{call.quotable_quote}&rdquo;
                        </span>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm font-mono">
                      {call.ip_address || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedCall(call)}
                        className="text-blue-400 hover:text-blue-300 text-sm"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Leads Table */}
      {activeTab === "leads" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Date</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Name</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Email</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Physician Owner</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Interested</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-gray-500 py-8">
                    No leads found
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-gray-300 text-sm">
                      {formatDate(lead.created_at)}
                    </td>
                    <td className="px-4 py-3 text-white text-sm">
                      {lead.name || "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-sm">
                      {lead.email || "-"}
                    </td>
                    <td className="px-4 py-3">
                      {lead.is_physician_owner ? (
                        <span className="text-green-400 text-sm">Yes</span>
                      ) : (
                        <span className="text-gray-500 text-sm">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lead.interested_in_collective ? (
                        <span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded">
                          Yes
                        </span>
                      ) : (
                        <span className="text-gray-500 text-sm">No</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Quotes Tab */}
      {activeTab === "quotes" && quotesFilter === "featured" && (
        <FeaturedQuotesManager
          quotes={featuredQuotes}
          onReorder={handleReorderFeatured}
          onRemove={handleRemoveFeaturedById}
        />
      )}

      {/* Bulk Action Toolbar */}
      {activeTab === "quotes" && quotesFilter !== "featured" && selectedQuoteIds.size > 0 && (
        <div className="mb-4 p-3 bg-gray-800 border border-gray-700 rounded-lg flex items-center gap-4">
          <span className="text-gray-300 text-sm">
            {selectedQuoteIds.size} selected
          </span>
          {selectedNotFeaturedCount > 0 && (
            <button
              onClick={() =>
                setConfirmAction({ type: "bulk-feature", count: selectedNotFeaturedCount })
              }
              disabled={bulkProcessing}
              className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 text-white rounded transition-colors disabled:opacity-50"
            >
              Feature {selectedNotFeaturedCount}
            </button>
          )}
          {selectedFeaturedCount > 0 && (
            <button
              onClick={() =>
                setConfirmAction({ type: "bulk-remove", count: selectedFeaturedCount })
              }
              disabled={bulkProcessing}
              className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white rounded transition-colors disabled:opacity-50"
            >
              Remove {selectedFeaturedCount}
            </button>
          )}
          <button
            onClick={() => setSelectedQuoteIds(new Set())}
            className="text-gray-400 hover:text-white text-sm ml-auto"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Quotes Table (All or Not Featured) */}
      {activeTab === "quotes" && quotesFilter !== "featured" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selectedQuoteIds.size === filteredQuoteCalls.length && filteredQuoteCalls.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-green-500 focus:ring-green-500 focus:ring-offset-gray-900"
                  />
                </th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Date</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Quote</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Location</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Frustration</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Status</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuoteCalls.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-gray-500 py-8">
                    No quotes found
                  </td>
                </tr>
              ) : (
                filteredQuoteCalls.map((call) => {
                  const isFeatured = featuredCallIds.has(call.id);
                  const featuredQuote = featuredQuotes.find((fq) => fq.call_id === call.id);
                  const isLoading = addingToFeatured === call.id;
                  const isSelected = selectedQuoteIds.has(call.id);

                  return (
                    <tr
                      key={call.id}
                      className={`border-b border-gray-800 hover:bg-gray-800/50 ${
                        isFeatured ? "bg-green-900/10" : ""
                      } ${isSelected ? "bg-blue-900/20" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleQuoteSelection(call.id)}
                          className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-green-500 focus:ring-green-500 focus:ring-offset-gray-900"
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-sm whitespace-nowrap">
                        {formatDate(call.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm max-w-md">
                        <span className="text-green-400 italic">
                          &ldquo;{call.quotable_quote}&rdquo;
                        </span>
                        {call.quotable_quote && call.quotable_quote.length > 200 && (
                          <span className="ml-2 text-yellow-500 text-xs" title="Quote may be too long for display">
                            (long)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-sm whitespace-nowrap">
                        {[call.city, call.region].filter(Boolean).join(", ") || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {call.frustration_score !== null ? (
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              call.frustration_score >= 7
                                ? "bg-red-500/20 text-red-400"
                                : call.frustration_score >= 4
                                ? "bg-yellow-500/20 text-yellow-400"
                                : "bg-green-500/20 text-green-400"
                            }`}
                          >
                            {call.frustration_score}/10
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {isFeatured ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                              />
                            </svg>
                            Featured #{featuredQuote?.display_order}
                          </span>
                        ) : (
                          <span className="text-gray-500 text-xs">Not featured</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isFeatured ? (
                          <button
                            onClick={() => removeFromFeatured(call.id)}
                            disabled={isLoading}
                            className="text-red-400 hover:text-red-300 text-sm disabled:opacity-50"
                          >
                            {isLoading ? "..." : "Remove"}
                          </button>
                        ) : (
                          <button
                            onClick={() => addToFeatured(call)}
                            disabled={isLoading}
                            className="text-green-400 hover:text-green-300 text-sm disabled:opacity-50"
                          >
                            {isLoading ? "..." : "Feature"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Map */}
      {activeTab === "map" && <CallsMap calls={calls} />}

      {/* Form Flow */}
      {activeTab === "form-flow" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Post-Call Form Decision Tree</h3>
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Tree visualization */}
              <div className="flex flex-col items-center">
                {/* Q1: Physician Owner */}
                <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 text-center max-w-md">
                  <p className="text-blue-400 text-xs uppercase tracking-wide mb-1">Question 1</p>
                  <p className="text-white font-medium">Are you a US independent physician owner?</p>
                </div>

                <div className="flex items-center gap-16 mt-4">
                  {/* Yes branch */}
                  <div className="flex flex-col items-center">
                    <div className="w-px h-8 bg-green-600"></div>
                    <span className="text-green-400 text-sm font-medium mb-2">Yes</span>
                    <div className="w-px h-8 bg-gray-600"></div>

                    {/* Q2: Collective (for physician owners) */}
                    <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-4 text-center max-w-sm mt-2">
                      <p className="text-purple-400 text-xs uppercase tracking-wide mb-1">Question 2</p>
                      <p className="text-white font-medium text-sm">Interested in joining a collective?</p>
                    </div>

                    <div className="flex items-center gap-8 mt-4">
                      {/* Yes - Contact form */}
                      <div className="flex flex-col items-center">
                        <div className="w-px h-6 bg-green-600"></div>
                        <span className="text-green-400 text-xs mb-2">Yes</span>
                        <div className="bg-green-900/30 border border-green-700 rounded-lg p-3 text-center">
                          <p className="text-green-400 text-xs">Contact Form</p>
                          <p className="text-gray-400 text-xs mt-1">Name & Email</p>
                        </div>
                        <div className="w-px h-4 bg-gray-600 mt-2"></div>
                        <div className="bg-gray-800 rounded-lg p-2 text-center mt-2">
                          <p className="text-gray-300 text-xs">Thank You</p>
                        </div>
                      </div>

                      {/* No - Thank you */}
                      <div className="flex flex-col items-center">
                        <div className="w-px h-6 bg-gray-500"></div>
                        <span className="text-gray-400 text-xs mb-2">No</span>
                        <div className="bg-gray-800 rounded-lg p-3 text-center">
                          <p className="text-gray-300 text-xs">Thank You</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* No branch */}
                  <div className="flex flex-col items-center">
                    <div className="w-px h-8 bg-gray-500"></div>
                    <span className="text-gray-400 text-sm font-medium mb-2">No</span>
                    <div className="w-px h-8 bg-gray-600"></div>

                    {/* Q2: Works at clinic */}
                    <div className="bg-orange-900/30 border border-orange-700 rounded-lg p-4 text-center max-w-sm mt-2">
                      <p className="text-orange-400 text-xs uppercase tracking-wide mb-1">Question 2</p>
                      <p className="text-white font-medium text-sm">Do you work at an independent clinic?</p>
                    </div>

                    <div className="flex items-center gap-8 mt-4">
                      {/* Yes - Continue to collective */}
                      <div className="flex flex-col items-center">
                        <div className="w-px h-6 bg-green-600"></div>
                        <span className="text-green-400 text-xs mb-2">Yes</span>
                        <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-3 text-center">
                          <p className="text-purple-400 text-xs">Collective Question</p>
                          <p className="text-gray-400 text-xs mt-1">→ Same flow as left</p>
                        </div>
                      </div>

                      {/* No - Thank you */}
                      <div className="flex flex-col items-center">
                        <div className="w-px h-6 bg-gray-500"></div>
                        <span className="text-gray-400 text-xs mb-2">No</span>
                        <div className="bg-gray-800 rounded-lg p-3 text-center">
                          <p className="text-gray-300 text-xs">Thank You</p>
                          <p className="text-gray-500 text-xs mt-1">(Not target audience)</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="mt-8 pt-6 border-t border-gray-800">
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-3">Lead Classification</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded"></div>
                    <span className="text-gray-400">High Value: Physician owner + interested</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-purple-500 rounded"></div>
                    <span className="text-gray-400">Medium: Clinic worker + interested</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-gray-500 rounded"></div>
                    <span className="text-gray-400">Low: Not interested / Not target</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Call Detail Modal */}
      {selectedCall && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Call Details</h2>
              <button
                onClick={() => setSelectedCall(null)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Date:</span>{" "}
                  <span className="text-white">{formatDate(selectedCall.created_at)}</span>
                </div>
                <div>
                  <span className="text-gray-400">Duration:</span>{" "}
                  <span className="text-white">{formatDuration(selectedCall.duration_seconds)}</span>
                </div>
                <div>
                  <span className="text-gray-400">IP:</span>{" "}
                  <span className="text-white font-mono">{selectedCall.ip_address || "-"}</span>
                </div>
              </div>

              {selectedCall.quotable_quote && (
                <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
                  <p className="text-green-400 text-sm font-medium mb-1">Quotable Quote</p>
                  <p className="text-white italic">&ldquo;{selectedCall.quotable_quote}&rdquo;</p>
                </div>
              )}

              <div>
                <p className="text-gray-400 text-sm font-medium mb-2">Transcript</p>
                <div className="bg-gray-800 rounded-lg p-4 max-h-64 overflow-y-auto">
                  {selectedCall.transcript ? (
                    <pre className="text-gray-300 text-sm whitespace-pre-wrap font-sans">
                      {selectedCall.transcript}
                    </pre>
                  ) : (
                    <p className="text-gray-500 text-sm">No transcript available</p>
                  )}
                </div>
              </div>

              {selectedCall.recording_url && (
                <div>
                  <p className="text-gray-400 text-sm font-medium mb-2">Recording</p>
                  <audio controls className="w-full" src={selectedCall.recording_url}>
                    Your browser does not support the audio element.
                  </audio>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <QuotePreviewModal
          quotes={featuredQuotes}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Confirmation Dialog */}
      {confirmAction && (
        <ConfirmDialog
          title={
            confirmAction.type === "remove"
              ? "Remove from Featured"
              : confirmAction.type === "bulk-feature"
              ? `Feature ${confirmAction.count} Quotes`
              : `Remove ${confirmAction.count} Quotes`
          }
          message={
            confirmAction.type === "remove"
              ? "Are you sure you want to remove this quote from the featured list?"
              : confirmAction.type === "bulk-feature"
              ? `This will add ${confirmAction.count} quotes to the featured list.`
              : `This will remove ${confirmAction.count} quotes from the featured list.`
          }
          confirmLabel={
            confirmAction.type === "bulk-feature" ? "Feature" : "Remove"
          }
          variant={confirmAction.type === "bulk-feature" ? "warning" : "danger"}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmAction(null)}
          isLoading={bulkProcessing}
        />
      )}
    </div>
  );
}
