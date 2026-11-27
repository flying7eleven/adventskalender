import { render, screen } from '@testing-library/react';
import { useContext } from 'react';
import { vi } from 'vitest';
import { de, enUS } from 'date-fns/locale';
import { LocalizationProvider } from './index';
import { LocalizationContext } from '../LocalizationContext';

const resources = {
    english: { greeting: 'Hello {0}, you have {1} new messages. Bye {0}!' },
    german: { greeting: 'Hallo {0}, du hast {1} neue Nachrichten. Tschüss {0}!' },
};

const ContextProbe = () => {
    const localizationContext = useContext(LocalizationContext);
    return (
        <>
            <p data-testid="translated">{localizationContext.translate('greeting', ['Ada', 3])}</p>
            <p data-testid="unreplaced">{localizationContext.translate('greeting', ['Ada'])}</p>
            <p data-testid="language">{localizationContext.language}</p>
            <p data-testid="date-locale">{localizationContext.dateLocale.code}</p>
        </>
    );
};

const renderWithNavigatorLanguage = (navigatorLanguage: string) => {
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue(navigatorLanguage);
    return render(
        <LocalizationProvider resources={resources}>
            <ContextProbe />
        </LocalizationProvider>
    );
};

describe('LocalizationProvider', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        document.documentElement.lang = 'en';
    });

    test('replaces every numbered placeholder with its variable', () => {
        renderWithNavigatorLanguage('en-US');

        expect(screen.getByTestId('translated')).toHaveTextContent('Hello Ada, you have 3 new messages. Bye Ada!');
    });

    test('keeps placeholders without a matching variable', () => {
        renderWithNavigatorLanguage('en-US');

        expect(screen.getByTestId('unreplaced')).toHaveTextContent('Hello Ada, you have {1} new messages. Bye Ada!');
    });

    test('exposes the German language and date locale for a German browser', () => {
        renderWithNavigatorLanguage('de-DE');

        expect(screen.getByTestId('translated')).toHaveTextContent('Hallo Ada, du hast 3 neue Nachrichten. Tschüss Ada!');
        expect(screen.getByTestId('language')).toHaveTextContent('de');
        expect(screen.getByTestId('date-locale')).toHaveTextContent(de.code);
        expect(document.documentElement.lang).toBe('de');
    });

    test('falls back to English for any other browser language', () => {
        document.documentElement.lang = 'de';
        renderWithNavigatorLanguage('fr-FR');

        expect(screen.getByTestId('language')).toHaveTextContent('en');
        expect(screen.getByTestId('date-locale')).toHaveTextContent(enUS.code);
        expect(document.documentElement.lang).toBe('en');
    });
});
