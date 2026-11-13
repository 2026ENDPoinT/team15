import { Pressable, Text, TextInput, View } from 'react-native';
import {
  colleges,
  type CampusProfile,
  type College,
} from '../domain/campusProfile';
import { CampusButton } from './CampusButton';
import { campusStyles as s } from './campusStyles';

type ProfileFieldsProps = Pick<
  CampusProfile,
  'college' | 'department' | 'grade' | 'enrollment'
> & {
  onCollegeChange: (value: College | null) => void;
  onDepartmentChange: (value: string) => void;
  onGradeChange: (value: CampusProfile['grade']) => void;
  onEnrollmentChange: (value: CampusProfile['enrollment']) => void;
};

export function ProfileFields({
  college,
  department,
  grade,
  enrollment,
  onCollegeChange,
  onDepartmentChange,
  onGradeChange,
  onEnrollmentChange,
}: ProfileFieldsProps) {
  return (
    <View style={s.card}>
      <Text style={s.section}>내 정보</Text>
      <Text style={s.muted}>소속 단과대학</Text>
      <View style={s.row}>
        {[null, ...colleges].map((value) => (
          <Pressable
            key={value ?? 'none'}
            accessibilityRole="radio"
            accessibilityState={{
              checked: college === value,
            }}
            aria-checked={college === value}
            onPress={() => onCollegeChange(value)}
            style={[s.button, college === value && s.primary]}
          >
            <Text style={college === value ? s.light : s.buttonText}>
              {value ?? '선택 안 함'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.muted}>학과</Text>
      <TextInput
        accessibilityLabel="학과"
        value={department}
        onChangeText={onDepartmentChange}
        style={s.input}
      />
      <Text style={s.muted}>학년</Text>
      <View style={s.row}>
        {([1, 2, 3, 4, 5] as const).map((g) => (
          <CampusButton
            key={g}
            label={`${g}학년`}
            primary={grade === g}
            onPress={() => onGradeChange(g)}
          />
        ))}
      </View>
      <Text style={s.muted}>학적 상태</Text>
      <View style={s.row}>
        {(
          [
            ['enrolled', '재학'],
            ['leave', '휴학'],
            ['other', '졸업'],
          ] as const
        ).map(([g, label]) => (
          <CampusButton
            key={g}
            label={label}
            primary={enrollment === g}
            onPress={() => onEnrollmentChange(g)}
          />
        ))}
      </View>
    </View>
  );
}
