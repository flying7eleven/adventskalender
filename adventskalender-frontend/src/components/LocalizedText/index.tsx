import { useContext } from 'react';
import { LocalizationContext } from '../../provider/LocalizationContext';

interface Props {
    translationKey: string;
    placeholder?: string;
    variables?: string[];
}

export const LocalizedText = (props: Props) => {
    const localizationContext = useContext(LocalizationContext);

    const replaceWithVariables = (textWithVariables: string) => {
        if (undefined === props.variables) {
            return textWithVariables;
        }
        let replacedText = textWithVariables;
        for (let i = 0; i < props.variables.length; i++) {
            replacedText = replacedText.replace(`{${i}}`, props.variables[i]);
        }
        return replacedText;
    };

    const getTranslatedText = () => {
        if (props.placeholder) {
            return replaceWithVariables(localizationContext.translateWithPlaceholder(props.translationKey, props.placeholder));
        }
        return replaceWithVariables(localizationContext.translate(props.translationKey));
    };

    if (props.placeholder) {
        return <span dangerouslySetInnerHTML={{ __html: getTranslatedText() }} />;
    }
    return <>{getTranslatedText()}</>;
};
