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

type WinnersOnDateMap = { [key: string]: SingleWinnerInformation[] };
