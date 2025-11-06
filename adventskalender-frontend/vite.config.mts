import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import viteTsconfigPaths from 'vite-tsconfig-paths';
import browserslistToEsbuild from 'browserslist-to-esbuild';

export default defineConfig(() => {
    return {
        define: {
            __BUILD_DATE__: JSON.stringify(new Date().toISOString().split('T')[0]),
        },
        build: {
            outDir: 'build',
            sourcemap: false,
            target: browserslistToEsbuild(['>0.2%', 'not dead', 'not op_mini all']),
        },
        plugins: [
            react({
                jsxImportSource: '@emotion/react',
                babel: {
                    plugins: ['@emotion/babel-plugin'],
                },
            }),
            viteTsconfigPaths(),
            // Add security headers in development mode
            {
                name: 'security-headers',
                configureServer(server) {
                    server.middlewares.use((req, res, next) => {
                        // Prevent MIME type sniffing
                        res.setHeader('X-Content-Type-Options', 'nosniff');

                        // Prevent clickjacking by disallowing embedding in frames
                        res.setHeader('X-Frame-Options', 'DENY');

                        // Enable XSS protection in older browsers (header is deprecated but still useful for legacy browsers)
                        res.setHeader('X-XSS-Protection', '1; mode=block');

                        // Control referrer information sent with requests
                        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

                        next();
                    });
                },
            },
        ],
    };
});
