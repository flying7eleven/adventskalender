import { createContext } from 'react';
import type { Locale } from 'date-fns';

export interface ResourceDefinitions {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    english: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    german: any;
}

export type Language = 'de' | 'en';

export type TranslationVariable = string | number;

interface LocalizationContextType {
    resources: ResourceDefinitions;
    language: Language;
    dateLocale: Locale;
    translate: (key: string, variables?: TranslationVariable[]) => string;
}

export const LocalizationContext = createContext<LocalizationContextType>(null!);
