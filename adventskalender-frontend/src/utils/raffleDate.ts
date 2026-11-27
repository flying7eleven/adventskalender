import { format } from 'date-fns';

const DECEMBER = 11;
export const FIRST_RAFFLE_DAY = 1;
export const LAST_RAFFLE_DAY = 24;

export const getRaffleYear = () => new Date().getFullYear();

export const getDefaultRaffleDay = () => {
    const today = new Date();
    if (today.getMonth() !== DECEMBER) {
        return FIRST_RAFFLE_DAY;
    }
    return Math.min(today.getDate(), LAST_RAFFLE_DAY);
};

export const getRaffleDate = (day: number) => new Date(getRaffleYear(), DECEMBER, day);

export const formatRaffleDay = (day: number) => format(getRaffleDate(day), 'yyyy-MM-dd');
