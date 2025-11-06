/**
 * RateLimiter implements exponential backoff for failed attempts.
 * This provides client-side protection against brute force attacks.
 */
export class RateLimiter {
    private attempts: Map<string, number> = new Map();
    private lastAttempt: Map<string, number> = new Map();

    /**
     * Check if an attempt can be made for the given key.
     * @param key Unique identifier for the action (e.g., 'login:username')
     * @returns true if the attempt is allowed, false if backoff period is active
     */
    canAttempt(key: string): boolean {
        const attempts = this.attempts.get(key) || 0;
        const last = this.lastAttempt.get(key) || 0;
        const now = Date.now();

        // First attempt is always allowed
        if (attempts === 0) return true;

        // Calculate exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
        const backoffTime = Math.min(1000 * Math.pow(2, attempts - 1), 30000);
        return now - last >= backoffTime;
    }

    /**
     * Record an attempt and update the rate limiting state.
     * @param key Unique identifier for the action
     * @param success Whether the attempt was successful
     */
    recordAttempt(key: string, success: boolean) {
        if (success) {
            // Success - clear all tracking for this key
            this.attempts.delete(key);
            this.lastAttempt.delete(key);
        } else {
            // Failure - increment attempt counter and record timestamp
            const attempts = (this.attempts.get(key) || 0) + 1;
            this.attempts.set(key, attempts);
            this.lastAttempt.set(key, Date.now());
        }
    }

    /**
     * Get the remaining wait time in milliseconds before another attempt is allowed.
     * @param key Unique identifier for the action
     * @returns Wait time in milliseconds, or 0 if attempt is allowed
     */
    getWaitTime(key: string): number {
        const attempts = this.attempts.get(key) || 0;
        const last = this.lastAttempt.get(key) || 0;

        // No previous attempts
        if (attempts === 0) return 0;

        // Calculate backoff time and remaining wait
        const backoffTime = Math.min(1000 * Math.pow(2, attempts - 1), 30000);
        const elapsed = Date.now() - last;
        return Math.max(0, backoffTime - elapsed);
    }

    /**
     * Get the number of failed attempts for a given key.
     * @param key Unique identifier for the action
     * @returns Number of failed attempts
     */
    getAttemptCount(key: string): number {
        return this.attempts.get(key) || 0;
    }
}

// Export a singleton instance
export const rateLimiter = new RateLimiter();
