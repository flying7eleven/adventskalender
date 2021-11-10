import React from 'react';
import { create } from 'react-test-renderer';
import { PickNewWinner } from './index';

describe('PickNewWinner component', () => {
    test('Matches the snapshot', () => {
        const component = create(<PickNewWinner isLoadingNewWinner={false} onRequestWinner={() => {}} />);
        expect(component.toJSON()).toMatchSnapshot();
    });
});