import { useContext } from 'react';
import { LocalizationContext, TranslationVariable } from '../../provider/LocalizationContext';

interface Props {
    translationKey: string;
    variables?: TranslationVariable[];
}

export const LocalizedText = (props: Props) => {
    const localizationContext = useContext(LocalizationContext);
    return <>{localizationContext.translate(props.translationKey, props.variables)}</>;
};
