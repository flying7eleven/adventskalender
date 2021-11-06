import { LocalizationContext } from '../LocalizationProvider';
import { useContext } from 'react';

interface Props {
    translation: string;
}

export const Localized = (props: Props) => {
    // eslint-disable-next-line
    const localizationContext = useContext(LocalizationContext);
    return <>{props.translation}</>;
};
