import * as React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
    return (
        <input
            type={type}
            className={cn(
                'flex h-10 w-full rounded-md px-3 py-2',
                'backdrop-blur-sm bg-white/10 dark:bg-slate-900/20',
                'border border-white/30 dark:border-white/20',
                'text-sm text-foreground',
                'placeholder:text-muted-foreground/60',
                'focus-visible:outline-none',
                'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                'focus-visible:border-primary',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'transition-colors duration-200',
                'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
                className
            )}
            ref={ref}
            {...props}
        />
    );
});
Input.displayName = 'Input';

export { Input };
