// Simple in-memory rate limiter for auth endpoints
// For production, consider using Redis or a distributed cache

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface FailedLoginEntry {
  count: number;
  lockoutUntil: number | null;
}

// In-memory stores (reset on server restart)
const rateLimitStore = new Map<string, RateLimitEntry>();
const failedLoginStore = new Map<string, FailedLoginEntry>();

// Rate limit configuration
const AUTH_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // 10 requests per window for login/register
};

const LOCKOUT_CONFIG = {
  maxAttempts: 5, // Lock after 5 failed attempts
  lockoutDurationMs: 15 * 60 * 1000, // 15 minute lockout
};

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();

  Array.from(rateLimitStore.entries()).forEach(([key, entry]) => {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  });

  Array.from(failedLoginStore.entries()).forEach(([key, entry]) => {
    if (entry.lockoutUntil && entry.lockoutUntil < now) {
      failedLoginStore.delete(key);
    }
  });
}, 60 * 1000); // Clean up every minute

/**
 * Check if a request should be rate limited
 * @param identifier - IP address or user identifier
 * @param endpoint - The endpoint being accessed (e.g., 'login', 'register')
 * @returns Object with isLimited boolean and retryAfter in seconds
 */
export function checkRateLimit(
  identifier: string,
  endpoint: string
): { isLimited: boolean; retryAfter: number } {
  const key = `${endpoint}:${identifier}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetTime < now) {
    // Create new entry
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + AUTH_RATE_LIMIT.windowMs,
    });
    return { isLimited: false, retryAfter: 0 };
  }

  if (entry.count >= AUTH_RATE_LIMIT.maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { isLimited: true, retryAfter };
  }

  // Increment count
  entry.count++;
  return { isLimited: false, retryAfter: 0 };
}

/**
 * Record a failed login attempt
 * @param identifier - Email or IP address
 * @returns Object with isLocked boolean and lockoutRemaining in seconds
 */
export function recordFailedLogin(
  identifier: string
): { isLocked: boolean; lockoutRemaining: number; attemptsRemaining: number } {
  const now = Date.now();
  const entry = failedLoginStore.get(identifier);

  // Check if currently locked out
  if (entry?.lockoutUntil && entry.lockoutUntil > now) {
    const lockoutRemaining = Math.ceil((entry.lockoutUntil - now) / 1000);
    return { isLocked: true, lockoutRemaining, attemptsRemaining: 0 };
  }

  // Reset if lockout expired
  if (entry?.lockoutUntil && entry.lockoutUntil <= now) {
    failedLoginStore.delete(identifier);
  }

  const currentEntry = failedLoginStore.get(identifier) || { count: 0, lockoutUntil: null };
  currentEntry.count++;

  if (currentEntry.count >= LOCKOUT_CONFIG.maxAttempts) {
    // Lock the account
    currentEntry.lockoutUntil = now + LOCKOUT_CONFIG.lockoutDurationMs;
    failedLoginStore.set(identifier, currentEntry);
    const lockoutRemaining = Math.ceil(LOCKOUT_CONFIG.lockoutDurationMs / 1000);
    return { isLocked: true, lockoutRemaining, attemptsRemaining: 0 };
  }

  failedLoginStore.set(identifier, currentEntry);
  return {
    isLocked: false,
    lockoutRemaining: 0,
    attemptsRemaining: LOCKOUT_CONFIG.maxAttempts - currentEntry.count,
  };
}

/**
 * Clear failed login attempts (call on successful login)
 * @param identifier - Email or IP address
 */
export function clearFailedLogins(identifier: string): void {
  failedLoginStore.delete(identifier);
}

/**
 * Check if an account is currently locked out
 * @param identifier - Email or IP address
 * @returns Object with isLocked boolean and lockoutRemaining in seconds
 */
export function checkLockout(
  identifier: string
): { isLocked: boolean; lockoutRemaining: number } {
  const now = Date.now();
  const entry = failedLoginStore.get(identifier);

  if (!entry?.lockoutUntil) {
    return { isLocked: false, lockoutRemaining: 0 };
  }

  if (entry.lockoutUntil > now) {
    const lockoutRemaining = Math.ceil((entry.lockoutUntil - now) / 1000);
    return { isLocked: true, lockoutRemaining };
  }

  // Lockout expired, clean up
  failedLoginStore.delete(identifier);
  return { isLocked: false, lockoutRemaining: 0 };
}
