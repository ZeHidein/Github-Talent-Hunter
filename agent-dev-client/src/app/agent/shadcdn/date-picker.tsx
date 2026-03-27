import * as React from 'react';
import { format } from 'date-fns';
import { LucideIcon } from '@/app/lib/components/LucideIcon';
import { cn } from '@/app/lib/utils';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

type Props = {
  onChange: (date: string) => void;
};

export const DatePicker: React.FC<Props> = ({ onChange }) => {
  const [date, setDate] = React.useState<Date>();

  const dateChanged = (d?: Date) => {
    setDate(d);
    onChange(d ? d.toDateString() : '');
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={'outline'}
          className={cn(
            'w-full shadow-none min-h-[48px] rounded-xl justify-start text-left font-normal',
            !date && 'text-muted-foreground',
          )}
        >
          <LucideIcon name="calendar" size={16} className="mr-2" />
          {date ? format(date, 'PPP') : <span>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar mode="single" selected={date} onSelect={dateChanged} initialFocus />
      </PopoverContent>
    </Popover>
  );
};
