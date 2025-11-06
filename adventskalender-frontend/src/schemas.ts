import { z } from 'zod';

// Schema for participant count response
export const ParticipantCountSchema = z.object({
    number_of_participants: z.number().int().nonnegative(),
    number_of_participants_won: z.number().int().nonnegative(),
    number_of_participants_still_in_raffle: z.number().int().nonnegative(),
});

// Schema for participant data
export const ParticipantSchema = z.object({
    id: z.number().int().positive(),
    first_name: z.string().min(1).max(100),
    last_name: z.string().min(1).max(100),
    present_identifier: z.string().max(10).optional(),
});

// Schema for winner information
export const WinnerInformationSchema = z.object({
    id: z.number().int().positive(),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    presentIdentifier: z.string().max(10).optional(),
});

// Schema for access token (Note: with httpOnly cookies, this may not be used)
export const AccessTokenSchema = z.object({
    accessToken: z.string().min(1),
});

// Schema for version information
export const VersionInformationSchema = z.object({
    backend_version: z.string().min(1),
    backend_arch: z.string().min(1),
    rustc_version: z.string().min(1),
    build_date: z.string().min(1),
    build_time: z.string().min(1),
});

// Schema for audit event count
export const AuditEventCountSchema = z.object({
    count: z.number().int().nonnegative(),
});

// Schema for arrays of participants
export const ParticipantArraySchema = z.array(ParticipantSchema);

// Schema for arrays of winners
export const WinnerInformationArraySchema = z.array(WinnerInformationSchema);

// Schema for simple count responses (just a number)
export const CountSchema = z.number().int().nonnegative();

// Schema for WinnerInformation2 (similar to Participant but from vite-env.d.ts)
export const WinnerInformation2Schema = z.object({
    id: z.number().int().positive(),
    first_name: z.string().min(1).max(100),
    last_name: z.string().min(1).max(100),
    present_identifier: z.string().max(10).optional(),
});

// Schema for WinnersOnDateMap - a map of dates to arrays of winners
export const WinnersOnDateMapSchema = z.record(z.string(), z.array(WinnerInformation2Schema));
