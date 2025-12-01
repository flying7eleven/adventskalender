import { render } from '@testing-library/react';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import { LocalizedText } from './index';

describe('LocalizedText component', () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    let languageGetter;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    let originalError;

    beforeEach(() => {
        languageGetter = jest.spyOn(window.navigator, 'language', 'get');
        originalError = console.error;
        console.error = jest.fn();
    });

    afterEach(() => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        console.error = originalError;
    });

    test('Matches the snapshot if known translation key and language is supplied', () => {
        const english = {
            existing: {
                key: 'Some translated Text',
            },
        };
        const german = {};
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        languageGetter.mockReturnValue('en');
        const { container } = render(
            <LocalizationProvider resources={{ english, german }}>
                <div>
                    <LocalizedText translationKey={'existing.key'} />
                </div>
            </LocalizationProvider>
        );
        expect(container.firstChild).toMatchSnapshot();
    });

    test('Matches the snapshot if known translation, language and variables are passed but no variables are in the language key', () => {
        const english = {
            existing: {
                key: 'Some translated Text',
            },
        };
        const german = {};
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        languageGetter.mockReturnValue('en');
        const { container } = render(
            <LocalizationProvider resources={{ english, german }}>
                <div>
                    <LocalizedText translationKey={'existing.key'} variables={['foo']} />
                </div>
            </LocalizationProvider>
        );
        expect(container.firstChild).toMatchSnapshot();
    });

    test('Matches the snapshot if known translation, language and variables are passed and there are enough variables are in the language key', () => {
        const english = {
            existing: {
                key: 'Some translated Text with a variable {0}',
            },
        };
        const german = {};
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        languageGetter.mockReturnValue('en');
        const { container } = render(
            <LocalizationProvider resources={{ english, german }}>
                <div>
                    <LocalizedText translationKey={'existing.key'} variables={['foo']} />
                </div>
            </LocalizationProvider>
        );
        expect(container.firstChild).toMatchSnapshot();
    });

    test('Matches the snapshot if known translation, language and variables are passed and there not enough variables are in the language key', () => {
        const english = {
            existing: {
                key: 'Some translated Text with a variable {0}',
            },
        };
        const german = {};
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        languageGetter.mockReturnValue('en');
        const { container } = render(
            <LocalizationProvider resources={{ english, german }}>
                <div>
                    <LocalizedText translationKey={'existing.key'} variables={['foo', 'bar', 'baz']} />
                </div>
            </LocalizationProvider>
        );
        expect(container.firstChild).toMatchSnapshot();
    });

    test('Matches the snapshot if known translation, language and variables are passed and there not enough variables passed for the amount in the language key', () => {
        const english = {
            existing: {
                key: 'Some translated Text with a variable {0} and variable {1}',
            },
        };
        const german = {};
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        languageGetter.mockReturnValue('en');
        const { container } = render(
            <LocalizationProvider resources={{ english, german }}>
                <div>
                    <LocalizedText translationKey={'existing.key'} variables={['foo']} />
                </div>
            </LocalizationProvider>
        );
        expect(container.firstChild).toMatchSnapshot();
    });

    test('Matches the snapshot if unknown translation key and valid language is supplied', () => {
        const english = {
            existing: {
                key: 'Some translated Text',
            },
        };
        const german = {};
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        languageGetter.mockReturnValue('en');
        const { container } = render(
            <LocalizationProvider resources={{ english, german }}>
                <div>
                    <LocalizedText translationKey={'nonexisting.key'} />
                </div>
            </LocalizationProvider>
        );
        expect(container.firstChild).toMatchSnapshot();
    });
});
