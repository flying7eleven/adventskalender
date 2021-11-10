import React from 'react';
import { create } from 'react-test-renderer';
import { WinningDaySelector } from './index';

describe('WinningDaySelector component', () => {
    test('Matches the snapshot', () => {
        const select_drop_down = create(<WinningDaySelector label={'Some label Text'} />);
        expect(select_drop_down.toJSON()).toMatchSnapshot();
    });
});
