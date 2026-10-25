import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  TextInput,
  Linking,
  Animated,
  Dimensions
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsDesktop, DESKTOP_CONTENT_MAX_WIDTH } from '../hooks/useResponsive';
import { Alert } from '../components/AlertProvider';
import * as DocumentPicker from 'expo-document-picker';
import { getSubjectsByExamBody, getCustomQuestionSet, getTopicsBySubject } from '../database/queries';
import { getOrCreateDeviceLicense, validateLicenseInFile } from '../services/LicenseService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildPGMapPayload, TEACHER_CODE_LENGTH } from '../services/PGMapService';
import { exportAnswerBreakdownFile } from '../services/ReportService';
import * as Sharing from 'expo-sharing';
import QRCode from 'react-native-qrcode-svg';
import {
  CLASS_GROUPS,
  EXAM_CATEGORY_IDS,
  ALL_CATEGORY_IDS,
  getCategory,
  isClassCategory,
  categoryLabel,
  emptyCategoryMap,
} from '../config/categories';

const { width } = Dimensions.get('window');

const TICKER_SLIDES = [
  {
    emoji: '🌍',
    heading: 'Join PrepStation Community',
    sub: 'Download Basic & Premium Strata Files',
    accentColor: '#10b981',
    bgColor: '#0d2e1f',
    borderColor: '#10b981',
  },
  {
    emoji: '🛡️',
    heading: 'Use the BE A HERO Feature',
    sub: 'It Helps You Achieve Your Exam Aim',
    accentColor: '#a78bfa',
    bgColor: '#1e1b4b',
    borderColor: '#7c3aed',
  },
  {
    emoji: '🤝',
    heading: 'Refer PrepStation to Your Friends',
    sub: 'We Appreciate You for That',
    accentColor: '#fbbf24',
    bgColor: '#1c1200',
    borderColor: '#d97706',
  },
];

function TickerBanner({ isDarkMode, t }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(width);

  const runTicker = (currentIndex) => {
    translateX.setValue(containerWidth);
    Animated.timing(translateX, {
      toValue: 0,
      duration: 900,
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => {
      const next = (currentIndex + 1) % TICKER_SLIDES.length;
      setActiveIndex(next);
      runTicker(next);
    }, 4000);
    return timer;
  };

  useEffect(() => {
    const timer = runTicker(0);
    return () => clearTimeout(timer);
  }, [containerWidth]);

  const slide = TICKER_SLIDES[activeIndex];

  return (
    <View
      onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}
      style={[
        styles.gamifiedGamificationCard,
        {
          backgroundColor: slide.bgColor,
          borderColor: slide.borderColor,
          overflow: 'hidden',
          paddingVertical: 14,
          paddingHorizontal: 16,
          minHeight: 72,
          justifyContent: 'center',
        }
      ]}
    >
      <Animated.View style={{ transform: [{ translateX }], flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ fontSize: 26 }}>{slide.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: slide.accentColor, letterSpacing: 0.2, marginBottom: 3 }}>
            {slide.heading}
          </Text>
          <Text style={{ fontSize: 11, fontWeight: '600', color: slide.accentColor, opacity: 0.75, lineHeight: 15 }}>
            {slide.sub}
          </Text>
        </View>
        <View style={{ gap: 4, alignItems: 'center' }}>
          {TICKER_SLIDES.map((_, i) => (
            <View key={i} style={{
              width: 5,
              height: i === activeIndex ? 14 : 5,
              borderRadius: 3,
              backgroundColor: i === activeIndex ? slide.accentColor : 'rgba(255,255,255,0.2)',
            }} />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────
// CATEGORY SELECTOR  (animated)
// Exam bodies (JAMB/WAEC/NECO) plus class-level groups. Tapping a class group
// reveals its levels with a fade+slide. Whatever id we set here is exactly what
// an uploaded strata file must carry as structuralStrata.examCategory.
// ───────────────────────────────────────────────────────────────────────────────────────
const GROUP_ACCENT = { BASIC: '#0ea5e9', JSS: '#8b5cf6', SS: '#f59e0b' };

function CategoryPill({ label, active, showDot, compact, isDarkMode, t, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        paddingVertical: compact ? 8 : 11,
        paddingHorizontal: compact ? 14 : 12,
        borderRadius: 10,
        borderWidth: 1.5,
        flexGrow: compact ? 0 : 1,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
        backgroundColor: active ? '#2563eb' : t.card,
        borderColor: active ? '#1d4ed8' : t.border,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#ffffff' : (isDarkMode ? '#94a3b8' : '#475569') }}>
        {label}
      </Text>
      {showDot && (
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: active ? '#bbf7d0' : '#10b981' }} />
      )}
    </TouchableOpacity>
  );
}

function CategorySelector({ selectedExam, onSelect, examStrataMap, t, isDarkMode }) {
  const activeGroup = getCategory(selectedExam)?.group || null;
  const [openGroup, setOpenGroup] = useState(activeGroup);
  const reveal = useRef(new Animated.Value(activeGroup ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(reveal, {
      toValue: openGroup ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [openGroup]);

  const hasStrata = (id) => Array.isArray(examStrataMap?.[id]) && examStrataMap[id].length > 0;
  const openLevels = CLASS_GROUPS.find(g => g.group === openGroup)?.levels || [];

  return (
    <View style={{ marginBottom: 14 }}>
      {/* Exam bodies */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        {EXAM_CATEGORY_IDS.map(id => (
          <CategoryPill
            key={id}
            label={categoryLabel(id)}
            active={selectedExam === id}
            showDot={hasStrata(id)}
            isDarkMode={isDarkMode}
            t={t}
            onPress={() => { setOpenGroup(null); onSelect(id); }}
          />
        ))}
      </View>

      {/* Divider */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
        <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1, color: t.textSub }}>CLASS LEVELS</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
      </View>

      {/* Class-group pills */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {CLASS_GROUPS.map(({ group }) => {
          const isOpen   = openGroup === group;
          const isActive = activeGroup === group;
          const accent   = GROUP_ACCENT[group] || '#2563eb';
          return (
            <TouchableOpacity
              key={group}
              activeOpacity={0.85}
              onPress={() => setOpenGroup(isOpen ? null : group)}
              style={{
                flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
                backgroundColor: isActive ? accent : t.card,
                borderColor: (isOpen || isActive) ? accent : t.border,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '800', color: isActive ? '#ffffff' : (isDarkMode ? '#cbd5e1' : '#334155') }}>
                {group}
              </Text>
              <Text style={{ fontSize: 10, color: isActive ? '#ffffff' : t.textSub }}>{isOpen ? '▲' : '▼'}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Levels for the open group */}
      {openGroup ? (
        <Animated.View
          style={{
            opacity: reveal,
            transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
            marginTop: 10,
          }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {openLevels.map(lvl => (
              <CategoryPill
                key={lvl.id}
                label={lvl.label}
                active={selectedExam === lvl.id}
                showDot={hasStrata(lvl.id)}
                compact
                isDarkMode={isDarkMode}
                t={t}
                onPress={() => onSelect(lvl.id)}
              />
            ))}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const ACADEMIC_SUBJECTS = [
  { id: 'sub_eng', name: 'English Language', isCompulsory: true },
  { id: 'sub_mth', name: 'Mathematics', isCompulsory: false },
  { id: 'sub_phy', name: 'Physics', isCompulsory: false },
  { id: 'sub_chm', name: 'Chemistry', isCompulsory: false },
  { id: 'sub_bio', name: 'Biology', isCompulsory: false },
  { id: 'sub_agr', name: 'Agricultural Science', isCompulsory: false },
  { id: 'sub_geo', name: 'Geography', isCompulsory: false },
  { id: 'sub_eco', name: 'Economics', isCompulsory: false },
  { id: 'sub_gov', name: 'Government', isCompulsory: false },
  { id: 'sub_lit', name: 'Literature in English', isCompulsory: false },
  { id: 'sub_crs', name: 'Christian Religious Studies (CRS)', isCompulsory: false },
  { id: 'sub_irs', name: 'Islamic Religious Studies (IRS)', isCompulsory: false },
  { id: 'sub_com', name: 'Commerce', isCompulsory: false },
  { id: 'sub_acc', name: 'Accounting', isCompulsory: false },
  { id: 'sub_fth', name: 'Further Mathematics', isCompulsory: false },
  { id: 'sub_frn', name: 'French', isCompulsory: false },
  { id: 'sub_yrb', name: 'Yoruba', isCompulsory: false },
  { id: 'sub_igb', name: 'Igbo', isCompulsory: false },
  { id: 'sub_hau', name: 'Hausa', isCompulsory: false },
];

// ─────────────────────────────────────────────────────────────────────────────
// CORE UNLOCK UTILITY
// ─────────────────────────────────────────────────────────────────────────────
export async function applyBundleCompletionToStorage(bundleId, score, examCategory) {
  try {
    const raw = await AsyncStorage.getItem('examStrataMap');
    if (!raw) return null;

    const map        = JSON.parse(raw);
    const examStrata = map[examCategory] || [];

    const cloned = examStrata.map(st => ({
      ...st,
      bundles: st.bundles.map(b => ({ ...b })),
    }));

    let foundSI = -1;
    let foundBI = -1;
    for (let si = 0; si < cloned.length; si++) {
      const bi = cloned[si].bundles.findIndex(b => b.id === bundleId);
      if (bi !== -1) { foundSI = si; foundBI = bi; break; }
    }

    if (foundSI === -1) {
      console.warn('applyBundleCompletionToStorage: bundleId not found:', bundleId);
      return null;
    }

    const requiredPct = cloned[foundSI].bundles[foundBI].requiredScore ?? 70;
    const passed      = score >= requiredPct;

    cloned[foundSI].bundles[foundBI].lastScore   = score;
    cloned[foundSI].bundles[foundBI].isCompleted = passed;

    // ── PG Map tracking: log every attempt, not just the latest ──
    if (!Array.isArray(cloned[foundSI].bundles[foundBI].attempts)) {
      cloned[foundSI].bundles[foundBI].attempts = [];
    }
    cloned[foundSI].bundles[foundBI].attempts.push({
      score,
      passed,
      timestamp: new Date().toISOString(),
    });

    let nextBundleId  = null;
    let nextStrataIdx = -1;

    if (passed) {
      const nextBI = foundBI + 1;
      if (nextBI < cloned[foundSI].bundles.length) {
        cloned[foundSI].bundles[nextBI].isUnlocked = true;
        nextBundleId = cloned[foundSI].bundles[nextBI].id;
        console.log('✅ Next bundle unlocked:', nextBundleId);
      } else {
        const allDone = cloned[foundSI].bundles.every(b => b.isCompleted);
        if (allDone && foundSI + 1 < cloned.length) {
          cloned[foundSI + 1].isUnlocked          = true;
          cloned[foundSI + 1].bundles[0].isUnlocked = true;
          nextBundleId  = cloned[foundSI + 1].bundles[0].id;
          nextStrataIdx = foundSI + 1;
          console.log('✅ Next strata unlocked, first bundle:', nextBundleId);
        }
      }
    }

    const updated = { ...map, [examCategory]: cloned };
    await AsyncStorage.setItem('examStrataMap', JSON.stringify(updated));

    // Also write a separate key with just the "what to select next" info
    // HomeScreen reads this on mount to know which bundle to highlight
    if (nextBundleId) {
      await AsyncStorage.setItem('pendingBundleSelection', JSON.stringify({
        bundleId:     nextBundleId,
        strataIdx:    nextStrataIdx,
        examCategory: examCategory,
      }));
    }

    console.log('✅ applyBundleCompletionToStorage complete');
    return { nextBundleId, nextStrataIdx, passed };
  } catch (err) {
    console.error('applyBundleCompletionToStorage error:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HOME SCREEN
// No pendingCompletionMeta prop needed — reads directly from AsyncStorage
// ─────────────────────────────────────────────────────────────────────────────
// On web, a ScrollView nested inside flex:1 parents doesn't get a bounded
// height unless it (and this style) explicitly says minHeight: 0 — without
// it, the content just keeps growing the page instead of clipping and
// becoming scrollable, which is why mouse-wheel/trackpad scrolling appeared
// to do nothing on desktop. Harmless on native (minHeight: 0 is the default
// there anyway).
const webScrollFix = { flex: 1, minHeight: 0 };

export default function HomeScreen({ onStartPractice, onOpenAnalytics, onOpenSyncCenter, onSwitchToTeacher, historicalPerformanceData }) {
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const pgScrollRef = useRef(null);
  const [deviceLicenseCode, setDeviceLicenseCode] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [pgMapModalVisible, setPgMapModalVisible] = useState(false);
  const [pgMapPayload, setPgMapPayload] = useState(null);
  const [pgMapLoading, setPgMapLoading] = useState(false);
  const [pgMapTeacherCode, setPgMapTeacherCode] = useState(null);
  const [editingTeacherCode, setEditingTeacherCode] = useState(false);
  const [teacherCodeDraft, setTeacherCodeDraft] = useState('');

  const [heroProfile, setHeroProfile] = useState(null);
  const [heroModalOpen, setHeroModalOpen] = useState(false);
  const [heroExam, setHeroExam] = useState('JAMB');
  const [teacherCodeModalVisible, setTeacherCodeModalVisible] = useState(false);
  const [teacherCodeInput, setTeacherCodeInput] = useState('');
  const [savingTeacherCode, setSavingTeacherCode] = useState(false);
  const [heroWeakSubjects, setHeroWeakSubjects] = useState('');
  const [heroWeakTopics, setHeroWeakTopics] = useState('');
  const [heroDate, setHeroDate] = useState('April 2027');
  const [heroPastScore, setHeroPastScore] = useState('');
  const [heroChallenges, setHeroChallenges] = useState('');
  const [heroDailyTaskDone, setHeroDailyTaskDone] = useState(false);
  const [lastCheckedDate, setLastCheckedDate] = useState(new Date().toDateString());
  const [analyticsWeakSpot, setAnalyticsWeakSpot] = useState({ subjectName: 'General Practice', score: null });

  const [selectedExam, setSelectedExam] = useState('JAMB');
  const [subjects, setSubjects] = useState([]);
  const [selectedSubjects, setSelectedSubjects] = useState(['sub_eng']);
  const [setupMode, setSetupMode] = useState('STANDARD');
  const [availableTopics, setAvailableTopics] = useState([]);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [currentStrataVersion, setCurrentStrataVersion] = useState('Strata 1');

  const [examStrataMap, setExamStrataMap] = useState(emptyCategoryMap());
  const [selectedBundleId, setSelectedBundleId] = useState(null);
  const [activeStrataIndexMap, setActiveStrataIndexMap] = useState(emptyCategoryMap(() => 0));

  const allStrataData     = examStrataMap[selectedExam] || [];
  const activeStrataIndex = activeStrataIndexMap[selectedExam] || 0;

  const setActiveStrataIndex = (idx) => {
    setActiveStrataIndexMap(prev => ({ ...prev, [selectedExam]: idx }));
  };

  const [duration, setDuration] = useState(180);
  const [customSubjectAllocations, setCustomSubjectAllocations] = useState({});
  const [expandSubjectSelector, setExpandSubjectSelector] = useState(true);
  const [expandVolumeSelector, setExpandVolumeSelector] = useState(false);
  const [expandUpdaterPanel, setExpandUpdaterPanel] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [launchingQuiz, setLaunchingQuiz] = useState(false);
  const [isProcessingUpdate, setIsProcessingUpdate] = useState(false);

  const currentLimit = getCategory(selectedExam)?.subjectSlots ?? 5;

  const t = {
    bg: isDarkMode ? '#0f172a' : '#f8fafc',
    card: isDarkMode ? '#1e293b' : '#ffffff',
    textMain: isDarkMode ? '#f8fafc' : '#0f172a',
    textSub: isDarkMode ? '#94a3b8' : '#64748b',
    border: isDarkMode ? '#334155' : '#cbd5e1',
    accordionBg: isDarkMode ? '#1e293b' : '#ffffff',
    innerPanel: isDarkMode ? '#0f172a' : '#f1f5f9',
  };

  // ─────────────────────────────────────────────────────────────────────────
  // BOOT — runs once on mount (App.js forces remount via key={homeReloadKey})
  // Reads strata AND any pending bundle selection written by PracticeScreen
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const boot = async () => {
      try {
        const [strataRaw, indexRaw, pendingRaw] = await Promise.all([
          AsyncStorage.getItem('examStrataMap'),
          AsyncStorage.getItem('activeStrataIndexMap'),
          AsyncStorage.getItem('pendingBundleSelection'),
        ]);

        const parsedStrata = { ...emptyCategoryMap(),        ...(strataRaw ? JSON.parse(strataRaw) : {}) };
        const parsedIndex  = { ...emptyCategoryMap(() => 0), ...(indexRaw  ? JSON.parse(indexRaw)  : {}) };

        setExamStrataMap(parsedStrata);

        if (pendingRaw) {
          // Coming back from a completed exam — apply the pending selection
          const pending = JSON.parse(pendingRaw);
          const { bundleId, strataIdx, examCategory } = pending;

          console.log('📦 Applying pendingBundleSelection:', pending);

          if (examCategory) {
            setSelectedExam(examCategory);
            if (typeof strataIdx === 'number' && strataIdx >= 0) {
              setActiveStrataIndexMap({ ...parsedIndex, [examCategory]: strataIdx });
            } else {
              setActiveStrataIndexMap(parsedIndex);
            }
          } else {
            setActiveStrataIndexMap(parsedIndex);
          }

          if (bundleId) {
            setSelectedBundleId(bundleId);
          }

          // Clear it so it doesn't apply again next time
          await AsyncStorage.removeItem('pendingBundleSelection');
        } else {
          // Normal boot
          setActiveStrataIndexMap(parsedIndex);
        }
      } catch (err) {
        console.error('HomeScreen boot error:', err);
      }
    };

    boot();
    getOrCreateDeviceLicense().then(code => setDeviceLicenseCode(code));
  }, []); // empty deps — runs once on mount, App.js remounts via key change

  useEffect(() => {
    if (historicalPerformanceData?.length > 0) {
      const sorted = [...historicalPerformanceData].sort((a, b) => a.averageScore - b.averageScore);
      const worst  = sorted[0];
      if (worst) setAnalyticsWeakSpot({
        subjectName: worst.subjectName || 'Target Subject',
        score: Math.round(worst.averageScore),
      });
    }
  }, [historicalPerformanceData]);

  useEffect(() => {
    const handleDailyCycleCheck = () => {
      const today = new Date().toDateString();
      if (lastCheckedDate !== today) {
        setLastCheckedDate(today);
        if (!heroDailyTaskDone && heroProfile) {
          setHeroProfile(prev => ({ ...prev, successProbability: Math.max(20, prev.successProbability - 15) }));
          Alert.alert('Study Day Missed! 🚨', "You didn't check off yesterday's study goal.");
        } else {
          setHeroDailyTaskDone(false);
        }
      }
    };
    const timer = setInterval(handleDailyCycleCheck, 45000);
    handleDailyCycleCheck();
    return () => clearInterval(timer);
  }, [heroDailyTaskDone, lastCheckedDate, heroProfile]);

  useEffect(() => {
    async function loadSubjects() {
      setLoadingSubjects(true);
      setSelectedSubjects([]);
      setSelectedTopics([]);
      setCustomSubjectAllocations({});
      try {
        const list = await getSubjectsByExamBody(selectedExam);
        setSubjects(list);
      } catch (err) {
        console.error('Failed to load subjects:', err);
      } finally {
        setLoadingSubjects(false);
      }
    }
    loadSubjects();
  }, [selectedExam]);

  const handleOpenWhatsAppSupport = () => {
    const message = 'Hello, I need assistance with the examination platform.';
    const url = `whatsapp://send?phone=+2349135912668&text=${encodeURIComponent(message)}`;
    Linking.canOpenURL(url)
      .then(supported => supported
        ? Linking.openURL(url)
        : Linking.openURL(`https://wa.me/2349135912668?text=${encodeURIComponent(message)}`))
      .catch(() => Alert.alert('Error', 'Could not open WhatsApp support channel.'));
  };

  const rebuildPGMapPayload = async () => {
    setPgMapLoading(true);
    const { encoded } = await buildPGMapPayload();
    setPgMapPayload(encoded);
    setPgMapLoading(false);
  };

  const handleOpenPGMap = async () => {
    setPgMapLoading(true);
    setPgMapModalVisible(true);
    setEditingTeacherCode(false);
    const savedTeacher = await AsyncStorage.getItem('supervisingTeacherCode');
    setPgMapTeacherCode(savedTeacher || null);
    const { encoded } = await buildPGMapPayload();
    setPgMapPayload(encoded);
    setPgMapLoading(false);
  };

  const saveEditedTeacherCode = async () => {
    const code = (teacherCodeDraft || '').trim();
    if (!new RegExp(`^\\d{${TEACHER_CODE_LENGTH}}$`).test(code)) {
      Alert.alert('Invalid Code', `The supervising-teacher code must be exactly ${TEACHER_CODE_LENGTH} digits.`);
      return;
    }
    await AsyncStorage.setItem('supervisingTeacherCode', code);
    setPgMapTeacherCode(code);
    setEditingTeacherCode(false);
    rebuildPGMapPayload(); // so the new code rides along in the code immediately
  };

  const clearTeacherCode = async () => {
    await AsyncStorage.removeItem('supervisingTeacherCode');
    setPgMapTeacherCode(null);
    setEditingTeacherCode(false);
    rebuildPGMapPayload();
  };

  // Export the pupil's per-question answer breakdown as a small COMPRESSED .psr
  // file and share it one-tap (WhatsApp / Bluetooth / etc.). Deliberately a file,
  // not a QR or a long paste — a 500-question test's detail is far too large for
  // either. The teacher picks the file to import it.
  const handleSendBreakdown = async () => {
    const linked = await AsyncStorage.getItem('supervisingTeacherCode');
    if (!linked) {
      Alert.alert('Link your teacher first', 'Add your supervising teacher\u2019s code above, then send. Without it your teacher can\u2019t match this breakdown to you.');
      return;
    }
    const { uri, testCount, isElectron, error } = await exportAnswerBreakdownFile();
    if (error) {
      Alert.alert('Export failed', 'The answer breakdown could not be created. Please try again.');
      return;
    }
    if (!uri || testCount === 0) {
      Alert.alert('No class tests yet', 'Take at least one class test first — then you can send its answer breakdown to your teacher.');
      return;
    }

    // DESKTOP (Electron): no share sheet exists — reveal the file in the OS
    // file explorer so the pupil can attach it to WhatsApp/email themselves.
    if (isElectron) {
      if (window.electronFile) {
        await window.electronFile.showInFolder(uri);
      }
      Alert.alert('Breakdown ready', `Saved as:\n${uri}\n\nIt has been revealed in your file explorer — attach it to WhatsApp/email to send it to your teacher.`);
      return;
    }

    // NATIVE / plain web: original expo-sharing path.
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      Alert.alert('Sharing unavailable', 'This device can\u2019t open the share screen. Update the app or try another device.');
      return;
    }
    try {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/octet-stream',
        dialogTitle: 'Send answer breakdown to your teacher',
      });
    } catch (e) {
      // user dismissed the share sheet, or the share failed — nothing to do
    }
  };

  const selectCategory = (catId) => {
    setSelectedExam(catId);
    setSelectedSubjects([]);
    const es    = examStrataMap[catId] || [];
    const ai    = activeStrataIndexMap[catId] || 0;
    const first = es[ai]?.bundles?.find(b => b.isUnlocked);
    setSelectedBundleId(first?.id || null);
  };

  const getActiveStrata = () => allStrataData[activeStrataIndex] || allStrataData[0];

  const getCalculatedTotalQuestions = () => {
    if (Object.keys(customSubjectAllocations).length > 0) {
      return Object.values(customSubjectAllocations).reduce((sum, val) => sum + (parseInt(val, 10) || 0), 0);
    }
    const strata = getActiveStrata();
    if (strata?.bundles) {
      const allSubjects = strata.bundles.flatMap(b => b.subjects || []);
      if (allSubjects.length > 0) {
        const total = allSubjects.reduce((sum, js) => {
          const norm = js.subjectName.toLowerCase().replace(/\s+/g, '');
          const sel  = selectedSubjects.some(n => n.toLowerCase().replace(/\s+/g, '') === norm);
          return sel ? sum + (js.questions?.length || 0) : sum;
        }, 0);
        if (total > 0) return total;
      }
    }
    return getCategory(selectedExam)?.fallbackTotal ?? 500;
  };

  // Exam length comes ONLY from the strata file now (per-bundle first, then
  // strata-level), never from an in-app picker. 0 / missing => untimed.
  const DEFAULT_STRATA_MINUTES = 0;
  const resolveExamSeconds = (bundle, strata) => {
    const raw = bundle?.durationMinutes ?? strata?.durationMinutes ?? DEFAULT_STRATA_MINUTES;
    const m = parseInt(raw, 10);
    return (Number.isFinite(m) && m > 0) ? m * 60 : 0;
  };

  const formatDurationLabel = (mins) => {
    const m = parseInt(mins, 10) || 0;
    if (m <= 0) return 'No time limit';
    if (m === 240) return '4 Hours (Strict Ceiling)';
    const h = Math.floor(m / 60), r = m % 60;
    return h > 0 ? `${h}h ${r}m` : `${r} Minutes`;
  };

  const getStrataSubjectNames = () => {
    const strata = getActiveStrata();
    if (!strata?.bundles) return null;
    const hasSubjects = strata.bundles.some(b => Array.isArray(b.subjects) && b.subjects.length > 0);
    if (!hasSubjects) return null;

    // Deduplicate — collect unique subject names from the first bundle only
    // (all bundles in a strata have the same subjects, so bundle[0] is enough)
    const firstBundleWithSubjects = strata.bundles.find(
      b => Array.isArray(b.subjects) && b.subjects.length > 0
    );
    if (!firstBundleWithSubjects) return null;

    const names = firstBundleWithSubjects.subjects.map(s => s.subjectName.trim());
    return names.length > 0 ? names : null;
  };

  const isSubjectInStrata = (uiSubject, strataNames) => {
    if (!strataNames) return true;
    const name = uiSubject.name.toLowerCase().replace(/\s+/g, '');
    return strataNames.some(n => {
      const norm = n.toLowerCase().replace(/\s+/g, '');
      return norm === name || norm.includes(name) || name.includes(norm);
    });
  };

  const handleToggleSubject = (name) => {
    const isSelected = selectedSubjects.includes(name);
    if (isSelected) {
      setSelectedSubjects(prev => prev.filter(n => n !== name));
      setCustomSubjectAllocations(prev => { const u = { ...prev }; delete u[name]; return u; });
      return;
    }
    // A bundle's own subject list is the real requirement — use it as the
    // cap when known, so a bundle with more subjects than the category's
    // usual slot count is never impossible to fully select.
    const bundleSubjectCount = getStrataSubjectNames()?.length;
    const effectiveLimit = bundleSubjectCount && bundleSubjectCount > 0 ? bundleSubjectCount : currentLimit;
    if (selectedSubjects.length >= effectiveLimit) {
      Alert.alert('Limit Enforced', `${categoryLabel(selectedExam)} allows up to ${effectiveLimit} subjects.`);
      return;
    }
    setSelectedSubjects(prev => [...prev, name]);
  };

  const handleDurationChangeText = (val) => {
    const m = parseInt(val.replace(/[^0-9]/g, ''), 10) || 0;
    if (m > 240) { setDuration(240); Alert.alert('Ceiling Enforced', 'Maximum is 4 Hours (240 Minutes).'); }
    else setDuration(m);
  };

  const handleGenerateHeroPlan = () => {
    if (!heroWeakSubjects || !heroWeakTopics) { Alert.alert('Data Incomplete', 'Please specify your weak items.'); return; }
    let base = 45;
    if (heroPastScore && !heroPastScore.toLowerCase().includes('fail')) base += 15;
    if (heroChallenges.length > 30) base -= 10;
    setHeroProfile({
      exam: heroExam, date: heroDate, weakSubjects: heroWeakSubjects, weakTopics: heroWeakTopics,
      challenges: heroChallenges, successProbability: Math.min(96, Math.max(25, base)),
      dailyObjective: `Master structural questions in ${heroWeakSubjects.split(',')[0]} targeting ${heroWeakTopics.split(',')[0]}.`,
    });
    setHeroModalOpen(false);
  };

  const getHeroStatusCommentary = (pct) => {
    if (pct >= 75) return { label: '🔥 YOU WILL PASS', color: '#10b981' };
    if (pct >= 55) return { label: '⚡ IMPROVING', color: '#3b82f6' };
    if (pct >= 40) return { label: '⚠️ NOT SURE TO PASS EXAM', color: '#f59e0b' };
    return { label: '🚨 MAY FAIL THE EXAM', color: '#ef4444' };
  };

  const handleToggleDailyHeroTask = () => {
    if (!heroProfile) return;
    const done = !heroDailyTaskDone;
    setHeroDailyTaskDone(done);
    setHeroProfile(prev => ({
      ...prev,
      successProbability: done ? Math.min(99, prev.successProbability + 15) : Math.max(25, prev.successProbability - 15),
    }));
  };

  // ── PSZ decryption helpers (mirrors the admin tool exactly) ──────────────
  const PSZ_MAGIC   = 'PSZ1';
  const PSZ_APP_SALT = 'PSP_2025_DMS_GROUPS_SECURE_KEY_XK92';

  const derivePszKey = (deviceCode) =>
    PSZ_APP_SALT + '::' + deviceCode + '::' + PSZ_APP_SALT.split('').reverse().join('');

  const xorBytes = (data, key) => {
    const enc = new TextEncoder();
    const keyBytes = enc.encode(key);
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = data[i] ^ keyBytes[i % keyBytes.length];
    return out;
  };

  const checksumBytes = (data) => {
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum = (sum + data[i]) & 0xFFFFFFFF;
    return sum;
  };

  const bytesToUint32 = (b, offset) =>
    (((b[offset] << 24) | (b[offset+1] << 16) | (b[offset+2] << 8) | b[offset+3]) >>> 0);

  const unpackPsz = (bytes, deviceCode) => {
    const magic = new TextDecoder().decode(bytes.slice(0, 4));
    if (magic !== PSZ_MAGIC && magic !== 'PSR1') return { ok: false, reason: 'Not a valid .psz or .psr file.' };
    const checksum  = bytesToUint32(bytes, 5);
    const storedDev = new TextDecoder().decode(bytes.slice(9, 45)).replace(/\0/g, '').trim();
    const isUniversal = storedDev === 'UNIVERSAL' || storedDev === 'ALL' || storedDev === 'PUBLIC';
    if (storedDev && !isUniversal && deviceCode && storedDev !== deviceCode) {
      return { ok: false, reason: `File locked to device: ${storedDev}\nYour device: ${deviceCode}` };
    }
    const encrypted = bytes.slice(45);
    const key       = derivePszKey(isUniversal ? storedDev : (deviceCode || '000000'));
    const decrypted = xorBytes(encrypted, key);
    if (checksumBytes(decrypted) !== checksum) return { ok: false, reason: 'Checksum mismatch — file is corrupted or tampered.' };
    try {
      return { ok: true, payload: JSON.parse(new TextDecoder().decode(decrypted)) };
    } catch {
      return { ok: false, reason: 'Decryption produced invalid data. Wrong device or corrupted file.' };
    }
  };
  // ── End PSZ helpers ───────────────────────────────────────────────────────

  const handleLocalFileUpdatePick = async () => {
    try {
      const fileResult = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', 'application/octet-stream', '*/*'],
        copyToCacheDirectory: true,
      });
      if (fileResult.canceled || !fileResult.assets?.length) return;
      setIsProcessingUpdate(true);

      const pickedAsset = fileResult.assets[0];
      const fileName    = pickedAsset.name || '';
      const isPsz       = /\.(psz|psr)$/i.test(fileName);

      let pack;

      if (isPsz) {
        // ── PSZ path: binary fetch → decrypt → extract strata JSON ──
        const response  = await fetch(pickedAsset.uri);
        const buffer    = await response.arrayBuffer();
        const bytes     = new Uint8Array(buffer);
        const devCode   = deviceLicenseCode;

        if (!devCode) {
          Alert.alert('🔒 Device Code Unavailable', 'Could not read your device license code. Please restart the app and try again.');
          setIsProcessingUpdate(false); return;
        }

        const result = unpackPsz(bytes, devCode);
        if (!result.ok) {
          Alert.alert('🔒 PSZ Decryption Failed', result.reason);
          setIsProcessingUpdate(false); return;
        }

        // The psz payload wraps the original strata JSON under .strata
        pack = result.payload.strata || result.payload;
        if (!pack) {
          Alert.alert('❌ PSZ Format Error', 'Decrypted package has no strata data.');
          setIsProcessingUpdate(false); return;
        }
      } else {
        // ── JSON path: existing flow unchanged ──
        const raw = await (await fetch(pickedAsset.uri)).text();
        pack = JSON.parse(raw.trim());
      }

      // ── License check: PSZ files are already device-verified above,
      //    JSON files go through the existing sig_a/sig_b license gate ──
      if (!isPsz) {
        const licenseCheck = await validateLicenseInFile(pack);
        if (!licenseCheck.valid) {
          const msg = licenseCheck.reason === 'NO_LICENSE_IN_FILE'
            ? `This file has no device license.\n\nYour device code:\n🔑 ${deviceLicenseCode}`
            : licenseCheck.reason === 'MISMATCH'
            ? `File locked to a different device.\n\nFile code: ${licenseCheck.fileCode}\nThis device: ${deviceLicenseCode}`
            : 'License verification failed.';
          Alert.alert('🔒 Device License Mismatch', msg);
          setIsProcessingUpdate(false); return;
        }
      }

      if (!pack.structuralStrata) { Alert.alert('Format Mismatch', 'Valid strata signature missing.'); setIsProcessingUpdate(false); return; }

      const incoming = pack.structuralStrata;
      const examCat  = incoming.examCategory;
      if (!examCat) { Alert.alert('❌ Missing Category', 'Add an "examCategory" field, e.g. "WAEC", "JSS 2", or "SS 1".'); setIsProcessingUpdate(false); return; }
      if (!ALL_CATEGORY_IDS.includes(examCat)) { Alert.alert('❌ Invalid Category', `"${examCat}" is not a recognised category.`); setIsProcessingUpdate(false); return; }
      if (examCat !== selectedExam) { Alert.alert('⚠️ Wrong Exam File', `This file is for ${examCat} but you are on ${selectedExam}.\n\nSwitch to ${examCat} tab first.`); setIsProcessingUpdate(false); return; }
      if (!incoming.strataId) { Alert.alert('❌ Invalid File', 'Strata file must declare a strataId field.'); setIsProcessingUpdate(false); return; }
      const tier = incoming.tier === 'premium' ? 'premium' : 'basic';
      const incomingBundles = incoming.bundles || [];
      const strataIdSet = [...new Set(incomingBundles.map(b => b.strataId || incoming.strataId))];
      if (strataIdSet.length > 1) { Alert.alert('❌ Mixed Strata Rejected', `File contains bundles from ${strataIdSet.length} strata.`); setIsProcessingUpdate(false); return; }

      const strataNum = parseInt(incoming.strataId.replace(/\D/g, ''), 10) || 1;

      const currentRaw    = await AsyncStorage.getItem('examStrataMap');
      const currentMap    = { ...emptyCategoryMap(), ...(currentRaw ? JSON.parse(currentRaw) : {}) };
      const currentStrata = currentMap[examCat] || [];
      const existingNums  = currentStrata.map(s => parseInt(s.strataId.replace(/\D/g, ''), 10) || 1);
      const maxExisting   = existingNums.length > 0 ? Math.max(...existingNums) : 0;
      const isUpdate      = existingNums.includes(strataNum);
      const isNext        = strataNum === maxExisting + 1;
      const isFirst       = strataNum === 1;

      if (!isUpdate && !isNext && !isFirst) {
        Alert.alert('❌ Strata Sequence Violation', `Must complete Strata ${strataNum - 1} before installing this tier.\n\nCurrently on: Strata ${maxExisting}`);
        setIsProcessingUpdate(false); return;
      }
      if (isClassCategory(examCat)) {
        if (incomingBundles.length < 1) {
          Alert.alert('❌ Empty Bundle Set', 'This class strata contains no bundles.');
          setIsProcessingUpdate(false); return;
        }
      } else if (incomingBundles.length !== 5) {
        Alert.alert('❌ Incomplete Bundle Set', `Each exam strata must contain exactly 5 bundles.\n\nThis file has: ${incomingBundles.length}`);
        setIsProcessingUpdate(false); return;
      }

      const existingIdx  = currentStrata.findIndex(s => s.strataId === incoming.strataId);
      const buildBundles = (bundles, existing) => bundles.map((b, i) => ({
        ...b,
        isUnlocked:  i === 0 ? true : (existing?.[i]?.isUnlocked || false),
        isCompleted: existing?.[i]?.isCompleted || false,
        lastScore:   existing?.[i]?.lastScore || null,
        attempts:    existing?.[i]?.attempts || [],
      }));

      const newEntry = {
        strataId:     incoming.strataId,
        examCategory: examCat,
        displayName:  incoming.displayName || `STRATA ${strataNum}`,
        tier,
        isUnlocked:   strataNum === 1 || currentStrata.some(
          s => parseInt(s.strataId.replace(/\D/g, ''), 10) === strataNum - 1 && s.bundles.every(b => b.isCompleted)
        ),
        bundles: buildBundles(incomingBundles, existingIdx >= 0 ? currentStrata[existingIdx].bundles : []),
      };
      let updated;
      if (existingIdx >= 0) { updated = [...currentStrata]; updated[existingIdx] = newEntry; }
      else {
        updated = [...currentStrata, newEntry].sort((a, b) =>
          (parseInt(a.strataId.replace(/\D/g, ''), 10) || 1) - (parseInt(b.strataId.replace(/\D/g, ''), 10) || 1)
        );
      }

      const newMap = { ...currentMap, [examCat]: updated };
      await AsyncStorage.setItem('examStrataMap', JSON.stringify(newMap));

      const savedIndexRaw = await AsyncStorage.getItem('activeStrataIndexMap');
      const newIndexMap = {
        ...emptyCategoryMap(() => 0),
        ...(savedIndexRaw ? JSON.parse(savedIndexRaw) : {}),
        [examCat]: strataNum - 1,
      };
      await AsyncStorage.setItem('activeStrataIndexMap', JSON.stringify(newIndexMap));

      setExamStrataMap(newMap);
      setActiveStrataIndexMap(newIndexMap);
      setCurrentStrataVersion(incoming.displayName || `Strata ${strataNum}`);
      setSelectedBundleId(incomingBundles[0]?.id || null);

      Alert.alert(
        `✅ ${examCat} Strata Installed`,
        `${incoming.displayName || incoming.strataId} (${tier === 'premium' ? '👑 PREMIUM' : 'Basic'}) loaded with ${incomingBundles.length} bundles.\n\nBundle 1 is unlocked.`
      );
      setIsProcessingUpdate(false);
    } catch (err) {
      console.error(err);
      Alert.alert('Import Failure', `Failed parsing file: ${err.message}`);
      setIsProcessingUpdate(false);
    }
  };

  const handleLaunchExaminationSuite = async () => {
    const trackingGroup = getActiveStrata();
    const currentBundle = trackingGroup?.bundles?.find(b => b.id === selectedBundleId);

    if (currentBundle && !currentBundle.isUnlocked) {
      Alert.alert('Progression Lock Guard', 'You must pass earlier bundles to unlock this level.');
      return;
    }
    if (selectedSubjects.length < 1) {
      Alert.alert('Selection Match Required', 'Please choose at least one subject.');
      return;
    }

    // A bundle with a defined subject list must be attempted IN FULL — every
    // subject, every time. Without this, a pupil could select just one of a
    // bundle's several subjects, get scored only on that subject's
    // questions, clear the pass threshold, and the whole bundle (all its
    // subjects, not just the one attempted) would be marked completed —
    // letting them skip straight to the next bundle having never touched
    // the rest. getStrataSubjectNames() returns null for the legacy
    // custom/non-bundle mode, so that path is unaffected.
    const requiredSubjects = getStrataSubjectNames();
    if (requiredSubjects && requiredSubjects.length > 0) {
      const normalize = (s) => s.toLowerCase().replace(/\s+/g, '');
      const selectedNormalized = selectedSubjects.map(normalize);
      const missing = requiredSubjects.filter(
        (req) => !selectedNormalized.includes(normalize(req))
      );
      if (missing.length > 0) {
        Alert.alert(
          'All Subjects Required',
          `This bundle must be attempted with every subject, not just some of them.\n\nStill missing:\n${missing.map(m => `• ${m}`).join('\n')}`
        );
        return;
      }
    }

    // Class pupils must be linked to a supervising teacher (a numeric code)
    // before their first class test. The code then rides along with every
    // result (PracticeScreen stores it) so the teacher's app can claim them.
    if (isClassCategory(selectedExam)) {
      const linkedCode = await AsyncStorage.getItem('supervisingTeacherCode');
      if (!linkedCode || !new RegExp(`^\\d{${TEACHER_CODE_LENGTH}}$`).test(linkedCode)) {
        setTeacherCodeInput('');
        setTeacherCodeModalVisible(true);
        return;
      }
    }

    setLaunchingQuiz(true);
    try {
      // Selected subjects are strata subject NAMES now, so we match by name.
      const matchesSelected = (subjectName) => {
        const norm = subjectName.toLowerCase().replace(/\s+/g, '');
        return selectedSubjects.some(n => n.toLowerCase().replace(/\s+/g, '') === norm);
      };

      const allBundles     = trackingGroup?.bundles || [];
      const targetBundle   = allBundles.find(b => b.id === selectedBundleId) || allBundles[0];
      const bundleSubjects = targetBundle?.subjects || [];

      let combinedQuestionsPool = [];

      if (bundleSubjects.length > 0) {
        bundleSubjects.forEach(js => {
          const isSelec = matchesSelected(js.subjectName);
          if (isSelec && Array.isArray(js.questions)) {
            const normalized = js.questions.map(q => ({
              id:                  q.id,
              subject_id:          js.subjectName,
              question_text:       q.text,
              image:               q.image || null,
              option_a:            q.options[0] || '',
              option_b:            q.options[1] || '',
              option_c:            q.options[2] || '',
              option_d:            q.options[3] || '',
              correct_option:      (()=>{
                const raw = q.correct_option || q.correct_answer || q.answer || '';
                const str = String(raw).trim();
                const up = str.toUpperCase();
                if (['A', 'B', 'C', 'D'].includes(up)) return up;
                const opts = (q.options || []).map(o => String(o ?? '').trim());
                if (opts[0] && (str === opts[0] || raw === q.options[0])) return 'A';
                if (opts[1] && (str === opts[1] || raw === q.options[1])) return 'B';
                if (opts[2] && (str === opts[2] || raw === q.options[2])) return 'C';
                if (opts[3] && (str === opts[3] || raw === q.options[3])) return 'D';
                return 'A';
              })(),
              correct_answer_text: q.answer || '',
              explanation:         q.explanation || '',
            }));
            combinedQuestionsPool = [...combinedQuestionsPool, ...normalized];
          }
        });
      }

      if (combinedQuestionsPool.length === 0) {
        const total  = getCalculatedTotalQuestions();
        const perSub = Math.floor(total / selectedSubjects.length);
        for (const subId of selectedSubjects) {
          const lim = parseInt(customSubjectAllocations[subId], 10) || perSub;
          if (lim > 0) {
            const qs = await getCustomQuestionSet({ subjectId: subId, limit: lim, mode: 'STRATA_RUN' });
            if (qs?.length) combinedQuestionsPool = [...combinedQuestionsPool, ...qs];
          }
        }
      }

      if (combinedQuestionsPool.length === 0) {
        Alert.alert('Data Matrix Empty', 'No questions found. Upload a strata file first.');
        setLaunchingQuiz(false); return;
      }

      const subjectPartitions = bundleSubjects.length > 0
        ? bundleSubjects
            .filter(js => matchesSelected(js.subjectName))
            .reduce((acc, js) => {
              const start = acc.length === 0 ? 0 : acc[acc.length - 1].endIndex + 1;
              const total = js.questions?.length || 0;
              acc.push({ subjectName: js.subjectName, startIndex: start, endIndex: start + total - 1, totalQuestions: total });
              return acc;
            }, [])
        : [];

      onStartPractice({
        questions:          combinedQuestionsPool,
        mode:               'PROGRESSIVE_STRATA',
        timeAllowed:        resolveExamSeconds(currentBundle, trackingGroup),
        bundleId:           selectedBundleId,
        requiredScore:      currentBundle?.requiredScore ?? 70,
        isTheoryCompulsory: getCategory(selectedExam)?.theoryCompulsory ?? false,
        examCategory:       selectedExam,
        subjectMeta:        { name: `${currentBundle?.name || 'Bundle Track'} Run`, exam_body: selectedExam },
        subjectPartitions,
      });

    } catch (err) {
      console.error('Launch failure:', err);
      Alert.alert('Attention!', 'Upload Strata Files before Launch.');
    } finally {
      setLaunchingQuiz(false);
    }
  };

  const confirmTeacherCodeLink = async () => {
    const code = (teacherCodeInput || '').trim();
    if (!new RegExp(`^\\d{${TEACHER_CODE_LENGTH}}$`).test(code)) {
      Alert.alert('Invalid Code', `The supervising-teacher code must be exactly ${TEACHER_CODE_LENGTH} digits.`);
      return;
    }
    try {
      setSavingTeacherCode(true);
      await AsyncStorage.setItem('supervisingTeacherCode', code);
      setSavingTeacherCode(false);
      setTeacherCodeModalVisible(false);
      // Linked — go straight into the test the pupil was trying to start.
      handleLaunchExaminationSuite();
    } catch (e) {
      setSavingTeacherCode(false);
      Alert.alert('Could Not Save', 'Failed to link the teacher code. Please try again.');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: t.bg }]}>

      <View style={[styles.topToolbarHeader, { backgroundColor: '#312e81', borderBottomColor: '#1e1b4b' }, isDesktop && styles.topToolbarHeaderDesktop]}>
        <View style={[styles.headerTextInfoGroup, isDesktop && styles.headerTextInfoGroupDesktop]}>
  <Text style={[styles.brandTitleText, { color: '#FFD700' }, isDesktop && styles.brandTitleTextDesktop]} numberOfLines={1}>PrepStation Pro</Text>
  <Text style={styles.brandSubTitleText} numberOfLines={1}>⚡ PREMIUM EXAM COMPANION • {currentStrataVersion.toUpperCase()}</Text>
</View>
        <View style={[styles.headerRightActionsGroup, isDesktop && styles.headerRightActionsGroupDesktop]}>
          <TouchableOpacity style={[styles.headerActionButton, isDesktop && styles.headerActionButtonDesktop]} onPress={handleOpenPGMap}>
            <Text style={[styles.actionButtonEmoji, isDesktop && styles.actionButtonEmojiDesktop]}>📱</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.headerActionButton, isDesktop && styles.headerActionButtonDesktop]} onPress={() => setIsDarkMode(!isDarkMode)}>
            <Text style={[styles.actionButtonEmoji, isDesktop && styles.actionButtonEmojiDesktop]}>{isDarkMode ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.headerActionButton, { backgroundColor: '#064e3b', borderColor: '#10b981' }, isDesktop && styles.headerActionButtonDesktop]} onPress={() => onOpenSyncCenter(selectedExam)}>
            <Text style={[styles.actionButtonEmoji, isDesktop && styles.actionButtonEmojiDesktop]}>☁️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.headerActionButton, isDesktop && styles.headerActionButtonDesktop]} onPress={onOpenAnalytics}>
            <Text style={[styles.actionButtonEmoji, isDesktop && styles.actionButtonEmojiDesktop]}>📊</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.helpButtonWrapper} onPress={onSwitchToTeacher} activeOpacity={0.8}>
            <View style={[styles.helpIconCircle, { backgroundColor: '#8b5cf6' }]}><Text style={styles.helpIconEmoji}>🏫</Text></View>
            <Text style={[styles.helpLabelText, { color: '#a78bfa' }]}>TEACHER</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.helpButtonWrapper} onPress={handleOpenWhatsAppSupport} activeOpacity={0.8}>
            <View style={styles.helpIconCircle}><Text style={styles.helpIconEmoji}>📞</Text></View>
            <Text style={styles.helpLabelText}>HELP?</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerAccentBottomIndicatorLine} />
      </View>

      <ScrollView
        style={webScrollFix}
        contentContainerStyle={[styles.scrollWorkspaceContainer, isDesktop && styles.scrollWorkspaceContainerDesktop]}
        showsVerticalScrollIndicator={isDesktop}
      >

        {!heroProfile ? (
          <View style={styles.heroCatchyOnboardingContainer}>
            <View style={styles.heroCatchyRowHeader}>
              <Text style={styles.heroCatchyTitleText}>⚡ BE A HERO</Text>
              <View style={styles.heroStatusLiveBadge}><Text style={styles.heroStatusLiveBadgeText}>READY</Text></View>
            </View>
            <Text style={styles.heroCatchySubParagraphText}>
              Don't study blindly. Input your weakest topics and exam constraints to build an elite score blueprint with daily dynamic passing probability alerts.
            </Text>
            <TouchableOpacity style={styles.heroCatchyActionLaunchBtn} onPress={() => setHeroModalOpen(true)}>
              <Text style={styles.heroCatchyActionLaunchBtnText}>Initialize Blueprint Now 🚀</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.heroCatchyDashboardContainer}>
            <View style={styles.heroCatchyRowHeader}>
              <View>
                <Text style={styles.heroCatchyDashboardHeading}>🛡️ HERO STRATEGY ACTIVE</Text>
                <Text style={styles.heroCatchyDashboardSubExam}>{heroProfile.exam} Suite • Target: {heroProfile.date}</Text>
              </View>
              <TouchableOpacity style={styles.heroCatchyReDiagBtn} onPress={() => setHeroModalOpen(true)}>
                <Text style={styles.heroCatchyReDiagBtnText}>Reset ⚙️</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.heroCatchyMetricsSubPanel}>
              <Text style={styles.heroCatchyLabelMini}>DYNAMIC PROBABILITY OF SUCCESS</Text>
              <View style={styles.heroCatchyScoreValueRow}>
                <Text style={styles.heroCatchyBigPercentageString}>{heroProfile.successProbability}%</Text>
                <View style={[styles.heroCatchyVerdictPill, { backgroundColor: getHeroStatusCommentary(heroProfile.successProbability).color }]}>
                  <Text style={styles.heroCatchyVerdictText}>{getHeroStatusCommentary(heroProfile.successProbability).label}</Text>
                </View>
              </View>
              <View style={styles.heroCatchyMeterTrack}>
                <View style={[styles.heroCatchyMeterFill, {
                  width: `${heroProfile.successProbability}%`,
                  backgroundColor: getHeroStatusCommentary(heroProfile.successProbability).color,
                }]} />
              </View>
            </View>
            <Text style={styles.heroCatchyMissionTitleHeader}>🎯 TODAY'S SYLLABUS MISSION:</Text>
            <TouchableOpacity
              style={[styles.heroCatchyTaskInteractiveRow, heroDailyTaskDone && styles.heroCatchyTaskInteractiveRowChecked]}
              activeOpacity={0.85}
              onPress={handleToggleDailyHeroTask}
            >
              <View style={[styles.heroCatchyCheckboxSquare, heroDailyTaskDone && styles.heroCatchyCheckboxSquareChecked]}>
                {heroDailyTaskDone && <Text style={styles.heroCatchyCheckMarkMarker}>✓</Text>}
              </View>
              <Text style={[styles.heroCatchyTaskDescriptionText, heroDailyTaskDone && styles.heroCatchyTaskDescriptionTextStriked]}>
                {heroProfile.dailyObjective}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <TickerBanner isDarkMode={isDarkMode} t={t} />

        <TouchableOpacity
          style={[
            styles.smartFocusShortcutActionCardContainer,
            {
              backgroundColor: isDarkMode ? '#06281e' : '#f0fdf4',
              borderWidth: 2,
              borderColor: '#10b981',
              marginBottom: 10,
            },
          ]}
          activeOpacity={0.9}
          onPress={() => onOpenSyncCenter(selectedExam)}
        >
          <View style={styles.smartFocusLeftContentLayoutColumn}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <Text style={[styles.smartFocusHeadingTitle, { color: isDarkMode ? '#6ee7b7' : '#047857' }]}>
                ☁️ Strata Download & Sync Hub
              </Text>
              <View style={{ backgroundColor: '#10b981', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: '#022c22', fontSize: 9, fontWeight: '900' }}>AUTO-DETECT</Text>
              </View>
            </View>
            <Text style={[styles.smartFocusBriefDescriptionParagraph, { color: isDarkMode ? '#cbd5e1' : '#334155' }]}>
              New strata uploaded online? One-tap download & instant auto-import into your app with zero file-picker stress.
            </Text>
            <View style={[styles.smartFocusActionInlineActionPillBtn, { backgroundColor: '#10b981' }]}>
              <Text style={[styles.smartFocusActionInlineActionPillBtnText, { color: '#022c22' }]}>
                Open Cloud Download Hub ⚡
              </Text>
            </View>
          </View>
          <Text style={styles.smartFocusRightGraphicEmojiIcon}>📥</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.smartFocusShortcutActionCardContainer, { backgroundColor: '#0d2e1f', borderWidth: 1.5, borderColor: '#10b981' }]}
          activeOpacity={0.9}
          onPress={() => Linking.openURL('https://community.dmsgroups.com.ng')}
        >
          <View style={styles.smartFocusLeftContentLayoutColumn}>
            <Text style={[styles.smartFocusHeadingTitle, { color: '#6ee7b7' }]}>🌍 PrepStation Community</Text>
            <Text style={[styles.smartFocusBriefDescriptionParagraph, { color: '#ddd6fe' }]}>
              Get correct answers, step-by-step explanations, and connect with top students and tutors. Strata Files are Downloaded Here.
            </Text>
            <View style={[styles.smartFocusActionInlineActionPillBtn, { backgroundColor: '#10b981' }]}>
              <Text style={[styles.smartFocusActionInlineActionPillBtnText, { color: '#022c22' }]}>Join the Community →</Text>
            </View>
          </View>
          <Text style={styles.smartFocusRightGraphicEmojiIcon}>🔗</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionLabel, { color: t.textSub }]}>1. Select Category</Text>
        <CategorySelector
          selectedExam={selectedExam}
          examStrataMap={examStrataMap}
          t={t}
          isDarkMode={isDarkMode}
          onSelect={selectCategory}
        />

        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: isDarkMode ? '#06281e' : '#f0fdf4',
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: '#10b981',
          }}
          activeOpacity={0.8}
          onPress={() => onOpenSyncCenter(selectedExam)}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: isDarkMode ? '#6ee7b7' : '#047857' }}>
            ☁️ Looking for more {selectedExam} Strata files?
          </Text>
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#10b981' }}>
            Browse Cloud Hub →
          </Text>
        </TouchableOpacity>

        <Text style={[styles.sectionLabel, { color: t.textSub }]}>2. Choose Your Bundle Here</Text>

        {allStrataData.map((strata, strataIndex) => {
          const strataNum      = parseInt(strata.strataId.replace(/\D/g, ''), 10) || strataIndex + 1;
          const isUnlocked     = strata.isUnlocked;
          const allBundlesDone = strata.bundles.every(b => b.isCompleted);
          const isPremium      = strata.tier === 'premium';
          return (
            <View key={strata.strataId} style={[styles.constraintsCard, {
              backgroundColor: isPremium ? (isDarkMode ? '#2d2406' : '#fffbeb') : t.card,
              borderColor: isPremium
                ? '#d4af37'
                : activeStrataIndex === strataIndex ? '#2563eb' : t.border,
              borderWidth: isPremium ? 2 : 1,
              marginBottom: 10,
              opacity: isUnlocked ? 1 : 0.5,
            }]}>
              {isPremium && (
                <View style={premiumStyles.cardCrownBadge}>
                  <Text style={premiumStyles.cardCrownBadgeText}>👑 PREMIUM</Text>
                </View>
              )}
              <TouchableOpacity
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                onPress={() => {
                  if (!isUnlocked) { Alert.alert('🔒 Strata Locked', `Complete all bundles in Strata ${strataNum - 1} to unlock this tier.`); return; }
                  setActiveStrataIndex(strataIndex);
                  const first = strata.bundles.find(b => b.isUnlocked);
                  if (first) setSelectedBundleId(first.id);
                }}
              >
                <View>
                  <Text style={[styles.innerSectionTitle, { color: isPremium ? '#92400e' : t.textMain, marginTop: 0, marginBottom: 2 }]}>
                    {isUnlocked ? '' : '🔒 '}{strata.displayName}
                  </Text>
                  <Text style={{ fontSize: 11, color: allBundlesDone ? '#10b981' : isPremium ? '#a16207' : t.textSub }}>
                    {allBundlesDone ? '✅ All bundles completed' : `${strata.bundles.filter(b => b.isCompleted).length}/${strata.bundles.length} bundles done`}
                  </Text>
                </View>
                {activeStrataIndex === strataIndex && (
                  <View style={[styles.heroStatusLiveBadge, { backgroundColor: isPremium ? '#fef3c7' : '#dbeafe' }]}>
                    <Text style={{ color: isPremium ? '#92400e' : '#1d4ed8', fontSize: 10, fontWeight: '900' }}>ACTIVE</Text>
                  </View>
                )}
              </TouchableOpacity>

              {activeStrataIndex === strataIndex && (
                <View style={{ gap: 8, marginTop: 10 }}>
                  {strata.bundles.map((bundle, bi) => {
                    const isSelected = selectedBundleId === bundle.id;
                    const prev       = bi > 0 ? strata.bundles[bi - 1] : null;
                    const isLocked   = !bundle.isUnlocked;
                    return (
                      <TouchableOpacity
                        key={bundle.id}
                        style={[
                          styles.subjectAllocationRow,
                          {
                            paddingHorizontal: 10,
                            borderRadius: 8,
                            backgroundColor: isPremium ? (isDarkMode ? '#3d2f06' : '#fef9e7') : t.innerPanel,
                            opacity: isLocked ? 0.5 : 1,
                            borderWidth: isPremium ? 1 : 0,
                            borderColor: isPremium ? '#d4af37' : 'transparent',
                          },
                          isSelected && { borderColor: isPremium ? '#d4af37' : '#2563eb', borderWidth: 1.5 },
                        ]}
                        onPress={() => {
                          if (isLocked) {
                            Alert.alert('🔒 Bundle Locked',
                              `Score at least ${prev?.requiredScore ?? '—'}% on ${prev?.name ?? 'the previous bundle'} first.\n\n${prev?.lastScore != null ? `Your last score: ${prev.lastScore}%` : 'Not attempted yet.'}`);
                            return;
                          }
                          setSelectedBundleId(bundle.id);
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.subjectRowNameLabel, { color: isPremium ? '#78350f' : t.textMain }]}>
                            {isLocked ? '🔒 ' : bundle.isCompleted ? '✅ ' : isPremium ? '👑 ' : ''}{bundle.name}
                          </Text>
                          <Text style={{ fontSize: 11, color: isPremium ? '#a16207' : t.textSub }}>
                            Required pass: {bundle.requiredScore}%
                            {bundle.lastScore != null ? `  •  Last score: ${bundle.lastScore}%` : ''}
                          </Text>
                        </View>
                        <View style={[styles.heroStatusLiveBadge, {
                          backgroundColor: bundle.isCompleted ? '#ccfbf1' : isLocked ? '#fee2e2' : isPremium ? '#fef3c7' : '#fef9c3',
                        }]}>
                          <Text style={{
                            fontSize: 10, fontWeight: '900',
                            color: bundle.isCompleted ? '#0f766e' : isLocked ? '#991b1b' : '#92400e',
                          }}>
                            {bundle.isCompleted ? 'DONE' : isLocked ? 'LOCKED' : 'READY'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        <TouchableOpacity
          style={[styles.accordionHeaderButton, { backgroundColor: t.accordionBg, borderColor: t.border }]}
          onPress={() => setExpandSubjectSelector(p => !p)}
        >
          <View style={styles.accordionHeaderLeftWrapper}>
            <Text style={[styles.accordionTitleText, { color: t.textMain }]}>
              3. Select Group Subjects ({selectedSubjects.length} of {getStrataSubjectNames()?.length || currentLimit} Selected)
            </Text>
          </View>
          <Text style={[styles.accordionChevronIcon, { color: t.textSub }]}>{expandSubjectSelector ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {expandSubjectSelector && (
          <View style={styles.accordionContentDropdown}>
            <View style={styles.multiChipsContainer}>
              {(() => {
                const strataSubjects = getStrataSubjectNames() || [];
                if (strataSubjects.length === 0) {
                  return (
                    <Text style={{ fontSize: 12, color: t.textSub, fontStyle: 'italic', paddingVertical: 6 }}>
                      Upload a strata file for {categoryLabel(selectedExam)} to load its subjects.
                    </Text>
                  );
                }
                return strataSubjects.map(name => {
                  const isSel = selectedSubjects.includes(name);
                  return (
                    <TouchableOpacity
                      key={name}
                      activeOpacity={0.7}
                      onPress={() => handleToggleSubject(name)}
                      style={[
                        styles.chipItem,
                        { backgroundColor: t.card, borderColor: t.border },
                        isSel && styles.chipItemActive,
                      ]}
                    >
                      <Text style={[styles.chipText, { color: isDarkMode ? '#94a3b8' : '#475569' }, isSel && styles.chipTextActive]}>
                        {isSel ? '✓ ' : '+ '}{name}
                      </Text>
                    </TouchableOpacity>
                  );
                });
              })()}
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.accordionHeaderButton, { backgroundColor: t.accordionBg, borderColor: t.border }]}
          onPress={() => setExpandVolumeSelector(p => !p)}
        >
          <View style={styles.accordionHeaderLeftWrapper}>
            <Text style={[styles.accordionTitleText, { color: t.textMain }]}>4. EXAMINATION TIMING (STRATA-DEFINED)</Text>
          </View>
          <Text style={[styles.accordionChevronIcon, { color: t.textSub }]}>{expandVolumeSelector ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {expandVolumeSelector && (
          <View style={styles.accordionContentDropdown}>
            <View style={[styles.constraintsCard, { backgroundColor: t.card, borderColor: t.border }]}>
              <Text style={[styles.innerSectionTitle, { color: t.textMain, marginTop: 0 }]}>📋 Automatic Bundle Structure</Text>
              <Text style={{ fontSize: 12, color: t.textSub, marginBottom: 10 }}>
                {getCategory(selectedExam)?.type === 'class'
                  ? 'Question volume and timing are defined by the uploaded strata file.'
                  : (selectedExam === 'JAMB'
                      ? 'JAMB auto-configures MCQs across your selected subjects.'
                      : 'WAEC/NECO auto-configures MCQs across your selected subjects.')}
              </Text>
              <View style={styles.dividerLineSpacer} />
              <Text style={[styles.innerSectionTitle, { color: t.textMain }]}>⏱️ Test Duration (from Strata)</Text>
              {(() => {
                const strata = getActiveStrata();
                const bundle = strata?.bundles?.find(b => b.id === selectedBundleId);
                const mins   = bundle?.durationMinutes ?? strata?.durationMinutes ?? null;
                return (
                  <View style={styles.timeAllocationBlockRow}>
                    <Text style={[styles.liveReadableTimeOutputString, { color: t.textMain }]}>
                      {mins == null ? (
                        <Text style={{ fontWeight: '800', color: '#f59e0b' }}>Not set in strata — untimed</Text>
                      ) : (
                        <Text>Duration: <Text style={{ fontWeight: '800', color: '#2563eb' }}>{formatDurationLabel(mins)}</Text></Text>
                      )}
                    </Text>
                  </View>
                );
              })()}
              <Text style={{ fontSize: 11, color: t.textSub, marginTop: 6 }}>
                ⓘ Timing is set by the strata file's duration field and can't be edited on this screen.
              </Text>
              <View style={styles.summaryStatusTelemetryBox}>
                <Text style={styles.telemetryTitleText}>⚡ Total Configuration Load:</Text>
                <View style={styles.telemetryRowData}>
                  <Text style={styles.telemetryLabelText}>Worksheet Aggregate Size:</Text>
                  <Text style={[styles.telemetryValueText, { color: '#10b981' }]}>{getCalculatedTotalQuestions()} MCQ in TOTAL</Text>
                </View>
                <View style={styles.telemetryRowData}>
                  <Text style={styles.telemetryLabelText}>Post-Exam Sequence:</Text>
                  <Text style={[styles.telemetryValueText, { color: '#2563eb' }]}>
                    {getCategory(selectedExam)?.theoryCompulsory ? 'Theory Compulsory' : 'Direct Evaluation'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.accordionHeaderButton, { borderColor: '#10b981', backgroundColor: isDarkMode ? '#064e3b' : '#f0fdf4' }]}
          onPress={() => setExpandUpdaterPanel(p => !p)}
        >
          <Text style={[styles.accordionTitleText, { color: isDarkMode ? '#f8fafc' : '#047857' }]}>📂 Strata Upload and Update Corner</Text>
          <Text style={{ color: isDarkMode ? '#f8fafc' : '#047857' }}>{expandUpdaterPanel ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {expandUpdaterPanel && (
          <View style={[styles.updaterContainerBox, { backgroundColor: t.card, borderColor: t.border }]}>
            <View style={{
              backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9',
              borderRadius: 10, padding: 12, marginBottom: 12,
              borderWidth: 1.5, borderColor: '#2563eb', alignItems: 'center',
            }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#2563eb', letterSpacing: 1, marginBottom: 4 }}>
                🔑 THIS DEVICE'S LICENSE CODE
              </Text>
              <Text style={{ fontSize: 28, fontWeight: '900', color: t.textMain, letterSpacing: 6 }}>
                {deviceLicenseCode ?? '------'}
              </Text>
              <Text style={{ fontSize: 10, color: t.textSub, marginTop: 4, textAlign: 'center' }}>
                Share this code with your administrator to generate a strata file locked to this device.
              </Text>
            </View>
            <Text style={{ fontSize: 11, color: t.textSub, marginBottom: 8 }}>
              The file must be generated for this specific device code.
            </Text>
            <TouchableOpacity
              style={[styles.fileSelectButton, { backgroundColor: '#10b981', marginBottom: 10 }]}
              onPress={() => onOpenSyncCenter(selectedExam)}
            >
              <Text style={[styles.fileSelectButtonText, { color: '#022c22', fontWeight: '900' }]}>
                ☁️ Open Cloud Strata Download & Sync Hub ⚡
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.fileSelectButton} onPress={handleLocalFileUpdatePick} disabled={isProcessingUpdate}>
              <Text style={styles.fileSelectButtonText}>
                {isProcessingUpdate ? 'Verifying License...' : 'Or Upload Strata File from Device 📎'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal animationType="slide" transparent visible={heroModalOpen} onRequestClose={() => setHeroModalOpen(false)}>
        <ScrollView contentContainerStyle={styles.heroFormScrollOverlayContainer}>
          <View style={[styles.heroFormCardBody, { backgroundColor: t.card, borderColor: t.border }]}>
            <Text style={[styles.heroModalTitleHeader, { color: t.textMain }]}>🛡️ Build Your Hero Blueprint</Text>
            <Text style={[styles.inputFieldLabelLabel, { color: t.textMain }]}>Target Examination:</Text>
            <View style={styles.structuralGridRow}>
              {['JAMB', 'WAEC', 'NECO'].map(exam => (
                <TouchableOpacity key={exam}
                  style={[styles.examSelectionTab, { backgroundColor: t.innerPanel, borderColor: t.border }, heroExam === exam && styles.examSelectionTabActive]}
                  onPress={() => setHeroExam(exam)}>
                  <Text style={[styles.examTabText, { color: t.textMain }, heroExam === exam && { color: '#fff' }]}>{exam}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.inputFieldLabelLabel, { color: t.textMain }]}>Date of Exam:</Text>
            <TextInput style={[styles.heroTextInputBox, { backgroundColor: t.innerPanel, color: t.textMain, borderColor: t.border }]} placeholder="e.g. April 2027" placeholderTextColor={t.textSub} value={heroDate} onChangeText={setHeroDate} />
            <Text style={[styles.inputFieldLabelLabel, { color: t.textMain }]}>Your Weakest Subjects:</Text>
            <TextInput style={[styles.heroTextInputBox, { backgroundColor: t.innerPanel, color: t.textMain, borderColor: t.border }]} placeholder="e.g. Mathematics, Physics" placeholderTextColor={t.textSub} value={heroWeakSubjects} onChangeText={setHeroWeakSubjects} />
            <Text style={[styles.inputFieldLabelLabel, { color: t.textMain }]}>Your Weakest Topics:</Text>
            <TextInput style={[styles.heroTextInputBox, { backgroundColor: t.innerPanel, color: t.textMain, borderColor: t.border }]} placeholder="e.g. Calculus, Geometry" placeholderTextColor={t.textSub} value={heroWeakTopics} onChangeText={setHeroWeakTopics} />
            <Text style={[styles.inputFieldLabelLabel, { color: t.textMain }]}>Past Score:</Text>
            <TextInput style={[styles.heroTextInputBox, { backgroundColor: t.innerPanel, color: t.textMain, borderColor: t.border }]} placeholder="e.g. 180 last year" placeholderTextColor={t.textSub} value={heroPastScore} onChangeText={setHeroPastScore} />
            <Text style={[styles.inputFieldLabelLabel, { color: t.textMain }]}>Core Study Challenges:</Text>
            <TextInput style={[styles.heroTextInputBox, { backgroundColor: t.innerPanel, color: t.textMain, borderColor: t.border, height: 60 }]} multiline numberOfLines={2} placeholder="e.g. Time management" placeholderTextColor={t.textSub} value={heroChallenges} onChangeText={setHeroChallenges} />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
              <TouchableOpacity style={styles.modalActionCancel} onPress={() => setHeroModalOpen(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalActionSave, { backgroundColor: '#eab308' }]} onPress={handleGenerateHeroPlan}>
                <Text style={[styles.modalSaveText, { color: '#000' }]}>Generate Matrix ⚡</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </Modal>

      <Modal animationType="fade" transparent visible={pgMapModalVisible} onRequestClose={() => setPgMapModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={pgMapStyles.overlay}
        >
          <View style={pgMapStyles.card}>
            <ScrollView
              ref={pgScrollRef}
              showsVerticalScrollIndicator={isDesktop}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
            >
            <Text style={pgMapStyles.title}>📱 PG Map</Text>
            <Text style={pgMapStyles.subtitle}>
              Your encrypted progress code — scan this at PrepStation Community to verify your test history.
            </Text>

            <View style={pgMapStyles.qrFrame}>
              {pgMapLoading ? (
                <Text style={pgMapStyles.loadingText}>Generating...</Text>
              ) : pgMapPayload ? (
                // QR is only drawn when the payload is small enough. A large payload
                // makes a very dense QR that OOM-crashes low-RAM (<4GB) devices, so
                // above the threshold we skip the QR and lean on the copyable string.
                pgMapPayload.length <= 1200 ? (
                  <QRCode value={pgMapPayload} size={200} ecl="L" backgroundColor="#ffffff" color="#0f172a" />
                ) : (
                  <View style={{ alignItems: 'center', paddingHorizontal: 12 }}>
                    <Text style={{ fontSize: 38, marginBottom: 8 }}>📋</Text>
                    <Text style={[pgMapStyles.loadingText, { textAlign: 'center' }]}>
                      This progress code is large — the QR is skipped on low-memory devices. Copy the string below and paste it instead.
                    </Text>
                  </View>
                )
              ) : (
                <Text style={pgMapStyles.loadingText}>No progress data yet.</Text>
              )}
            </View>

            {pgMapPayload ? (
              <View style={pgMapStyles.encodedStringBox}>
                <Text style={pgMapStyles.encodedStringLabel}>📋 ENCODED STRING (share if QR fails)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={pgMapStyles.encodedStringScroll}>
                  <Text style={pgMapStyles.encodedStringText} selectable>{pgMapPayload}</Text>
                </ScrollView>
                <TouchableOpacity
                  style={pgMapStyles.copyStringBtn}
                  onPress={() => {
                    import('react-native').then(({ Share }) => {
                      Share.share({ message: pgMapPayload, title: 'PG Map Encoded String' });
                    });
                  }}
                >
                  <Text style={pgMapStyles.copyStringBtnText}>📋 Copy / Share String</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={pgMapStyles.teacherSection}>
              {editingTeacherCode ? (
                <View>
                  <Text style={pgMapStyles.teacherLabel}>
                    SUPERVISING TEACHER CODE ({TEACHER_CODE_LENGTH} DIGITS)
                  </Text>
                  <TextInput
                    style={pgMapStyles.teacherInput}
                    keyboardType="number-pad"
                    maxLength={TEACHER_CODE_LENGTH}
                    placeholder={'0'.repeat(TEACHER_CODE_LENGTH)}
                    placeholderTextColor="#94a3b8"
                    value={teacherCodeDraft}
                    onChangeText={(v) => setTeacherCodeDraft(v.replace(/[^0-9]/g, ''))}
                    autoFocus
                  />
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <TouchableOpacity style={pgMapStyles.teacherSaveBtn} onPress={saveEditedTeacherCode}>
                      <Text style={pgMapStyles.teacherSaveText}>Save</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={pgMapStyles.teacherCancelBtn} onPress={() => setEditingTeacherCode(false)}>
                      <Text style={pgMapStyles.teacherCancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={pgMapStyles.teacherLabel}>SUPERVISING TEACHER</Text>
                    <Text style={[pgMapStyles.teacherValue, { color: pgMapTeacherCode ? '#0f172a' : '#94a3b8', letterSpacing: pgMapTeacherCode ? 2 : 0 }]}>
                      {pgMapTeacherCode || 'Not linked yet'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={pgMapStyles.teacherChangeBtn}
                      onPress={() => { setTeacherCodeDraft(pgMapTeacherCode || ''); setEditingTeacherCode(true); setTimeout(() => pgScrollRef.current?.scrollToEnd({ animated: true }), 150); }}
                    >
                      <Text style={pgMapStyles.teacherChangeText}>{pgMapTeacherCode ? 'Change' : 'Add'}</Text>
                    </TouchableOpacity>
                    {pgMapTeacherCode ? (
                      <TouchableOpacity style={pgMapStyles.teacherUnlinkBtn} onPress={clearTeacherCode}>
                        <Text style={pgMapStyles.teacherUnlinkText}>Unlink</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              )}
            </View>

            <TouchableOpacity style={pgMapStyles.breakdownBtn} onPress={handleSendBreakdown}>
              <Text style={pgMapStyles.breakdownBtnText}>📄  Send answer breakdown to teacher</Text>
            </TouchableOpacity>
            <Text style={pgMapStyles.breakdownHint}>
              Sends the questions you missed and the option you picked — so your teacher can go over them with you.
            </Text>

            <TouchableOpacity style={pgMapStyles.closeBtn} onPress={() => setPgMapModalVisible(false)}>
              <Text style={pgMapStyles.closeBtnText}>Close</Text>
            </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={teacherCodeModalVisible}
        onRequestClose={() => setTeacherCodeModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 380, backgroundColor: t.card, borderRadius: 18, borderWidth: 1, borderColor: t.border, padding: 22 }}>
            <Text style={{ fontSize: 34, textAlign: 'center', marginBottom: 2 }}>🎓</Text>
            <Text style={{ fontSize: 18, fontWeight: '900', color: t.textMain, textAlign: 'center' }}>Link Your Supervising Teacher</Text>
            <Text style={{ fontSize: 13, color: t.textSub, textAlign: 'center', marginTop: 8, lineHeight: 19 }}>
              Enter the {TEACHER_CODE_LENGTH}-digit code your teacher gave you. Your {categoryLabel(selectedExam)} results will be shared with them through your PG Map.
            </Text>

            <TextInput
              style={{
                marginTop: 18, borderWidth: 1.5, borderColor: '#2563eb', borderRadius: 12,
                backgroundColor: t.innerPanel, color: t.textMain, textAlign: 'center',
                fontSize: 24, fontWeight: '800', letterSpacing: 6, paddingVertical: 12,
              }}
              keyboardType="number-pad"
              maxLength={TEACHER_CODE_LENGTH}
              placeholder={'0'.repeat(TEACHER_CODE_LENGTH)}
              placeholderTextColor={isDarkMode ? '#475569' : '#cbd5e1'}
              value={teacherCodeInput}
              onChangeText={(v) => setTeacherCodeInput(v.replace(/[^0-9]/g, ''))}
              autoFocus
            />

            <Text style={{ fontSize: 11, color: t.textSub, textAlign: 'center', marginTop: 8 }}>
              This links your device to one teacher and is remembered for future tests.
            </Text>

            <TouchableOpacity
              style={{
                marginTop: 18, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
                backgroundColor: teacherCodeInput.length === TEACHER_CODE_LENGTH ? '#2563eb' : (isDarkMode ? '#1e293b' : '#cbd5e1'),
              }}
              disabled={teacherCodeInput.length !== TEACHER_CODE_LENGTH || savingTeacherCode}
              onPress={confirmTeacherCodeLink}
            >
              <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '800' }}>
                {savingTeacherCode ? 'Linking...' : 'Link & Start Test'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={{ marginTop: 10, paddingVertical: 10, alignItems: 'center' }} onPress={() => setTeacherCodeModalVisible(false)}>
              <Text style={{ color: t.textSub, fontSize: 13, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={[styles.floatingActionFooterContainer, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: t.card, borderColor: t.border }]}>
        <TouchableOpacity style={styles.masterLaunchActionBtn} onPress={handleLaunchExaminationSuite} disabled={launchingQuiz}>
          <Text style={styles.masterLaunchActionBtnText}>{launchingQuiz ? 'Preparing...' : 'Launch Exam Here 🚀'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  helpButtonWrapper: {
  alignItems: 'center',
  justifyContent: 'center',
},
  helpIconCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center', elevation: 4 },
  helpIconEmoji: { fontSize: 12 },
  helpLabelText: { fontSize: 6, fontWeight: '900', color: '#25D366', letterSpacing: 0.3, marginTop: 2 },
  topToolbarHeader: {
  paddingVertical: 10,
  paddingHorizontal: 14,
  paddingBottom: 12,
  borderBottomWidth: 1,
  position: 'relative',
},
  topToolbarHeaderDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
    paddingVertical: 16,
    paddingBottom: 16,
  },
headerTextInfoGroup: {
  marginBottom: 7,
},
  headerTextInfoGroupDesktop: {
    marginBottom: 0,
  },
headerRightActionsGroup: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-evenly',
  width: '100%',
  marginTop: 3,
},
  headerRightActionsGroupDesktop: {
    width: 'auto',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 0,
  },
brandTitleText: {
  fontSize: 18,
  fontWeight: '900',
  letterSpacing: 0.3,
},
  brandTitleTextDesktop: {
    fontSize: 24,
  },
brandSubTitleText: {
  fontSize: 8,
  color: '#c7d2fe',          // light indigo — pops on the deep header
  fontWeight: '800',
  marginTop: 3,
  letterSpacing: 0.4,
},
  headerActionButton: {
  width: 25,
  height: 25,
  borderRadius: 6,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  backgroundColor: 'rgba(255,255,255,0.14)',
  borderColor: 'rgba(255,255,255,0.22)',
},
  headerActionButtonDesktop: {
    width: 36,
    height: 36,
    borderRadius: 9,
  },

  actionButtonEmoji: { fontSize: 11 },
  actionButtonEmojiDesktop: { fontSize: 15 },
  headerAccentBottomIndicatorLine: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: '#a855f7' },
  scrollWorkspaceContainer: { padding: 16, paddingBottom: 110 },
  scrollWorkspaceContainerDesktop: {
    width: '100%',
    maxWidth: DESKTOP_CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 40,
    paddingTop: 28,
    paddingBottom: 80,
  },
  sectionLabel: { fontSize: 11, fontWeight: '800', marginBottom: 8, textTransform: 'uppercase', marginTop: 10 },
  structuralGridRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  examSelectionTab: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  examSelectionTabActive: { backgroundColor: '#2563eb', borderColor: '#1d4ed8' },
  examTabText: { fontSize: 13, fontWeight: '700' },
  examTabTextActive: { color: '#ffffff' },
  gamifiedGamificationCard: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  heroCatchyOnboardingContainer: { backgroundColor: '#2e1065', padding: 20, borderRadius: 16, borderWidth: 1.5, borderColor: '#a78bfa', marginBottom: 20 },
  heroCatchyRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  heroCatchyTitleText: { color: '#a78bfa', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  heroStatusLiveBadge: { backgroundColor: '#ccfbf1', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  heroStatusLiveBadgeText: { color: '#0f766e', fontSize: 10, fontWeight: '900' },
  heroCatchySubParagraphText: { color: '#ddd6fe', fontSize: 12, lineHeight: 18, marginBottom: 16 },
  heroCatchyActionLaunchBtn: { backgroundColor: '#ccff00', paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  heroCatchyActionLaunchBtnText: { color: '#1e1b4b', fontSize: 13, fontWeight: '900' },
  heroCatchyDashboardContainer: { backgroundColor: '#1e1b4b', padding: 18, borderRadius: 16, borderWidth: 1.5, borderColor: '#4c1d95', marginBottom: 20 },
  heroCatchyDashboardHeading: { color: '#ccff00', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  heroCatchyDashboardSubExam: { color: '#a78bfa', fontSize: 11, fontWeight: '700', marginTop: 1 },
  heroCatchyReDiagBtn: { backgroundColor: 'rgba(255,255,255,0.08)', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6 },
  heroCatchyReDiagBtnText: { color: '#cbd5e1', fontSize: 11, fontWeight: '600' },
  heroCatchyMetricsSubPanel: { backgroundColor: 'rgba(76,29,149,0.35)', padding: 14, borderRadius: 12, marginVertical: 12, borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)' },
  heroCatchyLabelMini: { color: '#c084fc', fontSize: 9, fontWeight: '800', letterSpacing: 0.5, marginBottom: 6 },
  heroCatchyScoreValueRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
  heroCatchyBigPercentageString: { color: '#ffffff', fontSize: 28, fontWeight: '900' },
  heroCatchyVerdictPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  heroCatchyVerdictText: { color: '#ffffff', fontSize: 11, fontWeight: '900', letterSpacing: 0.3 },
  heroCatchyMeterTrack: { height: 8, backgroundColor: '#3b0764', borderRadius: 4, overflow: 'hidden' },
  heroCatchyMeterFill: { height: '100%', borderRadius: 4 },
  heroCatchyMissionTitleHeader: { color: '#ffffff', fontSize: 11, fontWeight: '800', marginBottom: 8 },
  heroCatchyTaskInteractiveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.04)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#3b0764' },
  heroCatchyTaskInteractiveRowChecked: { borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.05)' },
  heroCatchyCheckboxSquare: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: '#a78bfa', alignItems: 'center', justifyContent: 'center' },
  heroCatchyCheckboxSquareChecked: { backgroundColor: '#10b981', borderColor: '#10b981' },
  heroCatchyCheckMarkMarker: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  heroCatchyTaskDescriptionText: { color: '#f3e8ff', fontSize: 12, flex: 1, fontWeight: '700', lineHeight: 17 },
  heroCatchyTaskDescriptionTextStriked: { textDecorationLine: 'line-through', color: '#6b21a8' },
  heroFormScrollOverlayContainer: { padding: 20, justifyContent: 'center', flexGrow: 1, backgroundColor: 'rgba(15,23,42,0.7)' },
  heroFormCardBody: { padding: 20, borderRadius: 16, borderWidth: 1 },
  heroModalTitleHeader: { fontSize: 16, fontWeight: '800', marginBottom: 14, textAlign: 'center' },
  inputFieldLabelLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  heroTextInputBox: { padding: 10, borderRadius: 8, borderWidth: 1, fontSize: 12 },
  smartFocusShortcutActionCardContainer: { backgroundColor: '#2563eb', borderRadius: 14, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  smartFocusLeftContentLayoutColumn: { flex: 1, marginRight: 8 },
  smartFocusHeadingTitle: { color: '#ffffff', fontSize: 14, fontWeight: '800', marginBottom: 4 },
  smartFocusBriefDescriptionParagraph: { color: '#bfdbfe', fontSize: 11, lineHeight: 15, marginBottom: 10 },
  smartFocusActionInlineActionPillBtn: { backgroundColor: '#ffffff', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, alignSelf: 'flex-start' },
  smartFocusActionInlineActionPillBtnText: { color: '#2563eb', fontSize: 11, fontWeight: '700' },
  smartFocusRightGraphicEmojiIcon: { fontSize: 32, opacity: 0.9 },
  accordionHeaderButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 13, borderRadius: 10, borderWidth: 1, marginBottom: 10, marginTop: 4 },
  accordionHeaderLeftWrapper: { flex: 1 },
  accordionTitleText: { fontSize: 13, fontWeight: '700' },
  accordionChevronIcon: { fontSize: 12, fontWeight: '800' },
  accordionContentDropdown: { paddingBottom: 10, paddingTop: 2 },
  multiChipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 4 },
  chipItem: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1' },
  chipItemActive: { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  chipText: { fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#2563eb', fontWeight: '700' },
  constraintsCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 4 },
  innerSectionTitle: { fontSize: 13, fontWeight: '800', marginTop: 12, marginBottom: 8 },
  dividerLineSpacer: { height: 1, backgroundColor: 'rgba(0,0,0,0.06)', marginVertical: 12 },
  subjectAllocationRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.03)' },
  subjectRowNameLabel: { fontSize: 13, fontWeight: '600', flex: 1, marginRight: 8 },
  allocationInputWrapper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allocationFieldInput: { width: 60, height: 38, borderWidth: 1, borderRadius: 6, textAlign: 'center', fontSize: 14, fontWeight: '700' },
  allocationUnitLabel: { fontSize: 12, width: 65 },
  timeAllocationBlockRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 4 },
  liveReadableTimeOutputString: { fontSize: 13, fontWeight: '600', flex: 1 },
  summaryStatusTelemetryBox: { backgroundColor: 'rgba(37,99,235,0.05)', borderRadius: 10, padding: 12, marginTop: 16, borderWidth: 1, borderColor: 'rgba(37,99,235,0.15)' },
  telemetryTitleText: { fontSize: 12, fontWeight: '800', color: '#1e293b', marginBottom: 6 },
  telemetryRowData: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 },
  telemetryLabelText: { fontSize: 12, color: '#475569', fontWeight: '500' },
  telemetryValueText: { fontSize: 12, fontWeight: '800' },
  floatingActionFooterContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  masterLaunchActionBtn: { backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  masterLaunchActionBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  updaterContainerBox: { padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 14 },
  fileSelectButton: { backgroundColor: '#059669', paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  fileSelectButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  modalOverlayBackground: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCardContainer: { width: '100%', maxWidth: 340, borderRadius: 16, borderWidth: 1, padding: 20, alignItems: 'center' },
  modalButtonRowContainer: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 20 },
  modalActionCancel: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  modalActionSave: { flex: 1.5, backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modalSaveText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
});

const pgMapStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.85)',
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    maxHeight: '92%',
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1.5,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#f8fafc',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  qrFrame: {
    width: 252,
    height: 252,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  note: {
    fontSize: 11,
    color: '#fbbf24',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 20,
    fontWeight: '600',
  },
  closeBtn: {
    backgroundColor: '#334155',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  closeBtnText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  breakdownBtn: {
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 18,
  },
  breakdownBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '800',
  },
  breakdownHint: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 15,
    marginTop: 8,
  },
  teacherSection: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    marginTop: 16,
    paddingTop: 16,
  },
  teacherLabel: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  teacherValue: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  teacherInput: {
    borderWidth: 1.5,
    borderColor: '#4f46e5',
    borderRadius: 12,
    backgroundColor: '#0f172a',
    paddingVertical: 13,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 6,
    color: '#f8fafc',
  },
  teacherSaveBtn: {
    flex: 1,
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  teacherSaveText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
  teacherCancelBtn: {
    flex: 1,
    backgroundColor: '#334155',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  teacherCancelText: { color: '#e2e8f0', fontWeight: '800', fontSize: 14 },
  teacherChangeBtn: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  teacherChangeText: { color: '#ffffff', fontWeight: '800', fontSize: 12.5 },
  teacherUnlinkBtn: {
    backgroundColor: 'rgba(220,38,38,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.4)',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  teacherUnlinkText: { color: '#f87171', fontWeight: '800', fontSize: 12.5 },
  encodedStringBox: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 10,
    marginBottom: 16,
  },
  encodedStringLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#475569',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  encodedStringScroll: {
    maxHeight: 52,
    marginBottom: 8,
  },
  encodedStringText: {
    fontSize: 10,
    color: '#38bdf8',
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  copyStringBtn: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#334155',
  },
  copyStringBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
  },
});

const premiumStyles = StyleSheet.create({
  cardCrownBadge: {
    position: 'absolute',
    top: -10,
    right: 12,
    backgroundColor: '#d4af37',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  cardCrownBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#1c1502',
    letterSpacing: 0.5,
  },
});