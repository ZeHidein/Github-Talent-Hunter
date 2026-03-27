import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';

import { cn } from '@/app/lib/utils';

const SwitchIcons = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & {
    checkedIcon: React.ReactElement; // added the types along with other types
    uncheckedIcon: React.ReactElement;
  }
>(
  (
    { className, checkedIcon, uncheckedIcon, ...props },
    ref, // here we have added checkedIcon and uncheckedIcon as props
  ) => (
    <SwitchPrimitives.Root
      className={cn(
        'peer inline-flex h-6 w-[70px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
        'border-primary data-[state=checked]:bg-primary data-[state=unchecked]:bg-primary',
        'relative flex items-center justify-center overflow-hidden rounded-xl',
        "before:content-[''] before:display-block before:w-[100px] before:h-[100px]",
        'before:absolute before:transform-none before:rotate-0 before:bg-accent-gradient before:z-0 before:transition-all',
        className,
      )}
      {...props}
      ref={ref}
    >
      <div className="min-h-[30px] content bg-background flex flex-row items-center justify-around h-full z-0 m-[2px] rounded-full w-full">
        {checkedIcon && (
          <i className="flex flex-1 justify-center items-center px-[2px] z-0 data-[state=checked]:translate-x-0 data-[state=unchecked]:translate-x-5">
            {checkedIcon}
          </i>
        )}
        {uncheckedIcon && (
          <i className="flex flex-1 justify-center items-center px-[2px] z-0 data-[state=checked]:translate-x-0 data-[state=unchecked]:translate-x-5">
            {uncheckedIcon}
          </i>
        )}
        <SwitchPrimitives.Thumb
          className={cn(
            'absolute m-0 z-10 pointer-events-none block w-[24px] h-[24px] rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-[16px] data-[state=unchecked]:translate-x-[-16px]',
          )}
        />
      </div>
    </SwitchPrimitives.Root>
  ),
);

export { SwitchIcons };
