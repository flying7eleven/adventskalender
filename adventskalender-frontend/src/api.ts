const determineApiUrl = () => {
    if (window.location && import.meta.env.PROD) {
        const locationValue = `${window.location.protocol}//${window.location.host}`;
        return `${locationValue}/api`;
    }
    return 'http://localhost:5479';
};

export const API_BACKEND_URL = `${determineApiUrl()}/v1`;

export interface ParticipantCount {
    number_of_participants: number;
    number_of_participants_won: number;
    number_of_participants_still_in_raffle: number;
}

export interface Participant {
    id: number;
    first_name: string;
    last_name: string;
    present_identifier?: string;
}

export interface WinnerInformation {
    id: number;
    firstName: string;
    lastName: string;
    presentIdentifier?: string;
}

export interface AccessToken {
    accessToken: string;
}

export interface VersionInformation {
    backend_version: string;
    backend_arch: string;
    rustc_version: string;
    build_date: string;
    build_time: string;
}

export interface AuditEventCount {
    count: number;
}
