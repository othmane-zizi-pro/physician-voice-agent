"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { Save, Loader2, Brain, User, Briefcase, Download, Trash2, AlertTriangle, Shield } from "lucide-react";
import { useRouter } from "next/navigation";

interface UserSettings {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role_type: string | null;
  workplace_type: string | null;
  ai_memory_enabled: boolean;
  created_at: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [roleType, setRoleType] = useState<string | null>(null);
  const [workplaceType, setWorkplaceType] = useState<string | null>(null);
  const [aiMemoryEnabled, setAiMemoryEnabled] = useState(true);

  // Data management state
  const [isExporting, setIsExporting] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const response = await fetch("/api/user/settings");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch settings");
        }

        setSettings(data.user);
        setName(data.user.name || "");
        setRoleType(data.user.role_type);
        setWorkplaceType(data.user.workplace_type);
        setAiMemoryEnabled(data.user.ai_memory_enabled);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setIsLoading(false);
      }
    }

    fetchSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || null,
          roleType,
          workplaceType,
          aiMemoryEnabled,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save settings");
      }

      setSettings(data.user);
      setSuccessMessage("Settings saved successfully");

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString([], {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    try {
      const response = await fetch("/api/user/export");
      if (!response.ok) {
        throw new Error("Failed to export data");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `doc-data-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setSuccessMessage("Data exported successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export data");
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm("Are you sure you want to clear your conversation history? This cannot be undone.")) {
      return;
    }
    setIsClearingHistory(true);
    setError(null);
    try {
      const response = await fetch("/api/user/clear-history", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to clear history");
      }
      setSuccessMessage(`Cleared ${data.clearedCount} conversations from your history`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear history");
    } finally {
      setIsClearingHistory(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      const response = await fetch("/api/user/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: deletePassword,
          confirmation: deleteConfirmation,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete account");
      }
      // Account deleted, redirect to home
      await signOut({ callbackUrl: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-meroka-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-white mb-6">Settings</h1>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
          <p className="text-green-400 text-sm">{successMessage}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* Profile section */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <User size={20} className="text-gray-400" />
            <h2 className="text-lg font-medium text-white">Profile</h2>
          </div>

          <div className="space-y-4">
            {/* Avatar and email (read-only) */}
            <div className="flex items-center gap-4 pb-4 border-b border-gray-800">
              {settings?.avatar_url ? (
                <img
                  src={settings.avatar_url}
                  alt=""
                  className="w-16 h-16 rounded-full"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-meroka-primary flex items-center justify-center text-white text-xl font-medium">
                  {(settings?.name || settings?.email || "U")[0].toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-white font-medium">{settings?.email}</p>
                <p className="text-gray-500 text-sm">
                  Member since {settings?.created_at ? formatDate(settings.created_at) : ""}
                </p>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Display name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Smith"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-meroka-primary"
              />
            </div>
          </div>
        </div>

        {/* Work info section */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Briefcase size={20} className="text-gray-400" />
            <h2 className="text-lg font-medium text-white">Work Information</h2>
          </div>

          <div className="space-y-4">
            {/* Role type */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Your role</label>
              <select
                value={roleType || ""}
                onChange={(e) => setRoleType(e.target.value || null)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-meroka-primary"
              >
                <option value="">Not specified</option>
                <option value="physician">Physician</option>
                <option value="nurse">Nurse</option>
                <option value="admin_staff">Administrative Staff</option>
                <option value="other">Other Healthcare Worker</option>
              </select>
            </div>

            {/* Workplace type */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Workplace type</label>
              <select
                value={workplaceType || ""}
                onChange={(e) => setWorkplaceType(e.target.value || null)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-meroka-primary"
              >
                <option value="">Not specified</option>
                <option value="independent">Independent Practice</option>
                <option value="hospital">Hospital / Health System</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>

        {/* AI Memory section */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Brain size={20} className="text-gray-400" />
            <h2 className="text-lg font-medium text-white">AI Memory</h2>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-gray-300 text-sm mb-1">
                Let Doc remember our conversations
              </p>
              <p className="text-gray-500 text-xs">
                When enabled, Doc will use context from your last 3 conversations to provide more personalized responses.
              </p>
            </div>
            <button
              onClick={() => setAiMemoryEnabled(!aiMemoryEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                aiMemoryEnabled ? "bg-meroka-primary" : "bg-gray-700"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  aiMemoryEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-3 bg-meroka-primary hover:bg-meroka-primary-hover disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save size={18} />
              Save Settings
            </>
          )}
        </button>

        {/* Data & Privacy section */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Shield size={20} className="text-gray-400" />
            <h2 className="text-lg font-medium text-white">Data & Privacy</h2>
          </div>

          <div className="space-y-4">
            {/* Export Data */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-gray-800">
              <div>
                <p className="text-gray-300 text-sm mb-1">Export your data</p>
                <p className="text-gray-500 text-xs">
                  Download a copy of all your data including profile, conversations, and summaries.
                </p>
              </div>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
              >
                {isExporting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} />
                )}
                Export
              </button>
            </div>

            {/* Clear History */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-gray-800">
              <div>
                <p className="text-gray-300 text-sm mb-1">Clear conversation history</p>
                <p className="text-gray-500 text-xs">
                  Remove all your conversations from your account. This cannot be undone.
                </p>
              </div>
              <button
                onClick={handleClearHistory}
                disabled={isClearingHistory}
                className="px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-600/50 text-amber-400 text-sm rounded-lg transition-colors flex items-center gap-2"
              >
                {isClearingHistory ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
                Clear
              </button>
            </div>

            {/* Delete Account */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-red-400 text-sm mb-1">Delete account</p>
                <p className="text-gray-500 text-xs">
                  Permanently delete your account and all associated data. This cannot be undone.
                </p>
              </div>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/50 text-red-400 text-sm rounded-lg transition-colors flex items-center gap-2"
              >
                <AlertTriangle size={16} />
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-500/20 rounded-full">
                <AlertTriangle size={24} className="text-red-500" />
              </div>
              <h2 className="text-xl font-semibold text-white">Delete Account</h2>
            </div>

            <p className="text-gray-400 text-sm mb-6">
              This action is permanent and cannot be undone. All your data including conversations,
              summaries, and profile information will be permanently deleted.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              {/* Password (for email auth users) */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Enter your password to confirm
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Your password"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Confirmation */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Type <span className="text-red-400 font-mono">DELETE MY ACCOUNT</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder="DELETE MY ACCOUNT"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeletePassword("");
                    setDeleteConfirmation("");
                    setError(null);
                  }}
                  className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || deleteConfirmation !== "DELETE MY ACCOUNT"}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Delete Forever"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
