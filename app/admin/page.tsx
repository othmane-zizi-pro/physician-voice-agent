"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import type { Call, Lead, FeaturedQuote, LinkClick, PageVisit, User } from "@/types/database";
import FeaturedQuotesManager from "@/components/FeaturedQuotesManager";
import QuotePreviewModal from "@/components/QuotePreviewModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CallsMap = dynamic(() => import("@/components/CallsMap"), {
  ssr: false,
  loading: () => (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
      <div className="w-8 h-8 border-4 border-gray-600 border-t-white rounded-full animate-spin mx-auto" />
    </div>
  ),
});

type Tab = "calls" | "leads" | "quotes" | "map" | "form-flow" | "clicks" | "visits" | "users";
type QuotesFilter = "all" | "featured" | "not-featured";
type SessionTypeFilter = "all" | "voice" | "text";

interface UserWithStats extends User {
  conversation_count: number;
}

interface UserStats {
  totalUsers: number;
  newToday: number;
  newThisWeek: number;
  activeUsers: number;
  aiMemoryEnabled: number;
  verifiedUsers: number;
  roleBreakdown: Record<string, number>;
  workplaceBreakdown: Record<string, number>;
  authBreakdown: Record<string, number>;
  topCountries: { country: string; count: number }[];
}

interface UserDetail extends User {
  conversation_count: number;
  summary_count: number;
  avg_frustration_score: number | null;
  last_conversation_at: string | null;
}

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

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("calls");
  const [calls, setCalls] = useState<Call[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [featuredQuotes, setFeaturedQuotes] = useState<FeaturedQuote[]>([]);
  const [linkClicks, setLinkClicks] = useState<LinkClick[]>([]);
  const [pageVisits, setPageVisits] = useState<PageVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [quotesFilter, setQuotesFilter] = useState<QuotesFilter>("all");
  const [sessionTypeFilter, setSessionTypeFilter] = useState<SessionTypeFilter>("all");
  const [addingToFeatured, setAddingToFeatured] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Users state
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [userConversations, setUserConversations] = useState<Call[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userRoleFilter, setUserRoleFilter] = useState<string>("all");
  const [userWorkplaceFilter, setUserWorkplaceFilter] = useState<string>("all");
  const [userSearchQuery, setUserSearchQuery] = useState("");

  // Bulk actions and modals
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
    } else if (status === "authenticated" && session?.user?.email) {
      // Check for @meroka.com domain
      const domain = session.user.email.split("@")[1];
      if (domain !== "meroka.com") {
        signOut({ callbackUrl: "/admin/login?error=AccessDenied" });
      }
    }
  }, [status, session, router]);

  useEffect(() => {
    if (session) {
      fetchData();
    }
  }, [session]);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh || !session) return;

    const interval = setInterval(() => {
      fetchData();
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, session]);

  // Fetch users when tab becomes active or filters change
  useEffect(() => {
    if (activeTab === "users" && session) {
      fetchUsers();
    }
  }, [activeTab, userSearchQuery, userRoleFilter, userWorkplaceFilter, session]);

  const fetchData = async () => {
    setLoading(true);
    const [callsRes, leadsRes, featuredRes, clicksRes, visitsRes] = await Promise.all([
      supabase.from("calls").select("*").order("created_at", { ascending: false }),
      supabase.from("leads").select("*").order("created_at", { ascending: false }),
      supabase.from("featured_quotes").select("*").order("display_order", { ascending: true }),
      supabase.from("link_clicks").select("*").order("created_at", { ascending: false }),
      supabase.from("page_visits").select("*").order("created_at", { ascending: false }).limit(500),
    ]);

    if (callsRes.data) setCalls(callsRes.data);
    if (leadsRes.data) setLeads(leadsRes.data);
    if (featuredRes.data) setFeaturedQuotes(featuredRes.data);
    if (clicksRes.data) setLinkClicks(clicksRes.data);
    if (visitsRes.data) setPageVisits(visitsRes.data);
    setLastRefresh(new Date());
    setLoading(false);
  };

  // Fetch users data
  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams();
      if (userSearchQuery) params.set("search", userSearchQuery);
      if (userRoleFilter !== "all") params.set("roleType", userRoleFilter);
      if (userWorkplaceFilter !== "all") params.set("workplaceType", userWorkplaceFilter);
      params.set("limit", "100");

      const [usersRes, statsRes] = await Promise.all([
        fetch(`/api/admin/users?${params}`),
        fetch("/api/admin/users/stats"),
      ]);

      const usersData = await usersRes.json();
      const statsData = await statsRes.json();

      if (usersData.users) setUsers(usersData.users);
      if (!statsData.error) setUserStats(statsData);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    }
    setUsersLoading(false);
  };

  // Fetch user detail and conversations
  const fetchUserDetail = async (userId: string) => {
    try {
      const [detailRes, convRes] = await Promise.all([
        fetch(`/api/admin/users/${userId}`),
        fetch(`/api/admin/users/${userId}/conversations?limit=50`),
      ]);

      const detailData = await detailRes.json();
      const convData = await convRes.json();

      if (detailData.user) setSelectedUser(detailData.user);
      if (convData.conversations) setUserConversations(convData.conversations);
    } catch (error) {
      console.error("Failed to fetch user detail:", error);
    }
  };

  // Generate hourly traffic data for chart
  const getHourlyTrafficData = () => {
    const now = new Date();
    const hours: { hour: string; count: number; label: string }[] = [];

    // Generate last 24 hours
    for (let i = 23; i >= 0; i--) {
      const hourStart = new Date(now);
      hourStart.setHours(now.getHours() - i, 0, 0, 0);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hourStart.getHours() + 1);

      const count = pageVisits.filter((v) => {
        const visitDate = new Date(v.created_at);
        return visitDate >= hourStart && visitDate < hourEnd;
      }).length;

      const label = hourStart.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
      hours.push({ hour: hourStart.toISOString(), count, label });
    }

    return hours;
  };

  // Stats
  const totalCalls = calls.length;
  const voiceCalls = calls.filter((c) => c.session_type !== "text").length;
  const textConfessions = calls.filter((c) => c.session_type === "text").length;
  const physicianOwners = leads.filter((l) => l.is_physician_owner).length;
  const interestedLeads = leads.filter((l) => l.interested_in_collective).length;
  const totalDuration = calls.reduce((acc, c) => acc + (c.duration_seconds || 0), 0);
  const avgDuration = voiceCalls > 0 ? Math.round(totalDuration / voiceCalls) : 0;

  // Filter
  const filteredCalls = calls.filter((c) => {
    // Session type filter
    if (sessionTypeFilter === "voice" && c.session_type === "text") return false;
    if (sessionTypeFilter === "text" && c.session_type !== "text") return false;

    // Search filter
    return (
      c.transcript?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.quotable_quote?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.ip_address?.includes(searchQuery)
    );
  });

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

  // Get counts for bulk actions
  const selectedNotFeaturedCount = Array.from(selectedQuoteIds).filter(
    (id) => !featuredCallIds.has(id)
  ).length;
  const selectedFeaturedCount = Array.from(selectedQuoteIds).filter((id) =>
    featuredCallIds.has(id)
  ).length;

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

  return (
    <div className="min-h-screen p-8 relative overflow-hidden">
      {/* Background is handled by layout.tsx */}

      {/* Header */}
      <div className="flex items-center justify-between mb-8 relative z-10">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy-900">Admin Dashboard</h1>
          <p className="text-brand-navy-600">Welcome, {session?.user?.name}</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/admin/login" })}
          className="px-4 py-2 bg-white/50 backdrop-blur-sm hover:bg-white text-brand-navy-700 rounded-lg transition-colors border border-brand-neutral-200 shadow-sm"
        >
          Sign Out
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8 relative z-10">
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="glass p-5 rounded-2xl border border-white/20 shadow-glass"
          >
            <p className="text-brand-navy-600 text-sm font-medium uppercase tracking-wider">Total Sessions</p>
            <p className="text-3xl font-bold text-brand-navy-900 mt-1">{totalCalls}</p>
            <div className="flex gap-2 mt-2">
              <span className="text-[10px] bg-brand-ice px-2 py-0.5 rounded-full text-brand-navy-600 font-bold">{voiceCalls} Voice</span>
              <span className="text-[10px] bg-amber-100 px-2 py-0.5 rounded-full text-amber-700 font-bold">{textConfessions} Text</span>
            </div>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="glass p-5 rounded-2xl border border-white/20 shadow-glass"
          >
            <p className="text-brand-navy-600 text-sm font-medium uppercase tracking-wider">Avg Duration</p>
            <p className="text-3xl font-bold text-brand-navy-900 mt-1">{formatDuration(avgDuration)}</p>
            <p className="text-xs text-brand-navy-400 mt-1 font-medium">voice calls only</p>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="glass p-5 rounded-2xl border border-white/20 shadow-glass"
          >
            <p className="text-brand-navy-600 text-sm font-medium uppercase tracking-wider">Confessions</p>
            <p className="text-3xl font-bold text-brand-brown mt-1">{textConfessions}</p>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="glass p-5 rounded-2xl border border-white/20 shadow-glass"
          >
            <p className="text-brand-navy-600 text-sm font-medium uppercase tracking-wider">Physicians</p>
            <p className="text-3xl font-bold text-brand-navy-900 mt-1">{physicianOwners}</p>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="glass p-5 rounded-2xl border border-white/20 shadow-glass"
          >
            <p className="text-brand-navy-600 text-sm font-medium uppercase tracking-wider">Leads</p>
            <p className="text-3xl font-bold text-emerald-600 mt-1">{interestedLeads}</p>
          </motion.div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 relative z-10 p-1 bg-white/30 backdrop-blur-md rounded-xl border border-white/40 w-fit shadow-sm">
        <button
          onClick={() => setActiveTab("calls")}
          className={cn(
            "px-4 py-2 rounded-lg transition-all duration-200 text-sm font-medium",
            activeTab === "calls"
              ? "bg-white text-brand-navy-900 shadow-sm"
              : "text-brand-navy-600 hover:bg-white/50"
          )}
        >
          Calls ({calls.length})
        </button>
        <button
          onClick={() => setActiveTab("leads")}
          className={cn(
            "px-4 py-2 rounded-lg transition-all duration-200 text-sm font-medium",
            activeTab === "leads"
              ? "bg-white text-brand-navy-900 shadow-sm"
              : "text-brand-navy-600 hover:bg-white/50"
          )}
        >
          Leads ({leads.length})
        </button>
        <button
          onClick={() => setActiveTab("quotes")}
          className={cn(
            "px-4 py-2 rounded-lg transition-all duration-200 text-sm font-medium",
            activeTab === "quotes"
              ? "bg-white text-brand-navy-900 shadow-sm"
              : "text-brand-navy-600 hover:bg-white/50"
          )}
        >
          Quotes ({calls.filter(c => c.quotable_quote).length})
        </button>
        <button
          onClick={() => setActiveTab("map")}
          className={cn(
            "px-4 py-2 rounded-lg transition-all duration-200 text-sm font-medium",
            activeTab === "map"
              ? "bg-white text-brand-navy-900 shadow-sm"
              : "text-brand-navy-600 hover:bg-white/50"
          )}
        >
          Map
        </button>
        <button
          onClick={() => setActiveTab("form-flow")}
          className={cn(
            "px-4 py-2 rounded-lg transition-all duration-200 text-sm font-medium",
            activeTab === "form-flow"
              ? "bg-white text-brand-navy-900 shadow-sm"
              : "text-brand-navy-600 hover:bg-white/50"
          )}
        >
          Form Flow
        </button>
        <button
          onClick={() => setActiveTab("clicks")}
          className={cn(
            "px-4 py-2 rounded-lg transition-all duration-200 text-sm font-medium",
            activeTab === "clicks"
              ? "bg-white text-brand-navy-900 shadow-sm"
              : "text-brand-navy-600 hover:bg-white/50"
          )}
        >
          Clicks ({linkClicks.length})
        </button>
        <button
          onClick={() => setActiveTab("visits")}
          className={cn(
            "px-4 py-2 rounded-lg transition-all duration-200 text-sm font-medium",
            activeTab === "visits"
              ? "bg-white text-brand-navy-900 shadow-sm"
              : "text-brand-navy-600 hover:bg-white/50"
          )}
        >
          Traffic ({pageVisits.length})
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={cn(
            "px-4 py-2 rounded-lg transition-all duration-200 text-sm font-medium",
            activeTab === "users"
              ? "bg-white text-brand-navy-900 shadow-sm"
              : "text-brand-navy-600 hover:bg-white/50"
          )}
        >
          Users {userStats ? `(${userStats.totalUsers})` : ""}
        </button>
      </div>

      {/* Search */}
      {activeTab !== "map" && activeTab !== "form-flow" && activeTab !== "clicks" && activeTab !== "visits" && (
        <div className="mb-6 flex flex-wrap gap-4 items-center relative z-10">
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
            className="w-full max-w-md px-4 py-2.5 bg-white/50 backdrop-blur-sm border border-brand-neutral-200 rounded-xl text-brand-navy-900 placeholder-brand-navy-400 focus:outline-none focus:border-brand-brown focus:ring-2 focus:ring-brand-brown/20 shadow-sm transition-all"
          />
          {activeTab === "calls" && (
            <div className="flex gap-2">
              <button
                onClick={() => setSessionTypeFilter("all")}
                className={cn(
                  "px-3 py-2 text-sm rounded-lg transition-all duration-200 border",
                  sessionTypeFilter === "all"
                    ? "bg-brand-navy-900 text-white border-brand-navy-900 shadow-sm"
                    : "bg-white/50 text-brand-navy-600 border-brand-neutral-200 hover:bg-white"
                )}
              >
                All ({totalCalls})
              </button>
              <button
                onClick={() => setSessionTypeFilter("voice")}
                className={cn(
                  "px-3 py-2 text-sm rounded-lg transition-all duration-200 border",
                  sessionTypeFilter === "voice"
                    ? "bg-brand-navy-900 text-white border-brand-navy-900 shadow-sm"
                    : "bg-white/50 text-brand-navy-600 border-brand-neutral-200 hover:bg-white"
                )}
              >
                Voice ({voiceCalls})
              </button>
              <button
                onClick={() => setSessionTypeFilter("text")}
                className={cn(
                  "px-3 py-2 text-sm rounded-lg transition-all duration-200 border",
                  sessionTypeFilter === "text"
                    ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                    : "bg-white/50 text-brand-navy-600 border-brand-neutral-200 hover:bg-white"
                )}
              >
                Text ({textConfessions})
              </button>
            </div>
          )}
        </div>
      )}

      {/* Calls Table */}
      {activeTab === "calls" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl overflow-hidden relative z-10 shadow-glass border border-white/40"
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand-neutral-200/50 bg-brand-neutral-50/50">
                <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Date</th>
                <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Type</th>
                <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Duration</th>
                <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Recording</th>
                <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Content</th>
                <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Quote</th>
                <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">IP</th>
                <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-brand-navy-400 py-12">
                    <p className="font-medium">No sessions found</p>
                  </td>
                </tr>
              ) : (
                filteredCalls.map((call) => (
                  <tr key={call.id} className="border-b border-brand-neutral-100 hover:bg-brand-ice/30 transition-colors">
                    <td className="px-6 py-4 text-brand-navy-900 text-sm">
                      <div className="flex items-center gap-2">
                        {formatDate(call.created_at)}
                        {call.is_sample && (
                          <span className="bg-orange-100 text-orange-600 border border-orange-200 text-[10px] px-1.5 py-0.5 rounded font-medium">
                            Sample
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-bold shadow-sm",
                        call.session_type === "text"
                          ? "bg-amber-100 text-amber-700 border border-amber-200"
                          : "bg-brand-ice text-brand-navy-600 border border-brand-navy-200"
                      )}>
                        {call.session_type === "text" ? "Text" : "Voice"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-brand-navy-700 text-sm font-medium">
                      {call.session_type === "text" ? (
                        <span className="text-brand-navy-300">-</span>
                      ) : (
                        formatDuration(call.duration_seconds)
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {call.session_type === "text" ? (
                        <span className="text-brand-navy-300 text-xs">N/A</span>
                      ) : call.recording_url ? (
                        <a
                          href={call.recording_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-brown text-white rounded-lg hover:bg-brand-brown-dark transition-colors shadow-sm text-xs font-medium"
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                          <span>Play</span>
                        </a>
                      ) : (
                        <span className="text-brand-navy-300">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm max-w-xs">
                      {call.transcript ? (
                        <span className={cn("line-clamp-2 text-xs leading-relaxed", call.session_type === "text" ? "text-amber-800 font-medium" : "text-brand-navy-600")}>
                          {call.transcript.slice(0, 100)}{call.transcript.length > 100 ? "..." : ""}
                        </span>
                      ) : (
                        <span className="text-brand-navy-300">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm max-w-xs">
                      {call.quotable_quote ? (
                        <span className="text-brand-navy-800 italic line-clamp-2 font-medium bg-brand-neutral-100/50 p-1.5 rounded-lg border border-brand-neutral-200/50">
                          &ldquo;{call.quotable_quote}&rdquo;
                        </span>
                      ) : (
                        <span className="text-brand-navy-300">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-brand-navy-400 text-xs font-mono">
                      {call.ip_address || "-"}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setSelectedCall(call)}
                        className="text-brand-brown hover:text-brand-brown-dark text-sm font-medium hover:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </motion.div>
      )}

      {/* Leads Table */}
      {activeTab === "leads" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl overflow-hidden relative z-10 shadow-glass border border-white/40"
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand-neutral-200/50 bg-brand-neutral-50/50">
                <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Date</th>
                <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Name</th>
                <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Email</th>
                <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Physician Owner</th>
                <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Collective</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-brand-navy-400 py-12">
                    <p className="font-medium">No leads found</p>
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} className="border-b border-brand-neutral-100 hover:bg-brand-ice/30 transition-colors">
                    <td className="px-6 py-4 text-brand-navy-900 text-sm">{formatDate(lead.created_at)}</td>
                    <td className="px-6 py-4 text-brand-navy-900 text-sm font-medium">{lead.name || "-"}</td>
                    <td className="px-6 py-4 text-brand-navy-900 text-sm">{lead.email || "-"}</td>
                    <td className="px-6 py-4 text-sm">
                      {lead.is_physician_owner ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                          Yes
                        </span>
                      ) : (
                        <span className="text-brand-navy-300">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {lead.interested_in_collective ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-brand-brown/10 text-brand-brown border border-brand-brown/20">
                          Yes
                        </span>
                      ) : (
                        <span className="text-brand-navy-300">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </motion.div>
      )}

      {/* Featured Quotes */}
      {activeTab === "quotes" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Featured List */}
            <FeaturedQuotesManager
              quotes={featuredQuotes}
              onReorder={handleReorderFeatured}
              onRemove={handleRemoveFeaturedById}
            />

            {/* Quote Candidates */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-brand-navy-900">Add Quotes</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setQuotesFilter("all")}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded-lg border transition-all",
                      quotesFilter === "all"
                        ? "bg-brand-navy-900 text-white border-brand-navy-900"
                        : "bg-white text-brand-navy-600 border-brand-neutral-200"
                    )}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setQuotesFilter("not-featured")}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded-lg border transition-all",
                      quotesFilter === "not-featured"
                        ? "bg-brand-navy-900 text-white border-brand-navy-900"
                        : "bg-white text-brand-navy-600 border-brand-neutral-200"
                    )}
                  >
                    Unfeatured
                  </button>
                </div>
              </div>

              {/* Bulk Actions Bar */}
              {selectedQuoteIds.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-brand-brown/10 border border-brand-brown/20 rounded-xl flex items-center justify-between"
                >
                  <span className="text-sm font-medium text-brand-brown">
                    {selectedQuoteIds.size} selected
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmAction({ type: "bulk-feature", count: selectedNotFeaturedCount })}
                      disabled={selectedNotFeaturedCount === 0}
                      className="px-3 py-1.5 text-xs font-bold bg-brand-brown text-white rounded-lg shadow-sm hover:bg-brand-brown-dark disabled:opacity-50"
                    >
                      Feature ({selectedNotFeaturedCount})
                    </button>
                    <button
                      onClick={() => setConfirmAction({ type: "bulk-remove", count: selectedFeaturedCount })}
                      disabled={selectedFeaturedCount === 0}
                      className="px-3 py-1.5 text-xs font-bold bg-red-100 text-red-700 border border-red-200 rounded-lg shadow-sm hover:bg-red-200 disabled:opacity-50"
                    >
                      Remove ({selectedFeaturedCount})
                    </button>
                  </div>
                </motion.div>
              )}

              <div className="glass rounded-xl p-4 shadow-glass border border-white/40 max-h-[600px] overflow-y-auto">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-brand-neutral-100">
                  <p className="text-xs font-bold text-brand-navy-500 uppercase tracking-wider">
                    {filteredQuoteCalls.length} candidates
                  </p>
                  <button
                    onClick={toggleSelectAll}
                    className="text-xs text-brand-brown font-medium hover:underline"
                  >
                    {selectedQuoteIds.size === filteredQuoteCalls.length ? "Deselect All" : "Select All"}
                  </button>
                </div>

                <div className="space-y-3">
                  {filteredQuoteCalls.map((call) => {
                    const isFeatured = featuredCallIds.has(call.id);
                    const isSelected = selectedQuoteIds.has(call.id);

                    return (
                      <div
                        key={call.id}
                        className={cn(
                          "p-4 rounded-xl border transition-all cursor-pointer relative group",
                          isFeatured
                            ? "bg-emerald-50/50 border-emerald-200"
                            : isSelected
                              ? "bg-brand-brown/5 border-brand-brown/30"
                              : "bg-white/40 border-white/60 hover:border-brand-brown/30 hover:bg-white/60"
                        )}
                        onClick={() => toggleQuoteSelection(call.id)}
                      >
                        {/* Selection Checkbox */}
                        <div className="absolute top-4 right-4">
                          <div className={cn(
                            "w-5 h-5 rounded-md border flex items-center justify-center transition-colors",
                            isSelected
                              ? "bg-brand-brown border-brand-brown text-white"
                              : "border-brand-neutral-300 bg-white"
                          )}>
                            {isSelected && (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>

                        <p className="text-brand-navy-900 italic pr-8 line-clamp-3">
                          &ldquo;{call.quotable_quote}&rdquo;
                        </p>
                        <div className="flex items-center gap-2 mt-3 text-xs">
                          <span className="font-bold text-brand-navy-600">
                            {call.city || "Unknown"}, {call.region || ""}
                          </span>
                          <span className="text-brand-navy-400">•</span>
                          <span className="text-brand-navy-500">{formatDate(call.created_at)}</span>
                        </div>

                        <div className="mt-3 flex gap-2">
                          {!isFeatured && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                addToFeatured(call);
                              }}
                              disabled={!!addingToFeatured}
                              className="text-xs px-3 py-1.5 bg-brand-brown text-white rounded-lg hover:bg-brand-brown-dark transition-colors shadow-sm font-medium z-10 relative"
                            >
                              {addingToFeatured === call.id ? "Adding..." : "Feature This"}
                            </button>
                          )}
                          {isFeatured && (
                            <span className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md font-bold flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              Featured
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map */}
      {activeTab === "map" && <CallsMap calls={calls} />}

      {activeTab === "form-flow" && (
        <div className="bg-white/50 backdrop-blur-sm p-8 rounded-2xl border border-brand-neutral-200 text-center">
          <p className="text-brand-navy-500">Form flow visualization coming soon</p>
        </div>
      )}

      {activeTab === "clicks" && (
        <div className="glass rounded-2xl overflow-hidden shadow-glass border border-white/40">
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand-neutral-200/50 bg-brand-neutral-50/50">
                <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Date</th>
                <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Link ID</th>
                <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Target URL</th>
                <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">IP</th>
                <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">User Agent</th>
              </tr>
            </thead>
            <tbody>
              {linkClicks.map((click) => (
                <tr key={click.id} className="border-b border-brand-neutral-100 hover:bg-brand-ice/30 transition-colors">
                  <td className="px-6 py-4 text-brand-navy-900 text-sm whitespace-nowrap">
                    {formatDate(click.created_at)}
                  </td>
                  <td className="px-6 py-4 text-brand-brown font-mono text-xs">
                    {click.link_type}
                  </td>
                  <td className="px-6 py-4 text-brand-navy-600 text-sm max-w-xs truncate">
                    {click.link_url}
                  </td>
                  <td className="px-6 py-4 text-brand-navy-400 text-xs font-mono">
                    {click.ip_address || "-"}
                  </td>
                  <td className="px-6 py-4 text-brand-navy-400 text-xs max-w-xs truncate">
                    {click.user_agent || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "visits" && (
        <div className="space-y-6">
          {/* Traffic Chart Placeholder - You might want to use a charting library like Recharts here */}
          <div className="glass p-6 rounded-2xl border border-white/40 shadow-glass">
            <h3 className="text-lg font-bold text-brand-navy-900 mb-4">Traffic (Last 24 Hours)</h3>
            <div className="h-64 flex items-end gap-1 border-b border-brand-neutral-200 pb-2">
              {getHourlyTrafficData().map((data) => (
                <div key={data.hour} className="flex-1 flex flex-col items-center group relative">
                  <div
                    className="w-full bg-brand-brown/80 rounded-t-sm hover:bg-brand-brown transition-all min-h-[4px]"
                    style={{
                      height: `${Math.max((data.count / (Math.max(...getHourlyTrafficData().map(d => d.count)) || 1)) * 100, 2)}%`
                    }}
                  />
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-brand-navy-900 text-white text-xs px-2 py-1 rounded pointer-events-none whitespace-nowrap z-50">
                    {data.label}: {data.count} views
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-xs text-brand-navy-400">
              <span>24h ago</span>
              <span>Now</span>
            </div>
          </div>

          <div className="glass rounded-2xl overflow-hidden shadow-glass border border-white/40">
            <table className="w-full">
              <thead>
                <tr className="border-b border-brand-neutral-200/50 bg-brand-neutral-50/50">
                  <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Date</th>
                  <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Page</th>
                  <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Referrer</th>
                  <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">IP</th>
                  <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Device</th>
                </tr>
              </thead>
              <tbody>
                {pageVisits.map((visit) => (
                  <tr key={visit.id} className="border-b border-brand-neutral-100 hover:bg-brand-ice/30 transition-colors">
                    <td className="px-6 py-4 text-brand-navy-900 text-sm whitespace-nowrap">
                      {formatDate(visit.created_at)}
                    </td>
                    <td className="px-6 py-4 text-brand-navy-900 text-sm font-medium">
                      {visit.page_path}
                    </td>
                    <td className="px-6 py-4 text-brand-navy-500 text-sm max-w-xs truncate">
                      {visit.referrer || "-"}
                    </td>
                    <td className="px-6 py-4 text-brand-navy-400 text-xs font-mono">
                      {visit.ip_address || "-"}
                    </td>
                    <td className="px-6 py-4 text-brand-navy-500 text-xs">
                      {visit.user_agent?.includes("Mobile") ? "Mobile" : "Desktop"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quote Preview Modal - Linked to showPreview state */}
      <AnimatePresence>
        {showPreview && (
          <QuotePreviewModal
            onClose={() => setShowPreview(false)}
            quotes={featuredQuotes}
          />
        )}
      </AnimatePresence>

      {/* Confirm Dialog */}
      {confirmAction && (
        <ConfirmDialog
          title={
            confirmAction.type === "bulk-feature"
              ? "Feature Quotes"
              : confirmAction.type === "bulk-remove"
                ? "Remove Quotes"
                : "Remove Featured Quote"
          }
          message={
            confirmAction.type === "bulk-feature"
              ? `Are you sure you want to feature ${confirmAction.count} selected quotes?`
              : confirmAction.type === "bulk-remove"
                ? `Are you sure you want to remove ${confirmAction.count} quotes from featured?`
                : "Are you sure you want to remove this quote from the featured list?"
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
