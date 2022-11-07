/// <reference types="react-scripts" />

interface WinnerInformation {
    firstName: string;
    lastName: string;
}

interface SingleWinnerInformation {
    id: number;
    first_name: string;
    last_name: string;
}

interface PickableParticipant {
    first_name: string;
    last_name: string;
    can_be_changed: boolean;
    is_pickable: boolean;
}

type PickableParticipantMap = { [key: number]: PickableParticipant };

type WinnersOnDateMap = { [key: string]: SingleWinnerInformation[] };
