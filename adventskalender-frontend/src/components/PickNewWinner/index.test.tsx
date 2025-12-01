import { render } from '@testing-library/react';
import { PickNewWinner } from './index';

describe('PickNewWinner component', () => {
    test('Matches the snapshot', () => {
        const testMethod = () => {
            /* nothing to do here */
        };
        const { container } = render(<PickNewWinner isLoadingNewWinner={false} isEnabled={true} label={'Some text'} onRequestWinner={testMethod} />);
        expect(container.firstChild).toMatchSnapshot();
    });
});
