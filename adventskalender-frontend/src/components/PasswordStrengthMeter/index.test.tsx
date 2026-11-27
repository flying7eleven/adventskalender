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
        { score: 0, label: 'Very Weak', progress: '20' },
        { score: 1, label: 'Weak', progress: '40' },
        { score: 2, label: 'Fair', progress: '60' },
        { score: 3, label: 'Good', progress: '80' },
        { score: 4, label: 'Strong', progress: '100' },
    ])('rates score $score as $label', ({ score, label, progress }) => {
        renderMeter(score);

        expect(screen.getByText(`Strength: ${label}`)).toBeInTheDocument();
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', progress);
    });

    test('shows nothing before a password was rated', () => {
        renderMeter(null);

        expect(screen.queryByText(/Strength:/)).not.toBeInTheDocument();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
});
