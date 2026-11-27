/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import browserslistToEsbuild from 'browserslist-to-esbuild';

export default defineConfig(({ mode }) => {
    return {
        define: {
            __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 19).replace('T', ' ')),
            __DEV__: JSON.stringify(mode === 'development'),
            __PROD__: JSON.stringify(mode === 'production'),
        },
        resolve: {
            alias: {
                '@': new URL('./src', import.meta.url).pathname,
            },
            tsconfigPaths: true,
        },
        build: {
            outDir: 'build',
            sourcemap: false,
            target: browserslistToEsbuild(['>0.2%', 'not dead', 'not op_mini all']),
        },
        test: {
            environment: 'jsdom',
            globals: true,
            setupFiles: ['./src/test/setup.ts', './src/setupTests.ts'],
        },
        plugins: [
            react(),
            // Add security headers in development mode
            {
                name: 'security-headers',
                configureServer(server) {
                    server.middlewares.use((req, res, next) => {
                        // Prevent MIME type sniffing
                        res.setHeader('X-Content-Type-Options', 'nosniff');

                        // Prevent clickjacking by disallowing embedding in frames
                        res.setHeader('X-Frame-Options', 'DENY');

                        // Disable the legacy XSS auditor of older browsers, it can be abused to leak information and the CSP replaces it
                        res.setHeader('X-XSS-Protection', '0');

                        // Control referrer information sent to external sites
                        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

                        // Deny access to browser features the application does not use
                        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');

                        // Content Security Policy for development
                        // Allows connection to backend API (localhost:5479) and Vite HMR WebSocket
                        // 'unsafe-inline' for script-src is needed for Vite's development inline scripts
                        res.setHeader(
                            'Content-Security-Policy',
                            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' http://localhost:5479 ws://localhost:*; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; media-src 'none'; worker-src 'none';"
                        );

                        next();
                    });
                },
            },
        ],
    };
});
