/// <reference types="vite/client" />

declare const __BUILD_DATE__: string;
declare const __DEV__: boolean;
declare const __PROD__: boolean;

interface WinnerInformation2 {
    id: number;
    first_name: string;
    last_name: string;
    present_identifier?: string | null;
}

type StringMap = { [key: string]: string };
type BooleanMap = { [key: string]: boolean };
type WinnersOnDateMap = { [key: string]: WinnerInformation2[] };
