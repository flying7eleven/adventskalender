import { ReactNode, useEffect } from 'react';
import { de, enUS } from 'date-fns/locale';
import { Language, LocalizationContext, ResourceDefinitions, TranslationVariable } from '../LocalizationContext';

interface Props {
    children: ReactNode | ReactNode[];
    resources: ResourceDefinitions;
}

const replaceVariables = (text: string, variables: TranslationVariable[]) =>
    text.replace(/\{(\d+)\}/g, (placeholder, index: string) => {
        const variable = variables[Number(index)];
        return variable === undefined ? placeholder : String(variable);
    });

export const LocalizationProvider = (props: Props) => {
    const language: Language = navigator.language.split('-')[0].toLowerCase() === 'de' ? 'de' : 'en';
    const dateLocale = language === 'de' ? de : enUS;

    useEffect(() => {
        document.documentElement.lang = language;
    }, [language]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deepFind = (obj: any, path: string) => {
        const paths = path.split('.');
        let current = obj;
        for (let i = 0; i < paths.length; ++i) {
            if (current[paths[i]] === undefined) {
                return undefined;
            } else {
                current = current[paths[i]];
            }
        }
        return current;
    };

    const translate = (key: string, variables: TranslationVariable[] = []) => {
        const translationLanguage = language === 'de' ? props.resources.german : props.resources.english;

        const translatedValue = deepFind(translationLanguage, key);
        if (!translatedValue) {
            console.error(`Could not find localization for '${key}' (selected navigator language was ${navigator.language})`);
            return key;
        }

        return replaceVariables(translatedValue, variables);
    };

    const value = { resources: props.resources, language, dateLocale, translate };

    return <LocalizationContext.Provider value={value}>{props.children}</LocalizationContext.Provider>;
};
