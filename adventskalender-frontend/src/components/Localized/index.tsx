import { LocalizationContext } from '../LocalizationProvider';
import { useContext } from 'react';

interface Props {
    translationKey: string;
}

export const Localized = (props: Props) => {
    const localizationContext = useContext(LocalizationContext);
    return <>{localizationContext.translate(props.translationKey)}</>;
};
