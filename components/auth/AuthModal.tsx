"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Mail, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "./AuthProvider";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (
            element: HTMLElement,
            config: {
              theme?: string;
              size?: string;
              width?: number;
              text?: string;
            }
          ) => void;
        };
      };
    };
  }
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "login" | "register";
}

export default function AuthModal({ isOpen, onClose, initialMode = "login" }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleLoaded, setGoogleLoaded] = useState(false);

  const { login, register, loginWithGoogle } = useAuth();

  // Reset form when modal opens/closes or mode changes
  useEffect(() => {
    if (isOpen) {
      setEmail("");
      setPassword("");
      setName("");
      setError(null);
      setMode(initialMode);
    }
  }, [isOpen, initialMode]);

  // Handle Google sign-in callback
  const handleGoogleCallback = useCallback(
    async (response: { credential: string }) => {
      setIsSubmitting(true);
      setError(null);

      const result = await loginWithGoogle(response.credential);

      if (result.error) {
        setError(result.error);
        setIsSubmitting(false);
      } else {
        onClose();
      }
    },
    [loginWithGoogle, onClose]
  );

  // Load Google Identity Services
  useEffect(() => {
    if (!isOpen || googleLoaded) return;

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setGoogleLoaded(true);
    };
    document.body.appendChild(script);

    return () => {
      // Don't remove script on cleanup - it can be reused
    };
  }, [isOpen, googleLoaded]);

  // Initialize Google button when script loads
  useEffect(() => {
    if (!googleLoaded || !isOpen || !window.google) return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error("Google Client ID not configured");
      return;
    }

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleCallback,
    });

    const buttonContainer = document.getElementById("google-signin-button");
    if (buttonContainer) {
      buttonContainer.innerHTML = ""; // Clear any previous button
      window.google.accounts.id.renderButton(buttonContainer, {
        theme: "filled_black",
        size: "large",
        width: 320,
        text: mode === "login" ? "signin_with" : "signup_with",
      });
    }
  }, [googleLoaded, isOpen, mode, handleGoogleCallback]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    let result;
    if (mode === "login") {
      result = await login(email, password);
    } else {
      result = await register(email, password, name);
    }

    if (result.error) {
      setError(result.error);
      setIsSubmitting(false);
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-meroka-secondary border border-gray-700 rounded-2xl p-6 max-w-sm w-full relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold text-white mb-1">
            {mode === "login" ? "Welcome back" : "Create an account"}
          </h2>
          <p className="text-gray-400 text-sm">
            {mode === "login"
              ? "Sign in to access your conversation history"
              : "Save your conversations and let Doc remember you"}
          </p>
        </div>

        {/* Google Sign-in Button */}
        <div id="google-signin-button" className="flex justify-center mb-4" />

        {/* Divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-gray-700" />
          <span className="text-gray-500 text-xs">or continue with email</span>
          <div className="flex-1 h-px bg-gray-700" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label htmlFor="name" className="block text-sm text-gray-400 mb-1">
                Name (optional)
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Smith"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-meroka-primary"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm text-gray-400 mb-1">
              Email
            </label>
            <div className="relative">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-3 py-2 pl-9 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-meroka-primary"
              />
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-gray-400 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
                required
                minLength={8}
                className="w-full px-3 py-2 pr-10 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-meroka-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 bg-meroka-primary hover:bg-meroka-primary-hover disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {mode === "login" ? "Signing in..." : "Creating account..."}
              </>
            ) : (
              mode === "login" ? "Sign in" : "Create account"
            )}
          </button>
        </form>

        {/* Toggle mode */}
        <p className="mt-4 text-center text-sm text-gray-400">
          {mode === "login" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                onClick={() => setMode("register")}
                className="text-meroka-primary hover:text-meroka-primary-hover font-medium"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                onClick={() => setMode("login")}
                className="text-meroka-primary hover:text-meroka-primary-hover font-medium"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
