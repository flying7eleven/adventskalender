import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ComponentType, Dispatch, SetStateAction } from 'react';
import { NoParticipantsErrorDialog } from './NoParticipantsErrorDialog';
import { UnknownErrorDialog } from './UnknownErrorDialog';
import { PasswordChangedDialog } from './PasswordChangedDialog';
import { PasswordNotChangedDialog } from './PasswordNotChangedDialog';
import { LocalizationProvider } from '../provider/LocalizationProvider';
import English from '../languages/en.json';

type InfoDialog = ComponentType<{ isOpen: boolean; setDialogOpenStateFunction: Dispatch<SetStateAction<boolean>> }>;

const dialogs: { name: string; Dialog: InfoDialog; texts: { title: string; text: string; accept_button: string } }[] = [
    { name: 'NoParticipantsErrorDialog', Dialog: NoParticipantsErrorDialog, texts: English.dashboard.dialogs.no_participants_left },
    { name: 'UnknownErrorDialog', Dialog: UnknownErrorDialog, texts: English.dashboard.dialogs.unknown_error },
    { name: 'PasswordChangedDialog', Dialog: PasswordChangedDialog, texts: English.settings.dialogs.password_change_successful },
    { name: 'PasswordNotChangedDialog', Dialog: PasswordNotChangedDialog, texts: English.settings.dialogs.password_change_failed },
];

const renderDialog = (Dialog: InfoDialog, isOpen = true) => {
    const setDialogOpenStateFunction = vi.fn();
    render(
        <LocalizationProvider resources={{ english: English, german: English }}>
            <Dialog isOpen={isOpen} setDialogOpenStateFunction={setDialogOpenStateFunction} />
        </LocalizationProvider>
    );
    return setDialogOpenStateFunction;
};

describe.each(dialogs)('$name', ({ Dialog, texts }) => {
    test('explains what happened', () => {
        renderDialog(Dialog);

        const dialog = screen.getByRole('dialog', { name: texts.title });
        expect(dialog).toHaveAccessibleDescription(texts.text);
    });

    test('closes with its button', async () => {
        const setDialogOpenStateFunction = renderDialog(Dialog);

        await userEvent.setup().click(screen.getByRole('button', { name: texts.accept_button }));

        expect(setDialogOpenStateFunction).toHaveBeenCalledWith(false);
    });

    test('closes with the escape key', async () => {
        const setDialogOpenStateFunction = renderDialog(Dialog);

        await userEvent.setup().keyboard('{Escape}');

        expect(setDialogOpenStateFunction).toHaveBeenCalledWith(false);
    });

    test('stays hidden while closed', () => {
        renderDialog(Dialog, false);

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
