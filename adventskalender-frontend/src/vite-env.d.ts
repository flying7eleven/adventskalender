/// <reference types="vite/client" />

declare const __BUILD_TIMESTAMP__: number;

interface WinnerInformation {
    id: number;
    firstName: string;
    lastName: string;
    presentIdentifier?: string;
}

interface WinnerInformation2 {
    id: number;
    first_name: string;
    last_name: string;
    present_identifier?: string;
}

type WinnersOnDateMap = { [key: string]: WinnerInformation2[] };
