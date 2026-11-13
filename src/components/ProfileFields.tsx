import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { departmentsByCollege } from '../domain/campusDepartments';
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
  const [manualCollege, setManualCollege] = useState<College | null>();
  const departments = college ? departmentsByCollege[college] : [];
  const manual =
    !college ||
    manualCollege === college ||
    (!!department && !departments.includes(department));
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
            onPress={() => {
              if (value === college) return;
              setManualCollege(undefined);
              onCollegeChange(value);
              onDepartmentChange('');
            }}
            style={[s.button, college === value && s.primary]}
          >
            <Text style={college === value ? s.light : s.buttonText}>
              {value ?? '선택 안 함'}
            </Text>
          </Pressable>
        ))}
      </View>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="학과·학부·전공"
        testID="department-options"
        style={{ gap: 10 }}
      >
        <Text style={s.muted}>학과·학부·전공</Text>
        {college ? (
          <>
            <Text style={s.description}>{college}의 학과를 선택해 주세요.</Text>
            <View style={s.row}>
              {['', ...departments].map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityLabel={value || '학과 선택 안 함'}
                  accessibilityState={{ checked: department === value }}
                  aria-checked={department === value}
                  style={[s.button, department === value && s.primary]}
                  onPress={() => {
                    setManualCollege(undefined);
                    onDepartmentChange(value);
                  }}
                >
                  <Text style={department === value ? s.light : s.buttonText}>
                    {value || '학과 선택 안 함'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <CampusButton
              label="목록에 없는 학과 직접 입력"
              onPress={() => setManualCollege(college)}
            />
          </>
        ) : (
          <Text style={s.muted}>
            단과대학을 선택하면 해당 학과 목록이 나와요.
          </Text>
        )}
        {manual && (
          <>
            {!!college && (
              <Text style={s.muted}>
                목록에 없는 기존 학과명도 그대로 저장할 수 있어요.
              </Text>
            )}
            <TextInput
              accessibilityLabel="학과"
              placeholder="학과 직접 입력"
              value={department}
              onChangeText={onDepartmentChange}
              style={s.input}
            />
          </>
        )}
      </View>
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
