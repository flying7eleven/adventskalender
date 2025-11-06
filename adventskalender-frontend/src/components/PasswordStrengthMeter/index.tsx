import { LinearProgress, Typography, Box } from '@mui/material';
import zxcvbn from 'zxcvbn';
import { useContext } from 'react';
import { LocalizationContext } from '../../provider/LocalizationContext';

interface Props {
    password: string;
}

export const PasswordStrengthMeter = ({ password }: Props) => {
    const localizationContext = useContext(LocalizationContext);

    if (!password) {
        return null;
    }

    const result = zxcvbn(password);
    const score = result.score; // 0-4

    const getColor = () => {
        switch (score) {
            case 0:
            case 1:
                return 'error';
            case 2:
                return 'warning';
            case 3:
                return 'info';
            case 4:
                return 'success';
            default:
                return 'error';
        }
    };

    const getLabel = () => {
        switch (score) {
            case 0:
                return localizationContext.translate('settings.cards.password.strength.very_weak');
            case 1:
                return localizationContext.translate('settings.cards.password.strength.weak');
            case 2:
                return localizationContext.translate('settings.cards.password.strength.fair');
            case 3:
                return localizationContext.translate('settings.cards.password.strength.good');
            case 4:
                return localizationContext.translate('settings.cards.password.strength.strong');
            default:
                return localizationContext.translate('settings.cards.password.strength.very_weak');
        }
    };

    const progress = ((score + 1) / 5) * 100;

    return (
        <Box sx={{ width: '100%', mt: 1 }}>
            <Typography variant="caption" color={getColor()}>
                {localizationContext.translate('settings.cards.password.strength.label')} {getLabel()}
            </Typography>
            <LinearProgress variant="determinate" value={progress} color={getColor()} sx={{ height: 6, borderRadius: 3 }} />
            {result.feedback.warning && (
                <Typography variant="caption" color="error" display="block">
                    {result.feedback.warning}
                </Typography>
            )}
            {result.feedback.suggestions.length > 0 && (
                <Typography variant="caption" color="text.secondary" display="block">
                    {result.feedback.suggestions[0]}
                </Typography>
            )}
        </Box>
    );
};
