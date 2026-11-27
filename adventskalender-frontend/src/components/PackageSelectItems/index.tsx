import { SelectItem } from '@/components/ui/select';

export const PackageSelectItems = ({ userId, maxPackageCount }: { userId: number; maxPackageCount: number }) => {
    const alphabet = Array.from(Array(maxPackageCount))
        .map((_, i) => i + 65)
        .map((x) => String.fromCharCode(x));

    return (
        <>
            <SelectItem key={`menu-item-not-selected-for-user-${userId}`} value="__none__">
                -
            </SelectItem>
            {alphabet.map((character) => (
                <SelectItem key={`menu-item-${character}-for-user-${userId}`} value={character}>
                    {character}
                </SelectItem>
            ))}
        </>
    );
};
