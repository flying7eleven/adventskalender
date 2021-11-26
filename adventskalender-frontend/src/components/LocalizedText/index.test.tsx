import { create } from 'react-test-renderer';
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
        const translatedText = create(
            <LocalizationProvider resources={{ english, german }}>
                <div>
                    <LocalizedText translationKey={'existing.key'} />
                </div>
            </LocalizationProvider>
        );
        expect(translatedText.toJSON()).toMatchSnapshot();
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
        const translatedText = create(
            <LocalizationProvider resources={{ english, german }}>
                <div>
                    <LocalizedText translationKey={'nonexisting.key'} />
                </div>
            </LocalizationProvider>
        );
        expect(translatedText.toJSON()).toMatchSnapshot();
    });
});
