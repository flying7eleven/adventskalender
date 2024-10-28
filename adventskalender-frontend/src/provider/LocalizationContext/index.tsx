import { createContext } from 'react';

export interface ResourceDefinitions {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    english: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    german: any;
}

interface LocalizationContextType {
    resources: ResourceDefinitions;
    translate: (key: string) => string;
    translateWithPlaceholder: (key: string, placeholder: string) => string;
}

export const LocalizationContext = createContext<LocalizationContextType>(null!);
