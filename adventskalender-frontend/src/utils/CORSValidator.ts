/**
 * CORSValidator checks CORS configuration between frontend and backend.
 * Provides warnings for misconfigurations but doesn't block functionality.
 */
export class CORSValidator {
    private validationCompleted: boolean = false;

    /**
     * Validate CORS configuration by making an OPTIONS request.
     * This helps identify CORS misconfigurations early.
     *
     * @param apiUrl The base URL of the API to validate
     * @returns Promise<boolean> true if CORS is properly configured
     */
    async validateCORS(apiUrl: string): Promise<boolean> {
        // Only validate once per session
        if (this.validationCompleted) {
            return true;
        }

        try {
            // Make an OPTIONS request to check CORS headers
            // Note: We use a lightweight endpoint that doesn't require authentication
            const response = await fetch(`${apiUrl}/version`, {
                method: 'OPTIONS',
            });

            // Get CORS headers
            const allowedOrigin = response.headers.get('Access-Control-Allow-Origin');
            const allowedMethods = response.headers.get('Access-Control-Allow-Methods');
            const allowCredentials = response.headers.get('Access-Control-Allow-Credentials');
            const currentOrigin = window.location.origin;

            // Validate Access-Control-Allow-Origin
            if (allowedOrigin === '*') {
                console.warn('⚠️  SECURITY WARNING: Backend allows all origins (*). ' + 'This is insecure for production and should be restricted to specific origins.');
                // Still return true to not block functionality, but warn the developer
            } else if (allowedOrigin && allowedOrigin !== currentOrigin) {
                console.error(
                    `❌ CORS Error: Current origin "${currentOrigin}" is not in the allowed origins. ` + `Backend allows: "${allowedOrigin}". ` + 'API requests will fail due to CORS policy.'
                );
                this.validationCompleted = true;
                return false;
            } else if (allowedOrigin === currentOrigin) {
                console.log(`✅ CORS validation passed: Origin "${currentOrigin}" is allowed`);
            }

            // Validate credentials support (required for httpOnly cookies)
            if (allowCredentials !== 'true') {
                console.warn('⚠️  CORS Warning: Access-Control-Allow-Credentials is not set to "true". ' + 'Authentication with httpOnly cookies may fail.');
            }

            // Log allowed methods for debugging
            if (allowedMethods) {
                console.log(`📋 CORS allowed methods: ${allowedMethods}`);
            }

            this.validationCompleted = true;
            return true;
        } catch (error) {
            // CORS validation failed - this might be expected in some environments
            console.warn(
                '⚠️  CORS validation could not be completed. This may be expected if:\n' +
                    '  - The backend is not running\n' +
                    '  - OPTIONS requests are not supported\n' +
                    '  - Network connectivity issues\n' +
                    `Error: ${error instanceof Error ? error.message : String(error)}`
            );

            // Don't block functionality if validation fails
            this.validationCompleted = true;
            return true;
        }
    }

    /**
     * Reset validation state (useful for testing or re-validation)
     */
    reset() {
        this.validationCompleted = false;
    }

    /**
     * Check if validation has been completed
     */
    isValidated(): boolean {
        return this.validationCompleted;
    }
}

// Export a singleton instance
export const corsValidator = new CORSValidator();
