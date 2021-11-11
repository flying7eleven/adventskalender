import { create } from 'react-test-renderer';
import { TopControlBar } from './index';

describe('TopControlBar component', () => {
    test('Matches the snapshot', () => {
        const button = create(<TopControlBar title={'Title'} actionTitle={'Action Title'} />);
        expect(button.toJSON()).toMatchSnapshot();
    });
});
