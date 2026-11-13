import { Pressable, Text, View } from 'react-native';
import type { ResolvedEvent } from '../domain/dates';
import { CampusButton } from './CampusButton';
import { campusStyles as s } from './campusStyles';

type CalendarEntry = Pick<ResolvedEvent, 'date' | 'time' | 'label'> & {
  title: string;
};
type NoticeCalendarProps = {
  month: Date;
  today: string;
  picked: string | null;
  schedule: readonly CalendarEntry[];
  onChangeMonth: (month: Date) => void;
  onPickDate: (date: string | null) => void;
};

export function NoticeCalendar({
  month,
  today,
  picked,
  schedule,
  onChangeMonth,
  onPickDate,
}: NoticeCalendarProps) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = month.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const weeks = Math.ceil((firstWeekday + daysInMonth) / 7);
  const prefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}-`;
  const monthEvents = schedule.filter((event) => event.date.startsWith(prefix));
  const eventDates = new Set(monthEvents.map((event) => event.date));
  const events = picked
    ? monthEvents.filter((event) => event.date === picked)
    : monthEvents;

  function changeMonth(offset: number) {
    onChangeMonth(new Date(year, monthIndex + offset, 1));
    onPickDate(null);
  }
  return (
    <View style={s.card}>
      <View style={s.between}>
        <CampusButton
          label="<"
          accessibilityLabel="이전 달"
          onPress={() => changeMonth(-1)}
        />
        <Text style={s.cardTitle}>
          {year}년 {monthIndex + 1}월
        </Text>
        <CampusButton
          label=">"
          accessibilityLabel="다음 달"
          onPress={() => changeMonth(1)}
        />
      </View>
      <View>
        <View style={s.calendarRow}>
          {['일', '월', '화', '수', '목', '금', '토'].map((d, weekday) => (
            <View key={d} style={s.cell}>
              <Text
                style={[
                  s.muted,
                  weekday === 0 && s.sunday,
                  weekday === 6 && s.saturday,
                ]}
              >
                {d}
              </Text>
            </View>
          ))}
        </View>
        {Array.from(
          {
            length: weeks,
          },
          (_, week) => (
            <View key={week} style={s.calendarRow}>
              {Array.from({ length: 7 }, (_, weekday) => {
                const day = week * 7 + weekday - firstWeekday + 1;
                if (day < 1 || day > daysInMonth)
                  return <View key={weekday} style={s.cell} />;
                const date = prefix + String(day).padStart(2, '0');

                const hasEvent = eventDates.has(date);
                return (
                  <Pressable
                    key={date}
                    accessibilityRole="button"
                    accessibilityLabel={`${date}, 일정 ${hasEvent ? 1 : 0}개`}
                    accessibilityState={{
                      selected: picked === date,
                    }}
                    onPress={() => onPickDate(picked === date ? null : date)}
                    style={[
                      s.cell,
                      picked === date && s.primary,
                      date === today && s.today,
                    ]}
                  >
                    <Text
                      style={[
                        picked === date ? s.light : s.buttonText,
                        weekday === 0 && s.sunday,
                        weekday === 6 && s.saturday,
                      ]}
                    >
                      {day}
                    </Text>
                    <Text style={[s.dot, picked === date && s.light]}>
                      {hasEvent ? '•' : ' '}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ),
        )}
      </View>
      <Text style={s.reason}>
        {events.length
          ? events
              .map(
                (event) =>
                  `${event.date}${event.time ? ` ${event.time}` : ''} · ${event.label} · ${event.title}`,
              )
              .join('\n')
          : '선택한 일정이 없어요.'}
      </Text>
    </View>
  );
}
