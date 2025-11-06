/**
 * SessionManager monitors session expiration and provides warnings.
 *
 * Note: Since JWT tokens are stored in httpOnly cookies (not accessible to JavaScript),
 * we track session start time client-side and assume 1-hour expiry as configured
 * on the backend. The actual token validation happens server-side.
 */
export class SessionManager {
    private expiryCheckInterval: NodeJS.Timeout | null = null;
    private warningTimeout: NodeJS.Timeout | null = null;
    private sessionStartTime: number | null = null;
    private readonly SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour
    private readonly WARNING_BEFORE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

    /**
     * Start monitoring a session that began now.
     * @param onExpirySoon Callback when session will expire in 5 minutes
     * @param onExpired Callback when session has expired
     */
    startMonitoring(onExpirySoon: () => void, onExpired: () => void) {
        this.stopMonitoring();

        // Record when session started
        this.sessionStartTime = Date.now();
        const expiresAt = this.sessionStartTime + this.SESSION_DURATION_MS;

        const now = Date.now();
        const timeUntilExpiry = expiresAt - now;

        // Schedule warning 5 minutes before expiry
        const warningTime = timeUntilExpiry - this.WARNING_BEFORE_EXPIRY_MS;
        if (warningTime > 0) {
            this.warningTimeout = setTimeout(() => {
                onExpirySoon();
            }, warningTime);
        } else {
            // Already past warning time, show warning immediately
            onExpirySoon();
        }

        // Check every minute for expiry
        this.expiryCheckInterval = setInterval(() => {
            if (Date.now() >= expiresAt) {
                this.stopMonitoring();
                onExpired();
            }
        }, 60000); // Check every 60 seconds
    }

    /**
     * Stop monitoring the current session.
     */
    stopMonitoring() {
        if (this.expiryCheckInterval) {
            clearInterval(this.expiryCheckInterval);
            this.expiryCheckInterval = null;
        }
        if (this.warningTimeout) {
            clearTimeout(this.warningTimeout);
            this.warningTimeout = null;
        }
        this.sessionStartTime = null;
    }

    /**
     * Extend the current session (reset the timer).
     * Call this when user performs an action that refreshes the session.
     * @param onExpirySoon Callback when session will expire in 5 minutes
     * @param onExpired Callback when session has expired
     */
    extendSession(onExpirySoon: () => void, onExpired: () => void) {
        // Restart monitoring with new start time
        this.startMonitoring(onExpirySoon, onExpired);
    }

    /**
     * Get the time remaining until session expires (in milliseconds).
     * Returns null if no session is being monitored.
     */
    getTimeRemaining(): number | null {
        if (!this.sessionStartTime) {
            return null;
        }
        const expiresAt = this.sessionStartTime + this.SESSION_DURATION_MS;
        const remaining = expiresAt - Date.now();
        return Math.max(0, remaining);
    }

    /**
     * Check if a session is currently being monitored.
     */
    isMonitoring(): boolean {
        return this.expiryCheckInterval !== null || this.warningTimeout !== null;
    }
}

// Export a singleton instance
export const sessionManager = new SessionManager();
