/**
 * SessionManager monitors session expiration and provides warnings.
 *
 * The actual expiry of the session is determined by the backend JWT which is
 * stored in an httpOnly cookie. The backend reports the expiry timestamp
 * (UNIX seconds) via GET /auth/me, so monitoring is scheduled against that
 * real expiry instead of assuming a fixed duration from page load.
 */
export class SessionManager {
    private expiryTimeout: NodeJS.Timeout | null = null;
    private warningTimeout: NodeJS.Timeout | null = null;
    private readonly WARNING_BEFORE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

    /**
     * Start monitoring a session that expires at the given time.
     * @param expiresAtMs Session expiry in milliseconds (UNIX epoch)
     * @param onExpirySoon Callback when the session expires in 5 minutes
     * @param onExpired Callback when the session has expired
     */
    startMonitoring(expiresAtMs: number, onExpirySoon: () => void, onExpired: () => void) {
        this.stopMonitoring();

        const now = Date.now();
        const timeUntilExpiry = expiresAtMs - now;

        const warningDelay = timeUntilExpiry - this.WARNING_BEFORE_EXPIRY_MS;
        if (warningDelay > 0) {
            this.warningTimeout = setTimeout(() => {
                onExpirySoon();
            }, warningDelay);
        } else if (timeUntilExpiry > 0) {
            // Already past warning time, show warning immediately
            onExpirySoon();
        }

        if (timeUntilExpiry > 0) {
            this.expiryTimeout = setTimeout(() => {
                this.stopMonitoring();
                onExpired();
            }, timeUntilExpiry);
        } else {
            this.stopMonitoring();
            onExpired();
        }
    }

    /**
     * Stop monitoring the current session.
     */
    stopMonitoring() {
        if (this.expiryTimeout) {
            clearTimeout(this.expiryTimeout);
            this.expiryTimeout = null;
        }
        if (this.warningTimeout) {
            clearTimeout(this.warningTimeout);
            this.warningTimeout = null;
        }
    }
}

// Export a singleton instance
export const sessionManager = new SessionManager();
