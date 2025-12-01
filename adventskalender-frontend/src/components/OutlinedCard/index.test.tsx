import { render } from '@testing-library/react';
import { OutlinedCard } from './index';

describe('OutlinedCard component', () => {
    test('Matches the snapshot', () => {
        const { container } = render(<OutlinedCard headline={'Headline'} value={'Value'} description={'Description'} />);
        expect(container.firstChild).toMatchSnapshot();
    });
});
