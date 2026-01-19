"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import type { Call, Lead } from "@/types/database";

const CallsMap = dynamic(() => import("@/components/CallsMap"), {
  ssr: false,
  loading: () => (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
      <div className="w-8 h-8 border-4 border-gray-600 border-t-white rounded-full animate-spin mx-auto" />
    </div>
  ),
});

type Tab = "calls" | "leads" | "map";

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("calls");
  const [calls, setCalls] = useState<Call[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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
    const [callsRes, leadsRes] = await Promise.all([
      supabase.from("calls").select("*").order("created_at", { ascending: false }),
      supabase.from("leads").select("*").order("created_at", { ascending: false }),
    ]);

    if (callsRes.data) setCalls(callsRes.data);
    if (leadsRes.data) setLeads(leadsRes.data);
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
          onClick={() => setActiveTab("map")}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === "map"
              ? "bg-white text-black"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          Map
        </button>
      </div>

      {/* Search */}
      {activeTab !== "map" && (
        <div className="mb-6">
          <input
            type="text"
            placeholder={activeTab === "calls" ? "Search transcripts, quotes, IPs..." : "Search names, emails..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-md px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600"
          />
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
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Quote</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">IP</th>
                <th className="text-left text-gray-400 text-sm font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-gray-500 py-8">
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

      {/* Map */}
      {activeTab === "map" && <CallsMap calls={calls} />}

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
    </div>
  );
}
