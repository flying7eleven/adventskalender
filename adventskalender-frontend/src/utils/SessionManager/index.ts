/**
 * SessionManager monitors session expiration and provides warnings.
 *
 * The actual expiry of the session is determined by the backend JWT which is
 * stored in an httpOnly cookie. The backend reports the remaining lifetime in
 * seconds via GET /auth/me, so monitoring is scheduled against that server
 * reported time instead of the client's clock.
 */
export class SessionManager {
    private expiryTimeout: NodeJS.Timeout | null = null;
    private warningTimeout: NodeJS.Timeout | null = null;
    private readonly WARNING_BEFORE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

    /**
     * Start monitoring a session with the given remaining lifetime.
     * @param expiresInSeconds Remaining session lifetime in seconds, as reported by the backend
     * @param onExpirySoon Callback when the session expires in 5 minutes
     * @param onExpired Callback when the session has expired
     */
    startMonitoring(expiresInSeconds: number, onExpirySoon: () => void, onExpired: () => void) {
        this.stopMonitoring();

        const timeUntilExpiry = expiresInSeconds * 1000;

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
