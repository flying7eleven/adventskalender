import { TextEncoder, TextDecoder } from 'node:util';

Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, writable: true, configurable: true });
Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder, writable: true, configurable: true });

Object.defineProperty(globalThis, '__DEV__', {
    value: false,
    writable: true,
    configurable: true,
});

Object.defineProperty(globalThis, '__PROD__', {
    value: false,
    writable: true,
    configurable: true,
});
