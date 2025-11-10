import { Progress } from '@/components/ui/progress';
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

    const getColorClass = () => {
        switch (score) {
            case 0:
            case 1:
                return 'text-destructive';
            case 2:
                return 'text-orange-500';
            case 3:
                return 'text-blue-500';
            case 4:
                return 'text-green-500';
            default:
                return 'text-destructive';
        }
    };

    const getProgressIndicatorClass = () => {
        switch (score) {
            case 0:
            case 1:
                return 'bg-destructive';
            case 2:
                return 'bg-orange-500';
            case 3:
                return 'bg-blue-500';
            case 4:
                return 'bg-green-500';
            default:
                return 'bg-destructive';
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
        <div className="w-full mt-2">
            <p className={`text-xs ${getColorClass()}`}>
                {localizationContext.translate('settings.cards.password.strength.label')} {getLabel()}
            </p>
            <Progress value={progress} className="h-1.5" indicatorClassName={getProgressIndicatorClass()} />
            {result.feedback.warning && <p className="text-xs text-destructive block mt-1">{result.feedback.warning}</p>}
            {result.feedback.suggestions.length > 0 && <p className="text-xs text-muted-foreground block mt-1">{result.feedback.suggestions[0]}</p>}
        </div>
    );
};
