import { render, screen, waitFor } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import { VersionView } from './index';
import { MemoryRouter } from 'react-router-dom';
import { AuthenticationProvider } from '../../provider/AuthenticationProvider';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';
import { API_BACKEND_URL } from '../../api';

const renderView = () =>
    render(
        <MemoryRouter>
            <AuthenticationProvider>
                <LocalizationProvider resources={{ english: English, german: English }}>
                    <VersionView />
                </LocalizationProvider>
            </AuthenticationProvider>
        </MemoryRouter>
    );

describe('VersionView', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('requests the audit count with credentials and shows it', async () => {
        global.fetch = vi.fn().mockImplementation((url: RequestInfo | URL, init?: RequestInit) => {
            if (String(url) === `${API_BACKEND_URL}/audit/count`) {
                expect(init).toBeDefined();
                return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ count: 7 }) } as unknown as Response);
            }
            if (String(url) === `${API_BACKEND_URL}/version`) {
                return Promise.resolve({
                    status: 200,
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            backend_version: '1.2.3',
                            backend_arch: 'aarch64',
                            rustc_version: '1.80.0',
                            build_date: '2024-12-01',
                            build_time: '12:00:00',
                        }),
                } as unknown as Response);
            }
            return Promise.resolve({ status: 404, ok: false } as unknown as Response);
        });

        renderView();

        await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument());
        const auditCall = (global.fetch as Mock).mock.calls.find((call) => String(call[0]) === `${API_BACKEND_URL}/audit/count`);
        expect(auditCall?.[1]).toEqual(expect.objectContaining({ credentials: 'include' }));
    });

    test('logs the user out when the audit count request is rejected as unauthenticated', async () => {
        global.fetch = vi.fn().mockImplementation((url: RequestInfo | URL) => {
            if (String(url) === `${API_BACKEND_URL}/audit/count`) {
                return Promise.resolve({ status: 401, ok: false } as unknown as Response);
            }
            if (String(url) === `${API_BACKEND_URL}/version`) {
                return Promise.resolve({
                    status: 200,
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            backend_version: '1.2.3',
                            backend_arch: 'aarch64',
                            rustc_version: '1.80.0',
                            build_date: '2024-12-01',
                            build_time: '12:00:00',
                        }),
                } as unknown as Response);
            }
            return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({}) } as unknown as Response);
        });

        renderView();

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/logout`, expect.anything()));
    });
});
