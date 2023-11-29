/// <reference types="vite/client" />

declare const __BUILD_TIMESTAMP__: number;

interface WinnerInformation2 {
    id: number;
    first_name: string;
    last_name: string;
    present_identifier?: string;
}

type StringMap = { [key: string]: string };
type BooleanMap = { [key: string]: boolean };
type WinnersOnDateMap = { [key: string]: WinnerInformation2[] };
