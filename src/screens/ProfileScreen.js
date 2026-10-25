import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsDesktop } from '../hooks/useResponsive';

// ─────────────────────────────────────────────────────────────────────────────
// OPTIONS
// ─────────────────────────────────────────────────────────────────────────────

const NIGERIAN_STATES = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT (Abuja)','Gombe',
  'Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos',
  'Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto',
  'Taraba','Yobe','Zamfara',
];

const EXAMS = ['JAMB/UTME','WAEC','NECO','NABTEB','GCE','POST-UTME','OTHERS'];
const CLASS_LEVELS = ['BASIC Classes','JSS Classes','SS (Senior) Classes'];
const SEX_OPTIONS = ['Male','Female'];
const PREV_EXAM_OPTIONS = ['Never written before','Written once','Written twice','Written 3+ times'];
const EXPECTATIONS = [
  'Pass my exam this year',
  'Improve my score significantly',
  'Understand my weak areas',
  'Practice consistently',
  'Get admission into university',
  'All of the above',
];

// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function FieldLabel({ text, required }) {
  return (
    <Text style={styles.fieldLabel}>
      {text}{required ? <Text style={{ color: '#ef4444' }}> *</Text> : null}
    </Text>
  );
}

function SelectChips({ options, selected, onSelect, multi = false }) {
  return (
    <View style={styles.chipsWrap}>
      {options.map(opt => {
        const isSelected = multi
          ? (selected || []).includes(opt)
          : selected === opt;
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.chip, isSelected && styles.chipSelected]}
            onPress={() => {
              if (multi) {
                const current = selected || [];
                if (current.includes(opt)) {
                  onSelect(current.filter(o => o !== opt));
                } else {
                  onSelect([...current, opt]);
                }
              } else {
                onSelect(opt);
              }
            }}
            activeOpacity={0.75}
          >
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
              {isSelected ? '✓ ' : ''}{opt}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export default function ProfileScreen({ onComplete }) {
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const scrollRef = useRef(null);

  const [fullName,        setFullName]        = useState('');
  const [dob,             setDob]             = useState('');
  const [stateLocated,    setStateLocated]    = useState('');
  const [sex,             setSex]             = useState('');
  const [phone,           setPhone]           = useState('');
  const [forthcomingExam, setForthcomingExam] = useState([]);
  const [classLevel,      setClassLevel]      = useState('');
  const [prevExam,        setPrevExam]        = useState('');
  const [expectation,     setExpectation]     = useState('');
  const [intendedCourse,  setIntendedCourse]  = useState('');
  const [saving,          setSaving]          = useState(false);
  const [showStates,      setShowStates]      = useState(false);

  const handleSave = async () => {
    // Validation
    if (!fullName.trim()) {
      Alert.alert('Required', 'Please enter your full name.');
      return;
    }
    if (!dob.trim()) {
      Alert.alert('Required', 'Please enter your date of birth.');
      return;
    }
    if (!stateLocated) {
      Alert.alert('Required', 'Please select your state.');
      return;
    }
    if (!sex) {
      Alert.alert('Required', 'Please select your sex.');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Required', 'Please enter your WhatsApp phone number.');
      return;
    }
    if (!forthcomingExam.length) {
      Alert.alert('Required', 'Please select at least one forthcoming exam.');
      return;
    }
    if (!prevExam) {
      Alert.alert('Required', 'Please indicate your previous exam experience.');
      return;
    }
    if (!expectation) {
      Alert.alert('Required', 'Please select your expectation from the app.');
      return;
    }
    if (!intendedCourse.trim()) {
      Alert.alert('Required', 'Please enter your intended course of study.');
      return;
    }

    setSaving(true);
    try {
      const profile = {
        fullName:       fullName.trim(),
        dob:            dob.trim(),
        stateLocated,
        sex,
        phone:          phone.trim(),
        forthcomingExam,
        classLevel,
        prevExam,
        expectation,
        intendedCourse: intendedCourse.trim(),
        completedAt:    new Date().toISOString(),
      };
      await AsyncStorage.setItem('studentProfile', JSON.stringify(profile));
      onComplete();
    } catch (err) {
      console.error('Profile save error:', err);
      Alert.alert('Error', 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>🎓</Text>
          <Text style={styles.headerTitle}>Student Profile Setup</Text>
          <Text style={styles.headerSub}>
            This information is used to personalize your experience and is included
            in your PG Map progress report for your admin.
          </Text>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={isDesktop}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Full Name ── */}
          <View style={styles.fieldBlock}>
            <FieldLabel text="Full Name" required />
            <TextInput
              style={styles.input}
              placeholder="e.g. Chukwuemeka Obi"
              placeholderTextColor="#475569"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
            />
          </View>

          {/* ── Date of Birth ── */}
          <View style={styles.fieldBlock}>
            <FieldLabel text="Date of Birth" required />
            <TextInput
              style={styles.input}
              placeholder="e.g. 15/03/2006"
              placeholderTextColor="#475569"
              value={dob}
              onChangeText={setDob}
              keyboardType="numbers-and-punctuation"
            />
            <Text style={styles.hint}>Format: DD/MM/YYYY</Text>
          </View>

          {/* ── Sex ── */}
          <View style={styles.fieldBlock}>
            <FieldLabel text="Sex" required />
            <SelectChips options={SEX_OPTIONS} selected={sex} onSelect={setSex} />
          </View>

          {/* ── Phone (WhatsApp) ── */}
          <View style={styles.fieldBlock}>
            <FieldLabel text="WhatsApp Phone Number" required />
            <TextInput
              style={styles.input}
              placeholder="e.g. 08012345678"
              placeholderTextColor="#475569"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              maxLength={15}
            />
          </View>

          {/* ── State ── */}
          <View style={styles.fieldBlock}>
            <FieldLabel text="State Located" required />
            <TouchableOpacity
              style={[styles.input, styles.selectBtn]}
              onPress={() => setShowStates(!showStates)}
            >
              <Text style={stateLocated ? styles.selectBtnText : styles.selectBtnPlaceholder}>
                {stateLocated || 'Tap to select your state...'}
              </Text>
              <Text style={styles.selectChevron}>{showStates ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showStates && (
              <View style={styles.stateDropdown}>
                <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                  {NIGERIAN_STATES.map(s => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.stateOption, stateLocated === s && styles.stateOptionSelected]}
                      onPress={() => { setStateLocated(s); setShowStates(false); }}
                    >
                      <Text style={[styles.stateOptionText, stateLocated === s && styles.stateOptionTextSelected]}>
                        {stateLocated === s ? '✓ ' : ''}{s}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* ── Forthcoming Exam ── */}
          <View style={styles.fieldBlock}>
            <FieldLabel text="Forthcoming Examination(s)" required />
            <Text style={styles.hint}>Select all that apply</Text>
            <SelectChips
              options={EXAMS}
              selected={forthcomingExam}
              onSelect={setForthcomingExam}
              multi
            />
          </View>

          {/* ── Class Level (school pupils, teacher-supervised) ── */}
          <View style={styles.fieldBlock}>
            <FieldLabel text="Class Level (if currently in school)" />
            <Text style={styles.hint}>Leave blank if you're a self-study candidate only</Text>
            <SelectChips options={CLASS_LEVELS} selected={classLevel} onSelect={setClassLevel} />
          </View>

          {/* ── Previously Written ── */}
          <View style={styles.fieldBlock}>
            <FieldLabel text="Previously Written Exam" required />
            <SelectChips options={PREV_EXAM_OPTIONS} selected={prevExam} onSelect={setPrevExam} />
          </View>

          {/* ── Expectation ── */}
          <View style={styles.fieldBlock}>
            <FieldLabel text="Expectation From This App" required />
            <SelectChips options={EXPECTATIONS} selected={expectation} onSelect={setExpectation} />
          </View>

          {/* ── Intended Course ── */}
          <View style={styles.fieldBlock}>
            <FieldLabel text="Intended Course of Study" required />
            <TextInput
              style={styles.input}
              placeholder="e.g. Medicine and Surgery, Computer Science"
              placeholderTextColor="#475569"
              value={intendedCourse}
              onChangeText={setIntendedCourse}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.privacyNote}>
            <Text style={styles.privacyNoteText}>
              🔒 Your information is stored only on this device and is included in your PG Map
              progress report when you share it with your PrepStation admin. It is never
              sent anywhere automatically.
            </Text>
          </View>

        </ScrollView>

        {/* Fixed submit button */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity
            style={[styles.submitBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={styles.submitBtnText}>
              {saving ? 'Saving...' : 'Complete Profile & Enter App 🚀'}
            </Text>
          </TouchableOpacity>
        </View>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#0f172a' },
  header:      { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, backgroundColor: '#111827', borderBottomWidth: 1, borderColor: '#1e293b' },
  headerEmoji: { fontSize: 32, marginBottom: 8 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#f8fafc', marginBottom: 6 },
  headerSub:   { fontSize: 12, color: '#64748b', lineHeight: 18 },
  scroll:      { padding: 20 },

  fieldBlock:  { marginBottom: 22 },
  fieldLabel:  { fontSize: 12, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' },
  hint:        { fontSize: 10, color: '#475569', fontWeight: '600', marginBottom: 6 },

  input: {
    backgroundColor: '#1e293b',
    borderWidth: 1.5,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '600',
  },

  selectBtn:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectBtnText:      { color: '#f1f5f9', fontSize: 14, fontWeight: '600', flex: 1 },
  selectBtnPlaceholder: { color: '#475569', fontSize: 14, fontWeight: '600', flex: 1 },
  selectChevron:      { color: '#64748b', fontSize: 12, fontWeight: '800', marginLeft: 8 },

  stateDropdown: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    marginTop: 4,
    overflow: 'hidden',
  },
  stateOption:         { paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: '#0f172a' },
  stateOptionSelected: { backgroundColor: '#1e3a5f' },
  stateOptionText:     { color: '#cbd5e1', fontSize: 13, fontWeight: '600' },
  stateOptionTextSelected: { color: '#38bdf8', fontWeight: '800' },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#334155',
    backgroundColor: '#1e293b',
  },
  chipSelected:     { backgroundColor: '#1e3a5f', borderColor: '#2563eb' },
  chipText:         { fontSize: 12, fontWeight: '600', color: '#64748b' },
  chipTextSelected: { color: '#60a5fa', fontWeight: '800' },

  privacyNote: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: 8,
  },
  privacyNoteText: { fontSize: 11, color: '#475569', lineHeight: 17, fontWeight: '600' },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0f172a',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: '#1e293b',
  },
  submitBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
});
