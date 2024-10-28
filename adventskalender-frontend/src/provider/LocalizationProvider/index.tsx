import { ReactNode } from 'react';
import { LocalizationContext, ResourceDefinitions } from '../LocalizationContext';

interface Props {
    children: ReactNode | ReactNode[];
    resources: ResourceDefinitions;
}

export const LocalizationProvider = (props: Props) => {
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

    const getTranslatedStringWithPlaceholder = (key: string, placeholder: string) => {
        return getTranslatedString(key).replace('%PLACEHOLDER%', placeholder);
    };

    const value = { resources: props.resources, translate: getTranslatedString, translateWithPlaceholder: getTranslatedStringWithPlaceholder };

    return <LocalizationContext.Provider value={value}>{props.children}</LocalizationContext.Provider>;
};
