import { LocalizationContext } from '../LocalizationProvider';
import { useContext } from 'react';

interface Props {
    translationKey: string;
    placeholder?: string;
}

export const Localized = (props: Props) => {
    const localizationContext = useContext(LocalizationContext);
    if (props.placeholder) {
        return <>{localizationContext.translateWithPlaceholder(props.translationKey, props.placeholder)}</>;
    }
    return <>{localizationContext.translate(props.translationKey)}</>;
};
