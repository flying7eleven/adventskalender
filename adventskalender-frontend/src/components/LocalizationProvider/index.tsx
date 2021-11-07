import React, { createContext, ReactNode } from 'react';

interface ResourceDefinitions {
    english: any;
    german: any;
}

interface Props {
    children: ReactNode[];
    resources: ResourceDefinitions;
}

interface LocalizationContextType {
    resources: ResourceDefinitions;
    translate: (key: string) => string;
}

export const LocalizationContext = createContext<LocalizationContextType>(null!);

export const LocalizationProvider = (props: Props) => {
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

    const getTranslationLanguage = () => {
        const navigatorLanguage = navigator.language.split('-');
        switch (navigatorLanguage[0].toLowerCase()) {
            case 'de':
                return props.resources.german;
            case 'en':
            default:
                return props.resources.english;
        }
    };

    const getTranslatedString = (key: string) => {
        // get the correct dictionary for the translation
        const translationLanguage = getTranslationLanguage();

        // get the translation for the key and handle if we did not find it
        const translatedValue = deepFind(translationLanguage, key);
        if (!translatedValue) {
            console.error(`Could not find localization for '${key}' (selected navigator language was ${navigator.language})`);
            return key;
        }

        // return the translated value
        return translatedValue;
    };

    const value = { resources: props.resources, translate: getTranslatedString };

    return <LocalizationContext.Provider value={value}>{props.children}</LocalizationContext.Provider>;
};
