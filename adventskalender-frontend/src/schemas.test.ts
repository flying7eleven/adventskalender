import { SessionInformationSchema } from './schemas';

describe('SessionInformationSchema', () => {
    test('accepts a session that is already in its last second', () => {
        expect(SessionInformationSchema.parse({ username: 'test', expires_in: 0 })).toEqual({ username: 'test', expires_in: 0 });
    });

    test('rejects a negative remaining lifetime', () => {
        expect(SessionInformationSchema.safeParse({ username: 'test', expires_in: -1 }).success).toBe(false);
    });

    test('rejects a non-integer remaining lifetime', () => {
        expect(SessionInformationSchema.safeParse({ username: 'test', expires_in: 1.5 }).success).toBe(false);
    });
});
