export const API_BACKEND_URL = '/api/v1';

export interface ParticipantCount {
    number_of_participants: number;
    number_of_participants_won: number;
    number_of_participants_still_in_raffle: number;
}

export interface AccessToken {
    accessToken: string;
}
