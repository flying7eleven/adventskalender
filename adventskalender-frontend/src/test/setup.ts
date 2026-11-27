import { TextEncoder, TextDecoder } from 'node:util';

Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, writable: true, configurable: true });
Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder, writable: true, configurable: true });

Object.defineProperty(globalThis, '__BUILD_DATE__', {
    value: '2024-11-30 18:30:00 UTC',
    writable: true,
    configurable: true,
});
