/// <reference types="react-scripts" />

interface SingleWinnerInformation {
    first_name: string;
    last_name: string;
}

type Foo = { [key: string]: SingleWinnerInformation[] };
