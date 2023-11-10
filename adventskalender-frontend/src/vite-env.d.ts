/// <reference types="vite/client" />

declare const __BUILD_TIMESTAMP__: number;

interface WinnerInformation {
    id: number;
    firstName: string;
    lastName: string;
}

type WinnersOnDateMap = { [key: string]: WinnerInformation[] };
