import { create } from 'react-test-renderer';
import { OutlinedCard } from './index';

describe('OutlinedCard component', () => {
    test('Matches the snapshot', () => {
        const card = create(<OutlinedCard headline={'Headline'} value={'Value'} description={'Description'} />);
        expect(card.toJSON()).toMatchSnapshot();
    });
});
