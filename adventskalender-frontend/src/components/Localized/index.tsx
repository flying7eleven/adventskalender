interface Props {
    translation: string;
}

export const Localized = (props: Props) => {
    return <>{props.translation}</>;
};
