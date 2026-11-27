import { render, screen, waitFor } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import userEvent from '@testing-library/user-event';
import { CalendarView } from './index';
import { RequireAuthentication } from '../../components/RequireAuthentication';
import { MemoryRouter } from 'react-router';
import { AuthenticationProvider } from '../../provider/AuthenticationProvider';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';
import German from '../../languages/de.json';
import { API_BACKEND_URL, WinnerInformation } from '../../api';

vi.mock('../../components/WinnerCard', () => ({
    WinnerCard: ({ winningDate, listOfWinner, updateWinnerList }: { winningDate: string; listOfWinner: WinnerInformation[]; updateWinnerList?: () => void }) => (
        <section aria-label={winningDate}>
            {listOfWinner.map((winner) => (
                <p key={winner.id}>{`${winner.firstName} ${winner.lastName}`}</p>
            ))}
            <button onClick={updateWinnerList}>{`refresh ${winningDate}`}</button>
        </section>
    ),
}));

type FakeResponse = { status: number; ok: boolean; json: () => Promise<unknown> };

const json = (status: number, body: unknown): FakeResponse => ({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) });

const deferred = () => {
    let resolve!: (value: FakeResponse) => void;
    const promise = new Promise<FakeResponse>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
};

const winner = (id: number, firstName: string, lastName: string) => ({ id, first_name: firstName, last_name: lastName, present_identifier: null });

const mockWinnerResponses = (...responses: (() => FakeResponse | Promise<FakeResponse>)[]) => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === `${API_BACKEND_URL}/auth/me`) {
            return json(200, { username: 'test', expires_in: 3600 });
        }
        if (url === `${API_BACKEND_URL}/auth/logout`) {
            return { status: 204, ok: true, json: () => Promise.reject(new Error('no body')) };
        }
        if (url === `${API_BACKEND_URL}/participants/won`) {
            const respond = responses[Math.min(call, responses.length - 1)];
            call += 1;
            return respond();
        }
        return json(404, {});
    });
};

const winnerRequests = () => (global.fetch as Mock).mock.calls.filter(([url]) => url === `${API_BACKEND_URL}/participants/won`).length;

const renderView = (resources = { english: English, german: English }) =>
    render(
        <MemoryRouter>
            <AuthenticationProvider>
                <LocalizationProvider resources={resources}>
                    <RequireAuthentication>
                        <CalendarView />
                    </RequireAuthentication>
                </LocalizationProvider>
            </AuthenticationProvider>
        </MemoryRouter>
    );

describe('CalendarView', () => {
    test('shows a loading message until the winners arrive', async () => {
        const pending = deferred();
        mockWinnerResponses(() => pending.promise);
        renderView();

        expect(await screen.findByText(English.calendar.loading)).toBeInTheDocument();
        expect(screen.queryByText(English.calendar.empty)).not.toBeInTheDocument();
        expect(screen.queryByText(English.calendar.load_error)).not.toBeInTheDocument();

        pending.resolve(json(200, { '2026-12-01': [winner(1, 'Max', 'Mustermann')] }));

        expect(await screen.findByText('Max Mustermann')).toBeInTheDocument();
        expect(screen.queryByText(English.calendar.loading)).not.toBeInTheDocument();
    });

    test('shows an error message when the winners cannot be loaded', async () => {
        mockWinnerResponses(() => json(500, {}));
        renderView();

        expect(await screen.findByRole('alert')).toHaveTextContent(English.calendar.load_error);
        expect(screen.queryByText(English.calendar.loading)).not.toBeInTheDocument();
        expect(screen.queryByText(English.calendar.empty)).not.toBeInTheDocument();
    });

    test('shows an error message when the backend is unreachable', async () => {
        mockWinnerResponses(() => Promise.reject(new TypeError('Failed to fetch')));
        renderView();

        expect(await screen.findByRole('alert')).toHaveTextContent(English.calendar.load_error);
    });

    test('shows an empty message when nobody has won yet', async () => {
        mockWinnerResponses(() => json(200, {}));
        renderView();

        expect(await screen.findByText(English.calendar.empty)).toBeInTheDocument();
        expect(screen.queryByText(English.calendar.loading)).not.toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.queryByRole('region')).not.toBeInTheDocument();
    });

    test('shows the states in German', async () => {
        mockWinnerResponses(() => json(200, {}));
        renderView({ english: German, german: German });

        expect(await screen.findByText(German.calendar.empty)).toBeInTheDocument();
    });

    test('renders one card per day sorted by date', async () => {
        mockWinnerResponses(() =>
            json(200, {
                '2026-12-02': [winner(2, 'Erika', 'Musterfrau')],
                '2026-12-01': [winner(1, 'Max', 'Mustermann'), winner(3, 'John', 'Doe')],
            })
        );
        renderView();

        await waitFor(() => expect(screen.getAllByRole('region')).toHaveLength(2));
        const cards = screen.getAllByRole('region');
        expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual(['2026-12-01', '2026-12-02']);
        expect(cards[0]).toHaveTextContent('Max Mustermann');
        expect(cards[0]).toHaveTextContent('John Doe');
        expect(cards[1]).toHaveTextContent('Erika Musterfrau');
        expect(screen.queryByText(English.calendar.empty)).not.toBeInTheDocument();
        expect(screen.queryByText(English.calendar.loading)).not.toBeInTheDocument();
    });

    test('ignores stale responses and keeps the latest winners', async () => {
        const slowRefresh = deferred();
        mockWinnerResponses(
            () => json(200, { '2026-12-01': [winner(1, 'Max', 'Mustermann')] }),
            () => slowRefresh.promise,
            () => json(200, { '2026-12-01': [winner(1, 'Max', 'Mustermann')], '2026-12-02': [winner(2, 'Erika', 'Musterfrau')] })
        );
        renderView();
        const user = userEvent.setup();

        await user.click(await screen.findByRole('button', { name: 'refresh 2026-12-01' }));
        await waitFor(() => expect(winnerRequests()).toBe(2));
        await user.click(screen.getByRole('button', { name: 'refresh 2026-12-01' }));
        expect(await screen.findByText('Erika Musterfrau')).toBeInTheDocument();

        slowRefresh.resolve(json(200, {}));
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(screen.getByText('Erika Musterfrau')).toBeInTheDocument();
        expect(screen.queryByText(English.calendar.empty)).not.toBeInTheDocument();
    });

    test('ignores errors of stale requests', async () => {
        const slowRefresh = deferred();
        mockWinnerResponses(
            () => json(200, { '2026-12-01': [winner(1, 'Max', 'Mustermann')] }),
            () => slowRefresh.promise,
            () => json(200, { '2026-12-02': [winner(2, 'Erika', 'Musterfrau')] })
        );
        renderView();
        const user = userEvent.setup();

        await user.click(await screen.findByRole('button', { name: 'refresh 2026-12-01' }));
        await waitFor(() => expect(winnerRequests()).toBe(2));
        await user.click(screen.getByRole('button', { name: 'refresh 2026-12-01' }));
        expect(await screen.findByText('Erika Musterfrau')).toBeInTheDocument();

        slowRefresh.resolve(json(500, {}));
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByText('Erika Musterfrau')).toBeInTheDocument();
    });

    test('keeps the winners visible and shows the error when a refresh fails', async () => {
        mockWinnerResponses(
            () => json(200, { '2026-12-01': [winner(1, 'Max', 'Mustermann')] }),
            () => json(500, {})
        );
        renderView();
        const user = userEvent.setup();

        await user.click(await screen.findByRole('button', { name: 'refresh 2026-12-01' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(English.calendar.load_error);
        expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
    });

    test('logs the user out when the session expired', async () => {
        mockWinnerResponses(() => json(401, {}));
        renderView();

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/logout`, expect.anything()));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
