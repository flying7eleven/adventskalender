import type { ZodType } from 'zod';

const determineApiUrl = () => {
    if (typeof window !== 'undefined' && window.location && __PROD__) {
        const locationValue = `${window.location.protocol}//${window.location.host}`;
        return `${locationValue}/api`;
    }
    return 'http://localhost:5479';
};

export const API_BACKEND_URL = `${determineApiUrl()}/v1`;

export class ApiAuthExpiredError extends Error {
    readonly status: number;

    constructor(status: number) {
        super(`The API rejected the session with status ${status}`);
        this.name = 'ApiAuthExpiredError';
        this.status = status;
    }
}

export class ApiResponseError extends Error {
    readonly status: number;
    readonly response: Response;

    constructor(response: Response) {
        super(`The API responded with status ${response.status}`);
        this.name = 'ApiResponseError';
        this.status = response.status;
        this.response = response;
    }
}

export class ApiSchemaError extends Error {
    readonly cause: unknown;

    constructor(cause: unknown) {
        super('The API response does not match the expected schema');
        this.name = 'ApiSchemaError';
        this.cause = cause;
    }
}

export interface ApiRequestInit {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
}

export function apiFetch(path: string, init?: ApiRequestInit): Promise<void>;
export function apiFetch<T>(path: string, schema: ZodType<T>, init?: ApiRequestInit): Promise<T>;
export async function apiFetch<T>(path: string, schemaOrInit?: ZodType<T> | ApiRequestInit, maybeInit?: ApiRequestInit): Promise<T | void> {
    const hasSchema = schemaOrInit !== undefined && 'safeParse' in schemaOrInit;
    const schema = hasSchema ? (schemaOrInit as ZodType<T>) : undefined;
    const init = (hasSchema ? maybeInit : (schemaOrInit as ApiRequestInit | undefined)) ?? {};
    const hasBody = init.body !== undefined;

    const response = await fetch(`${API_BACKEND_URL}${path}`, {
        method: init.method ?? 'GET',
        credentials: 'include',
        ...(hasBody && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) }),
    });

    if (response.status === 401 || response.status === 403) {
        throw new ApiAuthExpiredError(response.status);
    }
    if (!response.ok) {
        throw new ApiResponseError(response);
    }
    if (!schema) {
        return;
    }

    try {
        const data: unknown = response.status === 204 ? undefined : await response.json();
        return schema.parse(data);
    } catch (error) {
        console.error('API response validation failed:', error);
        throw new ApiSchemaError(error);
    }
}

export const MAX_WINNERS_PER_DAY = 5;

export interface ParticipantCount {
    number_of_participants: number;
    number_of_participants_won: number;
    number_of_participants_still_in_raffle: number;
}

export interface Participant {
    id: number;
    first_name: string;
    last_name: string;
    present_identifier?: string | null;
}

export interface WinnerInformation {
    id: number;
    firstName: string;
    lastName: string;
    presentIdentifier?: string | null;
}

export interface AccessToken {
    accessToken: string;
}

export interface VersionInformation {
    backend_version: string;
    rustc_version: string;
    build_date: string;
    build_time: string;
    backend_arch: string;
}

export interface AuditEventCount {
    count: number;
}
