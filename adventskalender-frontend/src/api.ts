const determineApiUrl = () => {
    if (window.location && process.env.NODE_ENV === 'production') {
        const locationValue = `${window.location}`;
        if (locationValue.slice(-1) === '/') {
            return `${locationValue}api`;
        }
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

export interface AccessToken {
    accessToken: string;
}
