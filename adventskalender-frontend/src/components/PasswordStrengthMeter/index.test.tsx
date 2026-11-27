import { render, screen } from '@testing-library/react';
import { PasswordStrengthMeter } from './index';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';

const renderMeter = (score: number | null) =>
    render(
        <LocalizationProvider resources={{ english: English, german: English }}>
            <PasswordStrengthMeter score={score} />
        </LocalizationProvider>
    );

describe('PasswordStrengthMeter', () => {
    test.each([
        { score: 0, label: 'Very Weak' },
        { score: 1, label: 'Weak' },
        { score: 2, label: 'Fair' },
        { score: 3, label: 'Good' },
        { score: 4, label: 'Strong' },
    ])('rates score $score as $label', ({ score, label }) => {
        renderMeter(score);

        expect(screen.getByText(`Strength: ${label}`)).toBeInTheDocument();
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    test('shows nothing before a password was rated', () => {
        renderMeter(null);

        expect(screen.queryByText(/Strength:/)).not.toBeInTheDocument();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
});
