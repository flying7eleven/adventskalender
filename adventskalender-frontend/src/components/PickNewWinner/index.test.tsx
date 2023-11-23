import { create } from 'react-test-renderer';
import { PickNewWinner } from './index';

describe('PickNewWinner component', () => {
    test('Matches the snapshot', () => {
        const testMethod = () => {
            /* nothing to do here */
        };
        const component = create(<PickNewWinner isLoadingNewWinner={false} isEnabled={true} label={'Some text'} onRequestWinner={testMethod} />);
        expect(component.toJSON()).toMatchSnapshot();
    });
});
