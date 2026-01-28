"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import type { Call, Lead, FeaturedQuote, LinkClick, PageVisit, User, LinkedInConversion } from "@/types/database";
import FeaturedQuotesManager from "@/components/FeaturedQuotesManager";
import QuotePreviewModal from "@/components/QuotePreviewModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

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

type Tab = "calls" | "leads" | "quotes" | "map" | "form-flow" | "clicks" | "visits" | "linkedin" | "metrics";
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

const openPresignedUrl = async (url: string) => {
  try {
    const response = await fetch('/api/presign-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await response.json();
    if (data.presignedUrl) {
      window.open(data.presignedUrl, '_blank');
    }
  } catch (error) {
    console.error('Failed to get presigned URL:', error);
  }
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const exportCallsToCSV = (calls: Call[]) => {
  const headers = ["Date", "Type", "Duration (seconds)", "Transcript", "Quote", "IP Address", "Recording URL", "Location"];
  const rows = calls.map(call => [
    new Date(call.created_at).toISOString(),
    call.session_type || "voice",
    call.duration_seconds?.toString() || "",
    (call.transcript || "").replace(/"/g, '""'),
    (call.quotable_quote || "").replace(/"/g, '""'),
    call.ip_address || "",
    call.recording_url || "",
    [call.city, call.region, call.country].filter(Boolean).join(", ")
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `calls-export-${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
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
  const [linkedinConversions, setLinkedinConversions] = useState<LinkedInConversion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [quotesFilter, setQuotesFilter] = useState<QuotesFilter>("all");
  const [sessionTypeFilter, setSessionTypeFilter] = useState<SessionTypeFilter>("all");
  const [durationFilter, setDurationFilter] = useState<"all" | "over15">("over15"); // Default to >15s
  const [visitorFilter, setVisitorFilter] = useState<"all" | "new" | "repeat" | "uniqueIps" | "firstTimeUnique">("firstTimeUnique"); // Default to first-time unique
  const [selectedDate, setSelectedDate] = useState<string | null>(null); // null = all time, string = specific date (YYYY-MM-DD)
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

  // Quote expansion
  const [expandedQuoteId, setExpandedQuoteId] = useState<string | null>(null);

  // Bulk actions and modals
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: "remove" | "bulk-remove" | "bulk-feature";
    callId?: string;
    count?: number;
  } | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Create sample quote modal
  const [showCreateQuoteModal, setShowCreateQuoteModal] = useState(false);
  const [newQuoteText, setNewQuoteText] = useState("");
  const [newQuoteLocation, setNewQuoteLocation] = useState("");
  const [creatingQuote, setCreatingQuote] = useState(false);

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


  const fetchData = async () => {
    setLoading(true);
    const [callsRes, leadsRes, featuredRes, clicksRes, visitsRes, linkedinRes] = await Promise.all([
      supabase.from("calls").select("*").order("created_at", { ascending: false }),
      supabase.from("leads").select("*").order("created_at", { ascending: false }),
      supabase.from("featured_quotes").select("*").order("display_order", { ascending: true }),
      supabase.from("link_clicks").select("*").order("created_at", { ascending: false }),
      supabase.from("page_visits").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("linkedin_conversions").select("*").order("created_at", { ascending: false }).limit(500),
    ]);

    if (callsRes.data) setCalls(callsRes.data);
    if (leadsRes.data) setLeads(leadsRes.data);
    if (featuredRes.data) setFeaturedQuotes(featuredRes.data);
    if (clicksRes.data) setLinkClicks(clicksRes.data);
    if (visitsRes.data) setPageVisits(visitsRes.data);
    if (linkedinRes.data) setLinkedinConversions(linkedinRes.data);
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

  // Generate hourly LinkedIn conversions data for chart
  const getHourlyLinkedInData = () => {
    const now = new Date();
    const hours: { hour: string; count: number; label: string }[] = [];

    for (let i = 23; i >= 0; i--) {
      const hourStart = new Date(now);
      hourStart.setHours(now.getHours() - i, 0, 0, 0);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hourStart.getHours() + 1);

      const count = linkedinConversions.filter((c) => {
        const convDate = new Date(c.created_at);
        return convDate >= hourStart && convDate < hourEnd;
      }).length;

      const label = hourStart.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
      hours.push({ hour: hourStart.toISOString(), count, label });
    }

    return hours;
  };

  // LinkedIn stats
  const linkedinTotal = linkedinConversions.length;
  const linkedinSuccess = linkedinConversions.filter((c) => c.success).length;
  const linkedinWithLiFatId = linkedinConversions.filter((c) => c.li_fat_id).length;
  const linkedinSuccessRate = linkedinTotal > 0 ? Math.round((linkedinSuccess / linkedinTotal) * 100) : 0;
  const linkedinAttributionRate = linkedinTotal > 0 ? Math.round((linkedinWithLiFatId / linkedinTotal) * 100) : 0;

  // Metrics data for chart (last 30 days)
  const metricsData = useMemo(() => {
    const days: { date: string; uniqueVisits: number; qualifiedCalls: number }[] = [];
    const now = new Date();

    // Helper for local date string
    const toLocalDateStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const utcToLocalDateStr = (utc: string) => {
      const d = new Date(utc);
      return toLocalDateStr(d);
    };

    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = toLocalDateStr(date);
      const displayDate = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      // Count unique IPs from page_visits for this day (convert UTC to local)
      const dayVisits = pageVisits.filter((v) => utcToLocalDateStr(v.created_at) === dateStr);
      const uniqueIps = new Set(dayVisits.map((v) => v.ip_address).filter(Boolean));

      // Count calls > 15 seconds for this day (convert UTC to local)
      const dayCalls = calls.filter(
        (c) => utcToLocalDateStr(c.created_at) === dateStr && (c.duration_seconds || 0) > 15
      );

      days.push({
        date: displayDate,
        uniqueVisits: uniqueIps.size,
        qualifiedCalls: dayCalls.length,
      });
    }

    return days;
  }, [pageVisits, calls]);

  // Unique callers chart data (last 14 days, calls >15s, unique IPs per day + first-time callers)
  const uniqueCallersChartData = useMemo(() => {
    const days: { date: string; fullDate: string; uniqueCallers: number; firstTimeCallers: number }[] = [];
    const now = new Date();

    const toLocalDateStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const utcToLocalDateStr = (utc: string) => toLocalDateStr(new Date(utc));

    // Build a map of IP -> first call date (for calls >15s)
    const ipFirstCallDate: Record<string, string> = {};
    const qualifiedCalls = calls.filter((c) => (c.duration_seconds || 0) > 15 && c.ip_address);
    // Sort by date ascending to find first call per IP
    const sortedCalls = [...qualifiedCalls].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    for (const call of sortedCalls) {
      const ip = call.ip_address!;
      if (!ipFirstCallDate[ip]) {
        ipFirstCallDate[ip] = utcToLocalDateStr(call.created_at);
      }
    }

    for (let i = 13; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = toLocalDateStr(date);
      const displayDate = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      // Get unique IPs for calls >15s on this day
      const dayCalls = calls.filter(
        (c) => utcToLocalDateStr(c.created_at) === dateStr && (c.duration_seconds || 0) > 15
      );
      const uniqueIps = new Set(dayCalls.map((c) => c.ip_address).filter(Boolean));

      // Count first-time callers: IPs whose first-ever call >15s was on this day
      const firstTimeCallers = Array.from(uniqueIps).filter(
        (ip) => ipFirstCallDate[ip as string] === dateStr
      ).length;

      days.push({
        date: displayDate,
        fullDate: dateStr,
        uniqueCallers: uniqueIps.size,
        firstTimeCallers,
      });
    }

    return days;
  }, [calls]);

  // Stats
  const totalCalls = calls.length;
  const voiceCalls = calls.filter((c) => c.session_type !== "text").length;
  const textConfessions = calls.filter((c) => c.session_type === "text").length;
  const callsOver15s = calls.filter((c) => (c.duration_seconds || 0) > 15).length;
  const physicianOwners = leads.filter((l) => l.is_physician_owner).length;
  const interestedLeads = leads.filter((l) => l.interested_in_collective).length;
  const totalDuration = calls.reduce((acc, c) => acc + (c.duration_seconds || 0), 0);
  const avgDuration = voiceCalls > 0 ? Math.round(totalDuration / voiceCalls) : 0;

  // Today's unique callers with calls >15s
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const getLocalDate = (utc: string) => {
    const d = new Date(utc);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const todayCallsOver15s = calls.filter(
    (c) => getLocalDate(c.created_at) === todayStr && (c.duration_seconds || 0) > 15
  );
  const todayUniqueCallersOver15s = new Set(
    todayCallsOver15s.map((c) => c.ip_address).filter(Boolean)
  ).size;

  // Track repeat visitors (IPs that appear more than once across all calls)
  const ipCallCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    calls.forEach((c) => {
      if (c.ip_address) {
        counts[c.ip_address] = (counts[c.ip_address] || 0) + 1;
      }
    });
    return counts;
  }, [calls]);

  const isRepeatVisitor = (ip: string | null) => {
    if (!ip) return false;
    return (ipCallCounts[ip] || 0) > 1;
  };

  const getVisitorCallCount = (ip: string | null) => {
    if (!ip) return 0;
    return ipCallCounts[ip] || 0;
  };

  // Count unique and repeat visitors (new = first-time, repeat = has called before)
  const newVisitorCount = calls.filter((c) => c.ip_address && !isRepeatVisitor(c.ip_address)).length;
  const repeatVisitorCount = calls.filter((c) => c.ip_address && isRepeatVisitor(c.ip_address)).length;
  // Count unique IPs (deduplicated)
  const uniqueIpCount = new Set(calls.map((c) => c.ip_address).filter(Boolean)).size;

  // Map of IP -> first call ID (for calls >15s) to identify first-time callers
  const ipFirstCallId = useMemo(() => {
    const map: Record<string, string> = {};
    const qualifiedCalls = calls.filter((c) => (c.duration_seconds || 0) > 15 && c.ip_address);
    // Sort by date ascending to find first call per IP
    const sortedCalls = [...qualifiedCalls].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    for (const call of sortedCalls) {
      const ip = call.ip_address!;
      if (!map[ip]) {
        map[ip] = call.id;
      }
    }
    return map;
  }, [calls]);

  // Count first-time unique callers (IPs with a first call >15s)
  const firstTimeUniqueCount = Object.keys(ipFirstCallId).length;

  // Helper to get local date string from UTC timestamp
  const getLocalDateString = (utcTimestamp: string): string => {
    const date = new Date(utcTimestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // Filter
  const filteredCalls = useMemo(() => {
    // First apply basic filters
    let filtered = calls.filter((c) => {
      // Date filter (convert UTC to local date for comparison)
      if (selectedDate && getLocalDateString(c.created_at) !== selectedDate) return false;

      // Session type filter
      if (sessionTypeFilter === "voice" && c.session_type === "text") return false;
      if (sessionTypeFilter === "text" && c.session_type !== "text") return false;

      // Duration filter
      if (durationFilter === "over15" && (c.duration_seconds || 0) <= 15) return false;

      // New/Repeat visitor filter (not uniqueIps - that's handled separately)
      if (visitorFilter === "new" && isRepeatVisitor(c.ip_address)) return false;
      if (visitorFilter === "repeat" && !isRepeatVisitor(c.ip_address)) return false;

      // Search filter
      return (
        c.transcript?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.quotable_quote?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.ip_address?.includes(searchQuery)
      );
    });

    // If uniqueIps filter is active, deduplicate by IP (keep most recent per IP)
    if (visitorFilter === "uniqueIps") {
      const seenIps = new Set<string>();
      filtered = filtered.filter((c) => {
        if (!c.ip_address) return true; // Keep calls without IP
        if (seenIps.has(c.ip_address)) return false;
        seenIps.add(c.ip_address);
        return true;
      });
    }

    // If firstTimeUnique filter is active, only show each IP's first call >15s
    if (visitorFilter === "firstTimeUnique") {
      filtered = filtered.filter((c) => {
        if (!c.ip_address) return false; // Exclude calls without IP
        return ipFirstCallId[c.ip_address] === c.id;
      });
    }

    return filtered;
  }, [calls, selectedDate, sessionTypeFilter, durationFilter, visitorFilter, searchQuery, isRepeatVisitor, ipFirstCallId]);

  // Stats for selected date
  const selectedDateCalls = selectedDate
    ? calls.filter((c) => getLocalDateString(c.created_at) === selectedDate)
    : calls;
  const selectedDateCallsOver15s = selectedDateCalls.filter((c) => (c.duration_seconds || 0) > 15);
  const selectedDateUniqueCallersOver15s = new Set(
    selectedDateCallsOver15s.map((c) => c.ip_address).filter(Boolean)
  ).size;

  // Helper to get local date string from Date object
  const formatLocalDate = (date: Date): string => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // Date navigation helpers
  const goToPreviousDay = () => {
    const current = selectedDate ? new Date(selectedDate + "T12:00:00") : new Date();
    current.setDate(current.getDate() - 1);
    setSelectedDate(formatLocalDate(current));
  };

  const goToNextDay = () => {
    if (!selectedDate) return;
    const current = new Date(selectedDate + "T12:00:00");
    current.setDate(current.getDate() + 1);
    const nextDate = formatLocalDate(current);
    const today = formatLocalDate(new Date());
    if (nextDate <= today) {
      setSelectedDate(nextDate);
    }
  };

  const formatSelectedDate = (dateStr: string | null) => {
    if (!dateStr) return "All Time";
    const date = new Date(dateStr + "T12:00:00");
    const today = formatLocalDate(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatLocalDate(yesterday);

    if (dateStr === today) return "Today";
    if (dateStr === yesterdayStr) return "Yesterday";
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

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

  // Create a sample quote (not from a call)
  const createSampleQuote = async () => {
    if (!newQuoteText.trim()) return;

    setCreatingQuote(true);
    try {
      const response = await fetch("/api/featured-quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call_id: null,
          quote: newQuoteText.trim(),
          location: newQuoteLocation.trim() || null,
        }),
      });

      if (response.ok) {
        await fetchData();
        setShowCreateQuoteModal(false);
        setNewQuoteText("");
        setNewQuoteLocation("");
      }
    } catch (error) {
      console.error("Failed to create sample quote:", error);
    }
    setCreatingQuote(false);
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
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8 relative z-10">
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
            className="glass p-5 rounded-2xl border border-emerald-200/50 shadow-glass bg-emerald-50/30"
          >
            <p className="text-emerald-700 text-sm font-medium uppercase tracking-wider">Today &gt;15s</p>
            <p className="text-3xl font-bold text-emerald-600 mt-1">{todayUniqueCallersOver15s}</p>
            <p className="text-xs text-emerald-600/70 mt-1 font-medium">unique callers</p>
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
            <p className="text-brand-navy-600 text-sm font-medium uppercase tracking-wider">Calls &gt;15s</p>
            <p className="text-3xl font-bold text-brand-navy-900 mt-1">{callsOver15s}</p>
            <p className="text-xs text-brand-navy-400 mt-1 font-medium">all time</p>
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
          onClick={() => setActiveTab("linkedin")}
          className={cn(
            "px-4 py-2 rounded-lg transition-all duration-200 text-sm font-medium",
            activeTab === "linkedin"
              ? "bg-white text-brand-navy-900 shadow-sm"
              : "text-brand-navy-600 hover:bg-white/50"
          )}
        >
          LinkedIn ({linkedinConversions.length})
        </button>
        <button
          onClick={() => setActiveTab("metrics")}
          className={cn(
            "px-4 py-2 rounded-lg transition-all duration-200 text-sm font-medium",
            activeTab === "metrics"
              ? "bg-white text-brand-navy-900 shadow-sm"
              : "text-brand-navy-600 hover:bg-white/50"
          )}
        >
          Metrics
        </button>
      </div>

      {/* Search */}
      {activeTab !== "map" && activeTab !== "form-flow" && activeTab !== "clicks" && activeTab !== "visits" && activeTab !== "linkedin" && activeTab !== "metrics" && (
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
              <div className="w-px h-6 bg-brand-neutral-200 mx-1" />
              <button
                onClick={() => setDurationFilter(durationFilter === "over15" ? "all" : "over15")}
                className={cn(
                  "px-3 py-2 text-sm rounded-lg transition-all duration-200 border",
                  durationFilter === "over15"
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                    : "bg-white/50 text-brand-navy-600 border-brand-neutral-200 hover:bg-white"
                )}
              >
                &gt;15s ({callsOver15s})
              </button>
              <div className="w-px h-6 bg-brand-neutral-200 mx-1" />
              <button
                onClick={() => setVisitorFilter(visitorFilter === "firstTimeUnique" ? "all" : "firstTimeUnique")}
                className={cn(
                  "px-3 py-2 text-sm rounded-lg transition-all duration-200 border inline-flex items-center gap-1.5",
                  visitorFilter === "firstTimeUnique"
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                    : "bg-white/50 text-brand-navy-600 border-brand-neutral-200 hover:bg-white"
                )}
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                </svg>
                First-Time ({firstTimeUniqueCount})
              </button>
              <button
                onClick={() => setVisitorFilter(visitorFilter === "uniqueIps" ? "all" : "uniqueIps")}
                className={cn(
                  "px-3 py-2 text-sm rounded-lg transition-all duration-200 border inline-flex items-center gap-1.5",
                  visitorFilter === "uniqueIps"
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-white/50 text-brand-navy-600 border-brand-neutral-200 hover:bg-white"
                )}
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                </svg>
                Unique IPs ({uniqueIpCount})
              </button>
              <button
                onClick={() => setVisitorFilter(visitorFilter === "new" ? "all" : "new")}
                className={cn(
                  "px-3 py-2 text-sm rounded-lg transition-all duration-200 border inline-flex items-center gap-1.5",
                  visitorFilter === "new"
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                    : "bg-white/50 text-brand-navy-600 border-brand-neutral-200 hover:bg-white"
                )}
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                </svg>
                New ({newVisitorCount})
              </button>
              <button
                onClick={() => setVisitorFilter(visitorFilter === "repeat" ? "all" : "repeat")}
                className={cn(
                  "px-3 py-2 text-sm rounded-lg transition-all duration-200 border inline-flex items-center gap-1.5",
                  visitorFilter === "repeat"
                    ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                    : "bg-white/50 text-brand-navy-600 border-brand-neutral-200 hover:bg-white"
                )}
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                Repeat ({repeatVisitorCount})
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
          className="space-y-4"
        >
          {/* Unique Callers Chart */}
          <div className="glass rounded-2xl p-6 border border-brand-neutral-200/50">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-brand-navy-900">Unique Callers</h3>
                <p className="text-sm text-brand-navy-400">Daily unique IPs with calls &gt;15s (last 14 days)</p>
              </div>
              <div className="flex gap-6 text-right">
                <div>
                  <div className="text-2xl font-bold text-brand-navy-900">
                    {uniqueCallersChartData.reduce((sum, d) => sum + d.uniqueCallers, 0)}
                  </div>
                  <div className="text-xs text-brand-navy-400">total unique</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-600">
                    {uniqueCallersChartData.reduce((sum, d) => sum + d.firstTimeCallers, 0)}
                  </div>
                  <div className="text-xs text-brand-navy-400">first-time</div>
                </div>
              </div>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={uniqueCallersChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    tickLine={false}
                    axisLine={{ stroke: "#e5e7eb" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={28}
                    iconType="line"
                    wrapperStyle={{ fontSize: "11px" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="uniqueCallers"
                    name="Unique Callers"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={{ fill: "#2563eb", strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 5, fill: "#2563eb" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="firstTimeCallers"
                    name="First-Time Callers"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ fill: "#10b981", strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 5, fill: "#10b981" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Date Navigation & Stats */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Date Navigator */}
              <div className="flex items-center gap-1 bg-white/50 backdrop-blur-sm border border-brand-neutral-200 rounded-xl p-1">
                <button
                  onClick={goToPreviousDay}
                  className="p-2 hover:bg-brand-neutral-100 rounded-lg transition-colors"
                  title="Previous day"
                >
                  <svg className="w-4 h-4 text-brand-navy-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => setSelectedDate(null)}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium rounded-lg transition-all min-w-[120px]",
                    selectedDate === null
                      ? "bg-brand-navy-900 text-white"
                      : "text-brand-navy-600 hover:bg-brand-neutral-100"
                  )}
                >
                  {formatSelectedDate(selectedDate)}
                </button>
                <button
                  onClick={goToNextDay}
                  disabled={!selectedDate || selectedDate >= formatLocalDate(new Date())}
                  className="p-2 hover:bg-brand-neutral-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Next day"
                >
                  <svg className="w-4 h-4 text-brand-navy-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Quick Day Buttons */}
              <div className="hidden md:flex items-center gap-1">
                <button
                  onClick={() => setSelectedDate(formatLocalDate(new Date()))}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-lg transition-all border",
                    selectedDate === formatLocalDate(new Date())
                      ? "bg-brand-navy-900 text-white border-brand-navy-900"
                      : "bg-white/50 text-brand-navy-600 border-brand-neutral-200 hover:bg-white"
                  )}
                >
                  Today
                </button>
                <button
                  onClick={() => {
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    setSelectedDate(formatLocalDate(yesterday));
                  }}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-lg transition-all border",
                    (() => {
                      const yesterday = new Date();
                      yesterday.setDate(yesterday.getDate() - 1);
                      return selectedDate === formatLocalDate(yesterday);
                    })()
                      ? "bg-brand-navy-900 text-white border-brand-navy-900"
                      : "bg-white/50 text-brand-navy-600 border-brand-neutral-200 hover:bg-white"
                  )}
                >
                  Yesterday
                </button>
              </div>

              {/* Unique Callers Stat for Selected Date */}
              <div className="glass px-4 py-2 rounded-xl border border-emerald-200/50 bg-emerald-50/50">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-emerald-600">{selectedDateUniqueCallersOver15s}</span>
                  <div className="text-xs text-emerald-700">
                    <div className="font-medium">unique callers</div>
                    <div className="text-emerald-600/70">&gt;15s {selectedDate ? "" : "(all time)"}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Export Button */}
            <button
              onClick={() => exportCallsToCSV(filteredCalls)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-navy-900 text-white rounded-lg hover:bg-brand-navy-800 transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>
          </div>
          <div className="glass rounded-2xl overflow-hidden shadow-glass border border-white/40">
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
                        <button
                          onClick={() => openPresignedUrl(call.recording_url!)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-brown text-white rounded-lg hover:bg-brand-brown-dark transition-colors shadow-sm text-xs font-medium"
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                          <span>Play</span>
                        </button>
                      ) : (
                        <span className="text-brand-navy-300">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm max-w-xs">
                      {call.transcript ? (
                        <button
                          onClick={() => setSelectedCall(call)}
                          className={cn("line-clamp-2 text-xs leading-relaxed text-left hover:underline cursor-pointer", call.session_type === "text" ? "text-amber-800 font-medium" : "text-brand-navy-600")}
                        >
                          {call.transcript.slice(0, 100)}{call.transcript.length > 100 ? "..." : ""}
                        </button>
                      ) : (
                        <span className="text-brand-navy-300">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm max-w-xs">
                      {call.quotable_quote ? (
                        <button
                          onClick={() => setExpandedQuoteId(expandedQuoteId === call.id ? null : call.id)}
                          className={cn(
                            "text-brand-navy-800 italic font-medium bg-brand-neutral-100/50 p-1.5 rounded-lg border border-brand-neutral-200/50 text-left hover:bg-brand-neutral-100 transition-colors cursor-pointer",
                            expandedQuoteId === call.id ? "" : "line-clamp-2"
                          )}
                          title={expandedQuoteId === call.id ? "Click to collapse" : "Click to expand"}
                        >
                          &ldquo;{call.quotable_quote}&rdquo;
                        </button>
                      ) : (
                        <span className="text-brand-navy-300">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-brand-navy-400 text-xs font-mono">{call.ip_address || "-"}</span>
                        {call.ip_address && (
                          isRepeatVisitor(call.ip_address) ? (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-full"
                              title={`${getVisitorCallCount(call.ip_address)} total calls from this IP`}
                            >
                              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                              </svg>
                              {getVisitorCallCount(call.ip_address)}x
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full"
                              title="First time caller"
                            >
                              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                              </svg>
                              NEW
                            </span>
                          )
                        )}
                      </div>
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
          </div>
        </motion.div>
      )}

      {/* Call Detail Modal */}
      <AnimatePresence>
        {selectedCall && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedCall(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-brand-neutral-200 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-brand-navy-900">Call Details</h3>
                  <p className="text-sm text-brand-navy-500">{formatDate(selectedCall.created_at)}</p>
                </div>
                <button
                  onClick={() => setSelectedCall(null)}
                  className="p-2 hover:bg-brand-neutral-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-brand-navy-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
                {/* Meta info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-brand-navy-500">Type:</span>
                    <span className="ml-2 font-medium">{selectedCall.session_type === "text" ? "Text" : "Voice"}</span>
                  </div>
                  <div>
                    <span className="text-brand-navy-500">Duration:</span>
                    <span className="ml-2 font-medium">{formatDuration(selectedCall.duration_seconds)}</span>
                  </div>
                  {selectedCall.ip_address && (
                    <div>
                      <span className="text-brand-navy-500">IP:</span>
                      <span className="ml-2 font-mono text-xs">{selectedCall.ip_address}</span>
                    </div>
                  )}
                  {(selectedCall.city || selectedCall.country) && (
                    <div>
                      <span className="text-brand-navy-500">Location:</span>
                      <span className="ml-2">{[selectedCall.city, selectedCall.region, selectedCall.country].filter(Boolean).join(", ")}</span>
                    </div>
                  )}
                </div>

                {/* Recording */}
                {selectedCall.recording_url && (
                  <div>
                    <h4 className="text-sm font-semibold text-brand-navy-900 mb-2">Recording</h4>
                    <button
                      onClick={() => openPresignedUrl(selectedCall.recording_url!)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-brand-brown text-white rounded-lg hover:bg-brand-brown-dark transition-colors text-sm font-medium"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Play Recording
                    </button>
                  </div>
                )}

                {/* Transcript */}
                <div>
                  <h4 className="text-sm font-semibold text-brand-navy-900 mb-2">Transcript</h4>
                  {selectedCall.transcript ? (
                    <div className="bg-brand-neutral-50 rounded-lg p-4 text-sm text-brand-navy-700 whitespace-pre-wrap max-h-64 overflow-y-auto border border-brand-neutral-200">
                      {selectedCall.transcript}
                    </div>
                  ) : (
                    <p className="text-brand-navy-400 text-sm italic">No transcript available</p>
                  )}
                </div>

                {/* Quotable Quote */}
                {selectedCall.quotable_quote && (
                  <div>
                    <h4 className="text-sm font-semibold text-brand-navy-900 mb-2">Quotable Quote</h4>
                    <div className="bg-brand-ice rounded-lg p-4 text-sm text-brand-navy-800 italic border border-brand-navy-200">
                      &ldquo;{selectedCall.quotable_quote}&rdquo;
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-brand-navy-900">Add Quotes</h3>
                  <button
                    onClick={() => setShowCreateQuoteModal(true)}
                    className="px-3 py-1.5 text-xs font-medium bg-brand-brown text-white rounded-lg hover:bg-brand-brown-dark transition-colors"
                  >
                    + Create Sample
                  </button>
                </div>
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

                        <p
                          className={cn(
                            "text-brand-navy-900 italic pr-8 cursor-pointer hover:text-brand-navy-700 transition-colors",
                            expandedQuoteId === call.id ? "" : "line-clamp-3"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedQuoteId(expandedQuoteId === call.id ? null : call.id);
                          }}
                          title={expandedQuoteId === call.id ? "Click to collapse" : "Click to expand"}
                        >
                          &ldquo;{call.quotable_quote}&rdquo;
                        </p>
                        {call.quotable_quote && call.quotable_quote.length > 150 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedQuoteId(expandedQuoteId === call.id ? null : call.id);
                            }}
                            className="text-xs text-brand-brown hover:text-brand-brown-dark mt-1 font-medium"
                          >
                            {expandedQuoteId === call.id ? "Show less" : "Show more"}
                          </button>
                        )}
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

      {activeTab === "form-flow" && (() => {
        // Calculate form flow statistics from leads data
        const totalLeads = leads.length;
        const healthcareYes = leads.filter(l => l.works_in_healthcare === true).length;
        const healthcareNo = leads.filter(l => l.works_in_healthcare === false).length;
        const independentPractice = leads.filter(l => l.workplace_type === "independent").length;
        const hospitalSystem = leads.filter(l => l.workplace_type === "hospital").length;
        const roleOwner = leads.filter(l => l.role_type === "owner").length;
        const roleProvider = leads.filter(l => l.role_type === "provider").length;
        const roleFrontOffice = leads.filter(l => l.role_type === "front_office").length;
        const interestedYes = leads.filter(l => l.interested_in_collective === true).length;
        const interestedNo = leads.filter(l => l.interested_in_collective === false).length;
        const withContact = leads.filter(l => l.email).length;

        const getPercent = (count: number, total: number) =>
          total > 0 ? Math.round((count / total) * 100) : 0;

        return (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-4">
              <div className="glass p-4 rounded-xl border border-white/40">
                <p className="text-brand-navy-500 text-xs font-bold uppercase">Total Responses</p>
                <p className="text-3xl font-bold text-brand-navy-900">{totalLeads}</p>
              </div>
              <div className="glass p-4 rounded-xl border border-white/40">
                <p className="text-brand-navy-500 text-xs font-bold uppercase">Healthcare Workers</p>
                <p className="text-3xl font-bold text-emerald-600">{healthcareYes}</p>
                <p className="text-xs text-brand-navy-400">{getPercent(healthcareYes, totalLeads)}% of responses</p>
              </div>
              <div className="glass p-4 rounded-xl border border-white/40">
                <p className="text-brand-navy-500 text-xs font-bold uppercase">Interested in Collective</p>
                <p className="text-3xl font-bold text-brand-brown">{interestedYes}</p>
                <p className="text-xs text-brand-navy-400">{getPercent(interestedYes, totalLeads)}% of responses</p>
              </div>
              <div className="glass p-4 rounded-xl border border-white/40">
                <p className="text-brand-navy-500 text-xs font-bold uppercase">Contact Provided</p>
                <p className="text-3xl font-bold text-blue-600">{withContact}</p>
                <p className="text-xs text-brand-navy-400">{getPercent(withContact, interestedYes)}% of interested</p>
              </div>
            </div>

            {/* Flow Visualization */}
            <div className="glass p-6 rounded-2xl border border-white/40 shadow-glass">
              <h3 className="text-lg font-bold text-brand-navy-900 mb-6">Form Flow Funnel</h3>

              <div className="space-y-4">
                {/* Step 1: Healthcare Question */}
                <div className="relative">
                  <div className="flex items-center gap-4">
                    <div className="w-48 text-right">
                      <p className="text-sm font-semibold text-brand-navy-700">Work in Healthcare?</p>
                      <p className="text-xs text-brand-navy-400">{totalLeads} responses</p>
                    </div>
                    <div className="flex-1 flex gap-2 overflow-hidden">
                      {healthcareYes > 0 && (
                        <div
                          className="h-10 bg-emerald-500 rounded-l-lg flex items-center justify-center text-white text-sm font-bold transition-all overflow-hidden"
                          style={{ width: `${getPercent(healthcareYes, totalLeads)}%`, minWidth: '60px' }}
                        >
                          <span className="truncate px-2">Yes: {healthcareYes}</span>
                        </div>
                      )}
                      {healthcareNo > 0 && (
                        <div
                          className="h-10 bg-gray-400 rounded-r-lg flex items-center justify-center text-white text-sm font-bold transition-all overflow-hidden"
                          style={{ width: `${getPercent(healthcareNo, totalLeads)}%`, minWidth: '60px' }}
                        >
                          <span className="truncate px-2">No: {healthcareNo}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex items-center gap-4">
                  <div className="w-48" />
                  <div className="text-brand-navy-300 pl-4">↓</div>
                </div>

                {/* Step 2: Workplace Type */}
                <div className="relative">
                  <div className="flex items-center gap-4">
                    <div className="w-48 text-right">
                      <p className="text-sm font-semibold text-brand-navy-700">Workplace Type</p>
                      <p className="text-xs text-brand-navy-400">{independentPractice + hospitalSystem} responses</p>
                    </div>
                    <div className="flex-1 flex gap-2 overflow-hidden">
                      {independentPractice > 0 && (
                        <div
                          className="h-10 bg-blue-500 rounded-l-lg flex items-center justify-center text-white text-sm font-bold transition-all overflow-hidden"
                          style={{ width: `${getPercent(independentPractice, independentPractice + hospitalSystem)}%`, minWidth: '80px' }}
                        >
                          <span className="truncate px-2">Independent: {independentPractice}</span>
                        </div>
                      )}
                      {hospitalSystem > 0 && (
                        <div
                          className="h-10 bg-purple-500 rounded-r-lg flex items-center justify-center text-white text-sm font-bold transition-all overflow-hidden"
                          style={{ width: `${getPercent(hospitalSystem, independentPractice + hospitalSystem)}%`, minWidth: '80px' }}
                        >
                          <span className="truncate px-2">Hospital: {hospitalSystem}</span>
                        </div>
                      )}
                      {independentPractice === 0 && hospitalSystem === 0 && (
                        <div className="h-10 bg-gray-200 rounded-lg flex items-center justify-center text-gray-500 text-sm flex-1">
                          No data
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex items-center gap-4">
                  <div className="w-48" />
                  <div className="text-brand-navy-300 pl-4">↓</div>
                </div>

                {/* Step 3: Role Type (Independent only) */}
                <div className="relative">
                  <div className="flex items-center gap-4">
                    <div className="w-48 text-right">
                      <p className="text-sm font-semibold text-brand-navy-700">Role (Independent)</p>
                      <p className="text-xs text-brand-navy-400">{roleOwner + roleProvider + roleFrontOffice} responses</p>
                    </div>
                    <div className="flex-1 flex gap-2 overflow-hidden">
                      {roleOwner > 0 && (
                        <div
                          className="h-10 bg-amber-500 rounded-l-lg flex items-center justify-center text-white text-sm font-bold transition-all overflow-hidden"
                          style={{ width: `${getPercent(roleOwner, roleOwner + roleProvider + roleFrontOffice)}%`, minWidth: '70px' }}
                        >
                          <span className="truncate px-2">Owner: {roleOwner}</span>
                        </div>
                      )}
                      {roleProvider > 0 && (
                        <div
                          className="h-10 bg-teal-500 flex items-center justify-center text-white text-sm font-bold transition-all overflow-hidden"
                          style={{ width: `${getPercent(roleProvider, roleOwner + roleProvider + roleFrontOffice)}%`, minWidth: '70px' }}
                        >
                          <span className="truncate px-2">Provider: {roleProvider}</span>
                        </div>
                      )}
                      {roleFrontOffice > 0 && (
                        <div
                          className="h-10 bg-gray-500 rounded-r-lg flex items-center justify-center text-white text-sm font-bold transition-all overflow-hidden"
                          style={{ width: `${getPercent(roleFrontOffice, roleOwner + roleProvider + roleFrontOffice)}%`, minWidth: '90px' }}
                        >
                          <span className="truncate px-2">Front Office: {roleFrontOffice}</span>
                        </div>
                      )}
                      {roleOwner === 0 && roleProvider === 0 && roleFrontOffice === 0 && (
                        <div className="h-10 bg-gray-200 rounded-lg flex items-center justify-center text-gray-500 text-sm flex-1">
                          No data
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex items-center gap-4">
                  <div className="w-48" />
                  <div className="text-brand-navy-300 pl-4">↓</div>
                </div>

                {/* Step 4: Collective Interest */}
                <div className="relative">
                  <div className="flex items-center gap-4">
                    <div className="w-48 text-right">
                      <p className="text-sm font-semibold text-brand-navy-700">Interested in Collective?</p>
                      <p className="text-xs text-brand-navy-400">{interestedYes + interestedNo} responses</p>
                    </div>
                    <div className="flex-1 flex gap-2 overflow-hidden">
                      {interestedYes > 0 && (
                        <div
                          className="h-10 bg-brand-brown rounded-l-lg flex items-center justify-center text-white text-sm font-bold transition-all overflow-hidden"
                          style={{ width: `${getPercent(interestedYes, interestedYes + interestedNo)}%`, minWidth: '60px' }}
                        >
                          <span className="truncate px-2">Yes: {interestedYes}</span>
                        </div>
                      )}
                      {interestedNo > 0 && (
                        <div
                          className="h-10 bg-gray-400 rounded-r-lg flex items-center justify-center text-white text-sm font-bold transition-all overflow-hidden"
                          style={{ width: `${getPercent(interestedNo, interestedYes + interestedNo)}%`, minWidth: '60px' }}
                        >
                          <span className="truncate px-2">No: {interestedNo}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex items-center gap-4">
                  <div className="w-48" />
                  <div className="text-brand-navy-300 pl-4">↓</div>
                </div>

                {/* Step 5: Contact Form */}
                <div className="relative">
                  <div className="flex items-center gap-4">
                    <div className="w-48 text-right">
                      <p className="text-sm font-semibold text-brand-navy-700">Contact Submitted</p>
                      <p className="text-xs text-brand-navy-400">of {interestedYes} interested</p>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      {withContact > 0 ? (
                        <div
                          className="h-10 bg-emerald-600 rounded-lg flex items-center justify-center text-white text-sm font-bold transition-all overflow-hidden"
                          style={{ width: `${getPercent(withContact, interestedYes)}%`, minWidth: '120px' }}
                        >
                          <span className="truncate px-2">{withContact} contacts ({getPercent(withContact, interestedYes)}%)</span>
                        </div>
                      ) : (
                        <div className="h-10 bg-gray-200 rounded-lg flex items-center justify-center text-gray-500 text-sm">
                          No contacts yet
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Breakdown Tables */}
            <div className="grid grid-cols-2 gap-6">
              {/* Workplace Breakdown */}
              <div className="glass p-4 rounded-xl border border-white/40">
                <h4 className="text-sm font-bold text-brand-navy-900 mb-3">Workplace Breakdown</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-brand-navy-600">Independent Practice</span>
                    <span className="font-bold text-brand-navy-900">{independentPractice}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-brand-navy-600">Hospital/Health System</span>
                    <span className="font-bold text-brand-navy-900">{hospitalSystem}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-brand-navy-600">Not in Healthcare</span>
                    <span className="font-bold text-brand-navy-900">{healthcareNo}</span>
                  </div>
                </div>
              </div>

              {/* Role Breakdown */}
              <div className="glass p-4 rounded-xl border border-white/40">
                <h4 className="text-sm font-bold text-brand-navy-900 mb-3">Role Breakdown (Independent)</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-brand-navy-600">Owner/Partner</span>
                    <span className="font-bold text-amber-600">{roleOwner}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-brand-navy-600">Provider</span>
                    <span className="font-bold text-brand-navy-900">{roleProvider}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-brand-navy-600">Front Office/Admin</span>
                    <span className="font-bold text-brand-navy-900">{roleFrontOffice}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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

      {/* LinkedIn Tab */}
      {activeTab === "linkedin" && (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass p-6 rounded-2xl border border-white/40 shadow-glass">
              <div className="text-sm text-brand-navy-500 font-medium">Total Sent</div>
              <div className="text-3xl font-bold text-brand-navy-900 mt-1">{linkedinTotal}</div>
              <div className="text-xs text-brand-navy-400 mt-1">conversion events</div>
            </div>
            <div className="glass p-6 rounded-2xl border border-white/40 shadow-glass">
              <div className="text-sm text-brand-navy-500 font-medium">Success Rate</div>
              <div className="text-3xl font-bold text-brand-navy-900 mt-1">
                {linkedinSuccessRate}%
                <span className="text-sm font-normal text-brand-navy-400 ml-2">
                  ({linkedinSuccess} / {linkedinTotal})
                </span>
              </div>
              <div className="text-xs text-brand-navy-400 mt-1">sent to LinkedIn API</div>
            </div>
            <div className="glass p-6 rounded-2xl border border-white/40 shadow-glass">
              <div className="text-sm text-brand-navy-500 font-medium">With li_fat_id</div>
              <div className="text-3xl font-bold text-brand-navy-900 mt-1">
                {linkedinAttributionRate}%
                <span className="text-sm font-normal text-brand-navy-400 ml-2">
                  ({linkedinWithLiFatId} / {linkedinTotal})
                </span>
              </div>
              <div className="text-xs text-brand-navy-400 mt-1">from LinkedIn ads</div>
            </div>
          </div>

          {/* Hourly Chart */}
          <div className="glass p-6 rounded-2xl border border-white/40 shadow-glass">
            <h3 className="text-lg font-bold text-brand-navy-900 mb-4">Conversions (Last 24 Hours)</h3>
            <div className="h-64 flex items-end gap-1 border-b border-brand-neutral-200 pb-2">
              {getHourlyLinkedInData().map((data) => (
                <div key={data.hour} className="flex-1 flex flex-col items-center group relative">
                  <div
                    className="w-full bg-blue-500/80 rounded-t-sm hover:bg-blue-600 transition-all min-h-[4px]"
                    style={{
                      height: `${Math.max((data.count / (Math.max(...getHourlyLinkedInData().map(d => d.count)) || 1)) * 100, 2)}%`
                    }}
                  />
                  <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-brand-navy-900 text-white text-xs px-2 py-1 rounded pointer-events-none whitespace-nowrap z-50">
                    {data.label}: {data.count} conversions
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-xs text-brand-navy-400">
              <span>24h ago</span>
              <span>Now</span>
            </div>
          </div>

          {/* Recent Conversions Table */}
          <div className="glass rounded-2xl overflow-hidden shadow-glass border border-white/40">
            <table className="w-full">
              <thead>
                <tr className="border-b border-brand-neutral-200/50 bg-brand-neutral-50/50">
                  <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Date</th>
                  <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Event</th>
                  <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">li_fat_id</th>
                  <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Status</th>
                  <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Response</th>
                  <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">IP</th>
                </tr>
              </thead>
              <tbody>
                {linkedinConversions.map((conv) => (
                  <tr key={conv.id} className="border-b border-brand-neutral-100 hover:bg-brand-ice/30 transition-colors">
                    <td className="px-6 py-4 text-brand-navy-900 text-sm whitespace-nowrap">
                      {formatDate(conv.created_at)}
                    </td>
                    <td className="px-6 py-4 text-brand-navy-900 text-sm font-medium">
                      {conv.event_type}
                    </td>
                    <td className="px-6 py-4 text-brand-navy-500 text-xs font-mono max-w-[120px] truncate">
                      {conv.li_fat_id ? conv.li_fat_id.substring(0, 16) + "..." : "-"}
                    </td>
                    <td className="px-6 py-4">
                      {conv.success ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                          Success
                        </span>
                      ) : conv.li_fat_id ? (
                        <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                          Failed
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">
                          Skipped
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-brand-navy-400 text-xs">
                      {conv.linkedin_response_status || "-"}
                    </td>
                    <td className="px-6 py-4 text-brand-navy-400 text-xs font-mono">
                      {conv.ip_address || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Metrics Tab */}
      {activeTab === "metrics" && (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="glass p-6 rounded-2xl border border-white/40 shadow-glass">
              <div className="text-sm text-brand-navy-500 font-medium">Total Visits (30d)</div>
              <div className="text-3xl font-bold text-brand-navy-900 mt-1">
                {metricsData.reduce((sum, d) => sum + d.uniqueVisits, 0)}
              </div>
              <div className="text-xs text-brand-navy-400 mt-1">unique IPs</div>
            </div>
            <div className="glass p-6 rounded-2xl border border-white/40 shadow-glass">
              <div className="text-sm text-brand-navy-500 font-medium">Total Calls &gt;15s (30d)</div>
              <div className="text-3xl font-bold text-brand-navy-900 mt-1">
                {metricsData.reduce((sum, d) => sum + d.qualifiedCalls, 0)}
              </div>
              <div className="text-xs text-brand-navy-400 mt-1">engaged conversations</div>
            </div>
            <div className="glass p-6 rounded-2xl border border-white/40 shadow-glass">
              <div className="text-sm text-brand-navy-500 font-medium">Avg Daily Visits</div>
              <div className="text-3xl font-bold text-brand-navy-900 mt-1">
                {metricsData.length > 0 ? Math.round(metricsData.reduce((sum, d) => sum + d.uniqueVisits, 0) / metricsData.length) : 0}
              </div>
              <div className="text-xs text-brand-navy-400 mt-1">per day</div>
            </div>
            <div className="glass p-6 rounded-2xl border border-white/40 shadow-glass">
              <div className="text-sm text-brand-navy-500 font-medium">Conversion Rate</div>
              <div className="text-3xl font-bold text-brand-navy-900 mt-1">
                {(() => {
                  const totalVisits = metricsData.reduce((sum, d) => sum + d.uniqueVisits, 0);
                  const totalCalls = metricsData.reduce((sum, d) => sum + d.qualifiedCalls, 0);
                  return totalVisits > 0 ? `${Math.round((totalCalls / totalVisits) * 100)}%` : "0%";
                })()}
              </div>
              <div className="text-xs text-brand-navy-400 mt-1">visits to calls</div>
            </div>
          </div>

          {/* Chart */}
          <div className="glass p-6 rounded-2xl border border-white/40 shadow-glass">
            <h3 className="text-lg font-bold text-brand-navy-900 mb-4">Daily Metrics (Last 30 Days)</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metricsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                    tickLine={{ stroke: '#e5e5e5' }}
                  />
                  <YAxis
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                    tickLine={{ stroke: '#e5e5e5' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e5e5',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="uniqueVisits"
                    name="Unique Visits"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ fill: '#6366f1', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="qualifiedCalls"
                    name="Calls >15s"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Daily Breakdown Table */}
          <div className="glass rounded-2xl overflow-hidden shadow-glass border border-white/40">
            <table className="w-full">
              <thead>
                <tr className="border-b border-brand-neutral-200/50 bg-brand-neutral-50/50">
                  <th className="text-left text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Date</th>
                  <th className="text-right text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Unique Visits</th>
                  <th className="text-right text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Calls &gt;15s</th>
                  <th className="text-right text-brand-navy-500 text-xs font-bold uppercase tracking-wider px-6 py-4">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {[...metricsData].reverse().map((day) => (
                  <tr key={day.date} className="border-b border-brand-neutral-100 hover:bg-brand-ice/30 transition-colors">
                    <td className="px-6 py-4 text-brand-navy-900 text-sm font-medium">{day.date}</td>
                    <td className="px-6 py-4 text-brand-navy-900 text-sm text-right">{day.uniqueVisits}</td>
                    <td className="px-6 py-4 text-brand-navy-900 text-sm text-right">{day.qualifiedCalls}</td>
                    <td className="px-6 py-4 text-brand-navy-500 text-sm text-right">
                      {day.uniqueVisits > 0 ? `${Math.round((day.qualifiedCalls / day.uniqueVisits) * 100)}%` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Sample Quote Modal */}
      <AnimatePresence>
        {showCreateQuoteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowCreateQuoteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold text-brand-navy-900 mb-4">Create Sample Quote</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-brand-navy-700 mb-1">
                    Quote <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={newQuoteText}
                    onChange={(e) => setNewQuoteText(e.target.value)}
                    placeholder="Enter the quote text..."
                    rows={4}
                    className="w-full px-4 py-3 border border-brand-neutral-200 rounded-xl text-brand-navy-900 placeholder-brand-navy-400 focus:outline-none focus:border-brand-brown focus:ring-2 focus:ring-brand-brown/20 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-brand-navy-700 mb-1">
                    Location <span className="text-brand-navy-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={newQuoteLocation}
                    onChange={(e) => setNewQuoteLocation(e.target.value)}
                    placeholder="e.g. Boston, MA"
                    className="w-full px-4 py-3 border border-brand-neutral-200 rounded-xl text-brand-navy-900 placeholder-brand-navy-400 focus:outline-none focus:border-brand-brown focus:ring-2 focus:ring-brand-brown/20"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowCreateQuoteModal(false);
                    setNewQuoteText("");
                    setNewQuoteLocation("");
                  }}
                  className="px-4 py-2 text-brand-navy-600 hover:bg-brand-neutral-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createSampleQuote}
                  disabled={!newQuoteText.trim() || creatingQuote}
                  className="px-4 py-2 bg-brand-brown text-white rounded-lg hover:bg-brand-brown-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingQuote ? "Creating..." : "Create Quote"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* Footer */}
      <footer className="mt-8 pt-4 pb-2 border-t border-brand-neutral-200/50 flex justify-center">
        <svg
          viewBox="480 860 1060 250"
          className="h-8 opacity-40 hover:opacity-60 transition-opacity"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g>
            <g>
              <g>
                <path fill="#073863" d="M583.9,1001.36c0,0-8.68-10.85-23.72-24.15c-24.1,46.33-63.34,83.45-63.34,83.45s36.73-3.76,66.81-64.5c10.61,10.22,13.88,14.85,13.88,14.85L583.9,1001.36z"/>
                <path fill="#073863" d="M733.92,1001.82c0,0,6.65-11.76,21.69-25.07c24.1,46.33,65.37,84.36,65.37,84.36s-38.76-4.68-68.84-65.42c-7.71,10.17-11.86,15.76-11.86,15.76L733.92,1001.82z"/>
                <path fill="#073863" d="M540.37,1052.85c0,0,55.39-58.72,89.23-118.3c28.92-57.56,30.37-61.61,30.37-61.61s49.75,112.51,118.88,182.51c-49.17-7.23-98.63-107.31-98.63-107.31s-2.31,48.01,32.39,76.65c-41.41-21.63-62.03-65.3-62.03-65.3c-2.42-6.23-4.08-10.69-5.43-13.87c-2.14-5.02-6.61-4.67-9.49-0.02C595.72,1009.9,564.56,1041.66,540.37,1052.85z"/>
                <path fill="#073863" d="M723.86,1075.39c-0.72,0.92-1.45,1.81-2.17,2.63c-4.39,4.99-10.85,7.86-17.73,7.86h-42.91c-6.14,0-11.32,4.33-12.04,10.08l-1.45,11.47l-4.76-154.11h-6.37l-0.18,2.17c-0.4,4.88-8.69,106.02-10.75,138.84c-6.43-8.81-14.69-8.31-16.34-8.1c-4.51-0.05-8.79-1.97-11.47-5.19c-0.12-0.14-0.23-0.28-0.34-0.42c-3.52-4.57-6-7.2-8.28-8.81c-3.38-2.39-8.11-2.39-11.49,0c-2.27,1.61-4.75,4.24-8.28,8.81c-0.11,0.15-0.23,0.29-0.35,0.44c-2.71,3.24-7.05,5.17-11.63,5.17h-60.46v4.7h60.46c6.09,0,11.91-2.6,15.54-6.95c0.16-0.19,0.32-0.39,0.48-0.59c3.18-4.11,5.41-6.52,7.24-7.82c1.62-1.15,3.88-1.15,5.5,0c1.84,1.3,4.07,3.71,7.24,7.82c0.16,0.2,0.31,0.4,0.46,0.58c3.64,4.36,9.46,6.97,15.55,6.97l0.2,0l0.22-0.04c0.4-0.06,9.65-1.29,14.97,12.39h5.3c0.17-9.76,5.54-77.51,8.78-117.7l4.37,141.49h6.93l3.86-30.56c0.43-3.38,3.47-5.93,7.09-5.93h42.91c8.37,0,16.24-3.49,21.58-9.56c0.78-0.89,1.57-1.84,2.35-2.84c8.36-10.73,11.55-13.64,18.06-13.64v-4.7C736.42,1059.84,731.82,1065.17,723.86,1075.39z"/>
                <path fill="#073863" d="M788.01,1085.87c-6.88,0-13.35-2.86-17.73-7.86c-0.72-0.82-1.45-1.71-2.17-2.63c-7.97-10.22-12.57-15.55-22.08-15.55v4.7c6.5,0,9.69,2.91,18.06,13.64c0.78,0.99,1.57,1.95,2.35,2.84c5.34,6.08,13.2,9.56,21.58,9.56h32.97v-4.7H788.01z"/>
              </g>
              <g>
                <path fill="#073863" d="M885.52,1092.76V964.19h33.79l36.71,98.98l37.07-98.98h31.96v128.57h-21.73v-98.25l0.18-15.89h-0.37l-5.84,15.52l-37.07,98.62h-15.89l-36.71-98.98l-5.66-15.34h-0.37l0.18,16.07v98.25H885.52z"/>
                <path fill="#073863" d="M1091.89,1095.5c-8.77,0-16.56-2.04-23.38-6.12c-6.82-4.08-12.21-9.89-16.16-17.44c-3.96-7.55-5.94-16.37-5.94-26.48c0-10.1,2.01-18.99,6.03-26.66s9.43-13.67,16.25-17.99c6.82-4.32,14.36-6.48,22.65-6.48c8.16,0,15.43,1.95,21.82,5.84c6.39,3.9,11.44,9.65,15.16,17.26c3.71,7.61,5.57,16.96,5.57,28.03h-65.56c0.24,11.81,2.89,20.61,7.94,26.39c5.05,5.78,11.72,8.68,20,8.68c6.45,0,11.99-1.92,16.62-5.75c4.62-3.84,7.85-9.22,9.68-16.16h12.6c-2.31,11.69-7.28,20.76-14.88,27.21C1112.68,1092.28,1103.21,1095.5,1091.89,1095.5z M1090.98,1007.47c-5.6,0-10.32,2.1-14.15,6.3c-3.84,4.2-6.42,10.5-7.76,18.9h42.19c-0.73-8.28-2.89-14.55-6.48-18.81C1101.17,1009.61,1096.58,1007.47,1090.98,1007.47z"/>
                <path fill="#073863" d="M1204.94,1017.7c-2.92-0.73-5.78-1.1-8.58-1.1c-6.82,0-12.18,2.22-16.07,6.67c-3.9,4.45-5.84,11.11-5.84,20v49.49h-20.64v-95.7h19.54v25.57c2.19-8.64,6.12-15.49,11.78-20.55c5.66-5.05,12.26-7.64,19.81-7.76V1017.7z"/>
                <path fill="#073863" d="M1258.99,1095.5c-8.65,0-16.38-2.04-23.19-6.12c-6.82-4.08-12.21-9.86-16.16-17.35c-3.96-7.49-5.94-16.34-5.94-26.57c0-10.35,2.01-19.36,6.03-27.03c4.02-7.67,9.56-13.61,16.62-17.81c7.06-4.2,15.04-6.3,23.92-6.3c8.89,0,16.74,2.07,23.56,6.21c6.82,4.14,12.15,9.92,15.98,17.35c3.84,7.43,5.75,16.19,5.75,26.3c0,10.47-2.01,19.54-6.03,27.21c-4.02,7.67-9.53,13.61-16.53,17.81C1276.01,1093.4,1268,1095.5,1258.99,1095.5z M1260.09,1082.35c6.94,0,12.6-2.92,16.98-8.77c4.38-5.84,6.57-15.22,6.57-28.12c0-12.54-2.25-22.01-6.76-28.4c-4.51-6.39-10.41-9.59-17.72-9.59c-7.06,0-12.75,2.92-17.07,8.77c-4.32,5.84-6.48,15.16-6.48,27.94c0,12.54,2.25,22.04,6.76,28.49C1246.88,1079.13,1252.78,1082.35,1260.09,1082.35z"/>
                <path fill="#073863" d="M1325.29,1092.76V964.19h20.64v77.07l40.73-44.2h20.82l-35.25,35.8l37.07,59.9H1385l-27.03-45.47l-12.05,12.24v33.24H1325.29z"/>
                <path fill="#073863" d="M1441.62,1095.32c-8.16,0-14.79-2.34-19.91-7.03c-5.11-4.69-7.67-10.62-7.67-17.81c0-7.3,2.31-13.27,6.94-17.9c4.63-4.62,12.42-8.28,23.38-10.96c7.42-1.7,13.06-3.35,16.89-4.93c3.84-1.58,6.45-3.38,7.85-5.39c1.4-2.01,2.1-4.35,2.1-7.03c0-3.9-1.64-7.33-4.93-10.32c-3.29-2.98-7.98-4.47-14.06-4.47c-5.97,0-11.05,1.77-15.25,5.3c-4.2,3.53-6.85,8.65-7.94,15.34h-12.6c1.34-10.96,5.72-19.66,13.15-26.11c7.43-6.45,16.68-9.68,27.76-9.68c10.84,0,19.51,3.04,26.02,9.13c6.51,6.09,9.77,14.13,9.77,24.11v43.65c0,3.65,0.79,6.3,2.38,7.95c1.58,1.64,4.14,2.59,7.67,2.83v10.77c-2.31,1.1-5.78,1.64-10.41,1.64c-6.09,0-10.81-1.62-14.15-4.84c-3.35-3.23-5.33-7.64-5.94-13.24c-2.56,5.97-6.51,10.62-11.87,13.97C1455.44,1093.64,1449.04,1095.32,1441.62,1095.32z M1449.65,1080.53c6.69,0,12.17-2.25,16.44-6.76c4.26-4.5,6.39-10.35,6.39-17.53v-17.17c-3.65,5.48-10.59,9.8-20.82,12.97c-5.97,1.95-10.2,4.23-12.69,6.85c-2.5,2.62-3.74,5.69-3.74,9.22c0,3.53,1.28,6.48,3.84,8.86S1445.15,1080.53,1449.65,1080.53z"/>
              </g>
            </g>
          </g>
        </svg>
      </footer>
    </div>
  );
}
