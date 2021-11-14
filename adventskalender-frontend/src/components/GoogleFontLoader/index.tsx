import { useEffect, useState } from 'react';

interface Font {
    font: string;
    weights: (string | number)[];
}

type DisplayType = 'auto' | 'block' | 'swap' | 'fallback' | 'optional';

interface Props {
    fonts: Font[];
    subsets?: string[];
    display?: DisplayType;
}

const createLink = (fonts: Font[], subsets?: string[], display?: DisplayType) => {
    const families = fonts
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .reduce((acc: any[], font) => {
            const family = font.font.replace(/ +/g, '+');
            const weights = (font.weights || []).join(',');

            return [...acc, family + (weights && `:${weights}`)];
        }, [])
        .join('|');

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css?family=${families}`;

    if (subsets && Array.isArray(subsets) && subsets.length > 0) {
        link.href += `&subset=${subsets.join(',')}`;
    }

    if (display) {
        link.href += `&display=${display}`;
    }

    return link;
};

export const GoogleFontLoader = ({ fonts, subsets, display = undefined }: Props) => {
    const [link, setLink] = useState(createLink(fonts, subsets, display));

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    useEffect(() => {
        document.head.appendChild(link);
        return () => document.head.removeChild(link);
    }, [link]);

    useEffect(() => {
        setLink(createLink(fonts, subsets, display));
    }, [fonts, subsets, display]);

    return null;
};
