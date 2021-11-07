import { LocalizationContext } from '../LocalizationProvider';
import { useContext } from 'react';

interface Props {
    translationKey: string;
}

export const Localized = (props: Props) => {
    // eslint-disable-next-line
    const localizationContext = useContext(LocalizationContext);

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
                return localizationContext.resources.german;
            case 'en':
            default:
                return localizationContext.resources.english;
        }
    };

    const getTranslationForKeyParts = (key: string) => {
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

    return <>{getTranslationForKeyParts(props.translationKey)}</>;
};
