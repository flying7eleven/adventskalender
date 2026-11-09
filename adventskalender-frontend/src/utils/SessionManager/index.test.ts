import { SessionManager } from './index';
import { vi } from 'vitest';

vi.useFakeTimers();

const now = 1700000000000;

const advanceTo = async (target: number) => {
    while (Date.now() < target) {
        const step = Math.min(60000, target - Date.now());
        await vi.advanceTimersByTimeAsync(step);
    }
};

describe('SessionManager', () => {
    beforeEach(() => {
        vi.setSystemTime(now);
    });

    afterEach(() => {
        vi.setSystemTime(now);
    });

    test('shows the warning 5 minutes before the given remaining lifetime and expires at it', async () => {
        const sessionManager = new SessionManager();
        const onExpirySoon = vi.fn();
        const onExpired = vi.fn();

        sessionManager.startMonitoring(50 * 60, onExpirySoon, onExpired);

        await advanceTo(now + 45 * 60 * 1000 - 1);
        expect(onExpirySoon).not.toHaveBeenCalled();
        expect(onExpired).not.toHaveBeenCalled();

        await advanceTo(now + 45 * 60 * 1000);
        expect(onExpirySoon).toHaveBeenCalledTimes(1);
        expect(onExpired).not.toHaveBeenCalled();

        await advanceTo(now + 50 * 60 * 1000);
        expect(onExpired).toHaveBeenCalledTimes(1);
    });

    test('shows the warning immediately when the given remaining lifetime is less than 5 minutes', async () => {
        const sessionManager = new SessionManager();
        const onExpirySoon = vi.fn();
        const onExpired = vi.fn();

        sessionManager.startMonitoring(2 * 60, onExpirySoon, onExpired);

        expect(onExpirySoon).toHaveBeenCalledTimes(1);
        expect(onExpired).not.toHaveBeenCalled();

        await advanceTo(now + 2 * 60 * 1000);
        expect(onExpired).toHaveBeenCalledTimes(1);
    });

    test('does not fire callbacks of a stopped session', async () => {
        const sessionManager = new SessionManager();
        const onExpirySoon = vi.fn();
        const onExpired = vi.fn();

        sessionManager.startMonitoring(50 * 60, onExpirySoon, onExpired);
        sessionManager.stopMonitoring();

        await advanceTo(now + 120 * 60 * 1000);
        expect(onExpirySoon).not.toHaveBeenCalled();
        expect(onExpired).not.toHaveBeenCalled();
    });
});
