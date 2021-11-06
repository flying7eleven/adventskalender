import React, { createContext, ReactNode } from 'react';

interface ResourceDefinitions {
    english: any;
    german: any;
}

interface Props {
    children: ReactNode[];
    resources: ResourceDefinitions;
}

interface LocalizationContextType {
    resources: ResourceDefinitions;
}

export const LocalizationContext = createContext<LocalizationContextType>(null!);

export const LocalizationProvider = (props: Props) => {
    const value = { resources: props.resources };
    return <LocalizationContext.Provider value={value}>{props.children}</LocalizationContext.Provider>;
};
