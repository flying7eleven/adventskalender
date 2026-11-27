import { vi, type Mock } from 'vitest';
import { z } from 'zod';
import { API_BACKEND_URL, ApiAuthExpiredError, ApiResponseError, ApiSchemaError, apiFetch } from './api';

const CountSchema = z.object({ count: z.number() });

const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const mockFetch = (response: Response | Promise<Response>) => {
    global.fetch = vi.fn().mockReturnValue(Promise.resolve(response));
};

const lastInit = (): RequestInit => (global.fetch as Mock).mock.calls[0][1];

describe('apiFetch', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('request', () => {
        test('prefixes the path with the API base URL and always sends the cookies', async () => {
            mockFetch(jsonResponse(200, { count: 1 }));

            await apiFetch('/audit/count', CountSchema);

            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect((global.fetch as Mock).mock.calls[0][0]).toBe(`${API_BACKEND_URL}/audit/count`);
            expect(lastInit()).toEqual(expect.objectContaining({ method: 'GET', credentials: 'include' }));
        });

        test('sends no Content-Type and no body on a GET request', async () => {
            mockFetch(jsonResponse(200, { count: 1 }));

            await apiFetch('/audit/count', CountSchema);

            expect(lastInit().headers).toBeUndefined();
            expect(lastInit().body).toBeUndefined();
        });

        test('sends no Content-Type and no body on a DELETE request', async () => {
            mockFetch(new Response(null, { status: 204 }));

            await apiFetch('/participants/won/1', { method: 'DELETE' });

            expect(lastInit()).toEqual(expect.objectContaining({ method: 'DELETE', credentials: 'include' }));
            expect(lastInit().headers).toBeUndefined();
            expect(lastInit().body).toBeUndefined();
        });

        test('sends no Content-Type on a POST request without a body', async () => {
            mockFetch(new Response(null, { status: 204 }));

            await apiFetch('/auth/logout', { method: 'POST' });

            expect(lastInit().method).toBe('POST');
            expect(lastInit().headers).toBeUndefined();
        });

        test('serializes the body as JSON and declares it with a Content-Type header', async () => {
            mockFetch(new Response(null, { status: 204 }));

            await apiFetch('/participants/1', { method: 'PUT', body: { package: 'A' } });

            expect(lastInit()).toEqual(expect.objectContaining({ method: 'PUT', credentials: 'include' }));
            expect(lastInit().headers).toEqual({ 'Content-Type': 'application/json' });
            expect(JSON.parse(lastInit().body as string)).toEqual({ package: 'A' });
        });

        test('sends a body which is an empty string', async () => {
            mockFetch(new Response(null, { status: 204 }));

            await apiFetch('/participants/1', { method: 'PUT', body: '' });

            expect(lastInit().body).toBe('""');
            expect(lastInit().headers).toEqual({ 'Content-Type': 'application/json' });
        });
    });

    describe('successful responses', () => {
        test('returns the body parsed by the schema', async () => {
            mockFetch(jsonResponse(200, { count: 7, ignored: true }));

            await expect(apiFetch('/audit/count', CountSchema)).resolves.toEqual({ count: 7 });
        });

        test('resolves without reading the body when no schema is given', async () => {
            const response = new Response(null, { status: 204 });
            const json = vi.spyOn(response, 'json');
            mockFetch(response);

            await expect(apiFetch('/participants/won/1', { method: 'DELETE' })).resolves.toBeUndefined();
            expect(json).not.toHaveBeenCalled();
        });

        test('ignores a body when no schema is given', async () => {
            mockFetch(jsonResponse(200, { unexpected: 'content' }));

            await expect(apiFetch('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
        });

        test('validates an empty 204 response against the schema without reading the body', async () => {
            const response = new Response(null, { status: 204 });
            const json = vi.spyOn(response, 'json');
            mockFetch(response);

            await expect(apiFetch('/something', z.undefined())).resolves.toBeUndefined();
            expect(json).not.toHaveBeenCalled();
        });

        test('accepts every 2xx status', async () => {
            mockFetch(jsonResponse(201, { count: 3 }));

            await expect(apiFetch('/audit/count', CountSchema)).resolves.toEqual({ count: 3 });
        });
    });

    describe('status mapping', () => {
        test.each([401, 403])('maps %i to the auth-expired error', async (status) => {
            mockFetch(new Response(null, { status }));

            const error = await apiFetch('/audit/count', CountSchema).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(ApiAuthExpiredError);
            expect(error).toEqual(expect.objectContaining({ status }));
        });

        test('maps 401 to the auth-expired error also for requests without a schema', async () => {
            mockFetch(new Response(null, { status: 401 }));

            await expect(apiFetch('/participants/won/1', { method: 'DELETE' })).rejects.toBeInstanceOf(ApiAuthExpiredError);
        });

        test.each([400, 404, 409, 422, 429, 500, 503])('maps %i to a response error which exposes the status', async (status) => {
            mockFetch(new Response(null, { status }));

            const error = await apiFetch('/participants/pick/1/for/2026-12-1', CountSchema, { method: 'POST' }).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(ApiResponseError);
            expect(error).not.toBeInstanceOf(ApiAuthExpiredError);
            expect((error as ApiResponseError).status).toBe(status);
        });

        test('exposes the response of a rejected request so callers can read its headers and body', async () => {
            mockFetch(new Response(JSON.stringify({ reason: 'password_too_weak' }), { status: 422, headers: { 'Retry-After': '42' } }));

            const error = (await apiFetch('/auth/password', { method: 'PUT', body: {} }).catch((e: unknown) => e)) as ApiResponseError;

            expect(error.response.headers.get('Retry-After')).toBe('42');
            await expect(error.response.json()).resolves.toEqual({ reason: 'password_too_weak' });
        });

        test('rejects a non-2xx response without validating its body', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            mockFetch(jsonResponse(500, { unexpected: 'content' }));

            await expect(apiFetch('/version', CountSchema)).rejects.toBeInstanceOf(ApiResponseError);
            expect(consoleError).not.toHaveBeenCalled();
        });
    });

    describe('invalid responses', () => {
        test('throws a schema error and logs it when the body does not match the schema', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            mockFetch(jsonResponse(200, { count: 'seven' }));

            const error = await apiFetch('/audit/count', CountSchema).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(ApiSchemaError);
            expect((error as ApiSchemaError).cause).toBeInstanceOf(z.ZodError);
            expect(consoleError).toHaveBeenCalledTimes(1);
        });

        test('throws a schema error when the body is not valid JSON', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            mockFetch(new Response('not json', { status: 200 }));

            await expect(apiFetch('/audit/count', CountSchema)).rejects.toBeInstanceOf(ApiSchemaError);
        });

        test('throws a schema error when a 204 response arrives where a body is expected', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            mockFetch(new Response(null, { status: 204 }));

            await expect(apiFetch('/audit/count', CountSchema)).rejects.toBeInstanceOf(ApiSchemaError);
        });
    });

    test('passes network failures through unchanged', async () => {
        const networkError = new TypeError('Failed to fetch');
        global.fetch = vi.fn().mockRejectedValue(networkError);

        await expect(apiFetch('/audit/count', CountSchema)).rejects.toBe(networkError);
    });
});
