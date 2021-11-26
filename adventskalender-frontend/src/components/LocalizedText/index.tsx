import { LocalizationContext } from '../../provider/LocalizationProvider';
import { useContext } from 'react';

interface Props {
    translationKey: string;
    placeholder?: string;
}

export const LocalizedText = (props: Props) => {
    const localizationContext = useContext(LocalizationContext);
    if (props.placeholder) {
        return <span dangerouslySetInnerHTML={{ __html: localizationContext.translateWithPlaceholder(props.translationKey, props.placeholder) }} />;
    }
    return <>{localizationContext.translate(props.translationKey)}</>;
};
