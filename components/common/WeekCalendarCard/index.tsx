import { DayStatusLegend } from "@/components/common/DayStatusLegend";
import {
  type WeekDayTabItem,
  WeekDayTabs,
} from "@/components/common/WeekDayTabs";
import { WeekNavigator } from "@/components/common/WeekNavigator";
import { CARD } from "@/constants/styles";

interface WeekCalendarCardProps {
  basePath: string;
  weekStart: string;
  items: WeekDayTabItem[];
  selectedDate: string;
  today: string;
}

// The week calendar: header with week navigation, the seven day cells and the
// colour legend in one card. Shared by the workout and nutrition tabs.
export const WeekCalendarCard = ({
  basePath,
  weekStart,
  items,
  selectedDate,
  today,
}: WeekCalendarCardProps) => (
  <section aria-label="Lịch tuần" className={`${CARD} space-y-4 p-4`}>
    <WeekNavigator
      basePath={basePath}
      weekStart={weekStart}
      selectedDate={selectedDate}
      today={today}
    />
    <WeekDayTabs
      basePath={basePath}
      weekStart={weekStart}
      items={items}
      selectedDate={selectedDate}
      today={today}
    />
    <div className="border-t border-line pt-3">
      <DayStatusLegend />
    </div>
  </section>
);
