import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  Linking,
  Animated,
  Dimensions
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { getSubjectsByExamBody, getCustomQuestionSet, getTopicsBySubject } from '../database/queries';
import { getOrCreateDeviceLicense, validateLicenseInFile } from '../services/LicenseService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  registerForPushNotificationsAsync,
  scheduleDailyReminder,
} from '../services/NotificationService';

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
// CORE UNLOCK UTILITY — pure function, no React state involved
// Reads strata from storage, applies unlock, writes back, returns meta
// ─────────────────────────────────────────────────────────────────────────────
export async function applyBundleCompletionToStorage(bundleId, score, examCategory) {
  try {
    const raw = await AsyncStorage.getItem('examStrataMap');
    if (!raw) return null;

    const examStrataMap = JSON.parse(raw);
    const examStrata = examStrataMap[examCategory] || [];

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

    let nextBundleId  = null;
    let nextStrataIdx = -1;

    if (passed) {
      const nextBI = foundBI + 1;
      if (nextBI < cloned[foundSI].bundles.length) {
        cloned[foundSI].bundles[nextBI].isUnlocked = true;
        nextBundleId = cloned[foundSI].bundles[nextBI].id;
      } else {
        const allDone = cloned[foundSI].bundles.every(b => b.isCompleted);
        if (allDone && foundSI + 1 < cloned.length) {
          cloned[foundSI + 1].isUnlocked = true;
          cloned[foundSI + 1].bundles[0].isUnlocked = true;
          nextBundleId  = cloned[foundSI + 1].bundles[0].id;
          nextStrataIdx = foundSI + 1;
        }
      }
    }

    const updated = { ...examStrataMap, [examCategory]: cloned };
    await AsyncStorage.setItem('examStrataMap', JSON.stringify(updated));

    console.log('✅ applyBundleCompletionToStorage done:', {
      bundleId, score, passed, nextBundleId, nextStrataIdx, examCategory,
    });

    return { updatedExamStrataMap: updated, nextBundleId, nextStrataIdx, passed };
  } catch (err) {
    console.error('applyBundleCompletionToStorage error:', err);
    return null;
  }
}

export default function HomeScreen({
  onStartPractice,
  onOpenAnalytics,
  historicalPerformanceData,
  pendingCompletionMeta,
  onCompletionMetaConsumed,
}) {
  const insets = useSafeAreaInsets();
  const [deviceLicenseCode, setDeviceLicenseCode] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [alarmModalVisible, setAlarmModalVisible] = useState(false);
  const [manualHour, setManualHour] = useState('7');
  const [manualMinute, setManualMinute] = useState('00');
  const [timePeriod, setTimePeriod] = useState('PM');
  const [alarmNote, setAlarmNote] = useState('');

  const [heroProfile, setHeroProfile] = useState(null);
  const [heroModalOpen, setHeroModalOpen] = useState(false);
  const [heroExam, setHeroExam] = useState('JAMB');
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

  const [examStrataMap, setExamStrataMap] = useState({ JAMB: [], WAEC: [], NECO: [] });
  const [selectedBundleId, setSelectedBundleId] = useState(null);
  const [activeStrataIndexMap, setActiveStrataIndexMap] = useState({ JAMB: 0, WAEC: 0, NECO: 0 });

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

  const currentLimit = selectedExam === 'JAMB' ? 4 : 5;

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
  // UNIFIED BOOT + COMPLETION EFFECT
  // Replaces both loadAllPersistedData useEffect AND pendingCompletionMeta useEffect.
  // Runs on mount (meta = null → normal load) and when meta arrives (apply unlock).
  // Single read from AsyncStorage, single batch of state updates — no races.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const bootAndApply = async () => {
      try {
        const [strataRaw, indexRaw] = await Promise.all([
          AsyncStorage.getItem('examStrataMap'),
          AsyncStorage.getItem('activeStrataIndexMap'),
        ]);

        const parsedStrata = strataRaw
          ? JSON.parse(strataRaw)
          : { JAMB: [], WAEC: [], NECO: [] };
        const parsedIndex = indexRaw
          ? JSON.parse(indexRaw)
          : { JAMB: 0, WAEC: 0, NECO: 0 };

        if (pendingCompletionMeta) {
          const { nextBundleId, nextStrataIdx, examCategory } = pendingCompletionMeta;

          // Set strata map first — already updated in storage by PracticeScreen
          setExamStrataMap(parsedStrata);

          if (examCategory) {
            setSelectedExam(examCategory);
            if (typeof nextStrataIdx === 'number' && nextStrataIdx >= 0) {
              setActiveStrataIndexMap({ ...parsedIndex, [examCategory]: nextStrataIdx });
            } else {
              setActiveStrataIndexMap(parsedIndex);
            }
          } else {
            setActiveStrataIndexMap(parsedIndex);
          }

          if (nextBundleId) {
            setSelectedBundleId(nextBundleId);
          }

          if (typeof onCompletionMetaConsumed === 'function') {
            onCompletionMetaConsumed();
          }
        } else {
          // Normal boot — load and apply persisted data
          setExamStrataMap(parsedStrata);
          setActiveStrataIndexMap(parsedIndex);
        }
      } catch (err) {
        console.error('bootAndApply error:', err);
      }
    };

    bootAndApply();
    getOrCreateDeviceLicense().then(code => setDeviceLicenseCode(code));

  }, [pendingCompletionMeta]); // runs on mount AND whenever meta changes

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
          Alert.alert('Study Day Missed! 🚨', "You didn't check off yesterday's study goal. Your passing probability dropped.");
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
      setSelectedSubjects(['sub_eng']);
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

  const getActiveStrata = () => allStrataData[activeStrataIndex] || allStrataData[0];

  const getCalculatedTotalQuestions = () => {
    if (Object.keys(customSubjectAllocations).length > 0) {
      return Object.values(customSubjectAllocations).reduce((sum, val) => sum + (parseInt(val, 10) || 0), 0);
    }
    const strata = getActiveStrata();
    if (strata?.bundles) {
      const allSubjects = strata.bundles.flatMap(b => b.subjects || []);
      if (allSubjects.length > 0) {
        const map = {
          'sub_eng': 'english', 'sub_mth': 'math', 'sub_phy': 'physics',
          'sub_chm': 'chemistry', 'sub_bio': 'biology', 'sub_agr': 'agricultural',
          'sub_geo': 'geography', 'sub_eco': 'economics', 'sub_gov': 'government',
          'sub_lit': 'literature', 'sub_crs': 'christian', 'sub_irs': 'islamic',
          'sub_com': 'commerce', 'sub_acc': 'accounting', 'sub_fth': 'further',
        };
        const total = allSubjects.reduce((sum, js) => {
          const norm = js.subjectName.toLowerCase().replace(/\s+/g, '');
          const sel  = selectedSubjects.some(id => norm.includes(map[id] || id));
          return sel ? sum + (js.questions?.length || 0) : sum;
        }, 0);
        if (total > 0) return total;
      }
    }
    return selectedExam === 'JAMB' ? 400 : 500;
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
    const names = strata.bundles.flatMap(b => b.subjects || []).map(s => s.subjectName.toLowerCase().trim());
    return names.length > 0 ? names : null;
  };

  const isSubjectInStrata = (uiSubject, strataNames) => {
    if (!strataNames) return true;
    const name = uiSubject.name.toLowerCase().replace(/\s+/g, '');
    return strataNames.some(n => {
      const norm = n.replace(/\s+/g, '');
      return norm === name || norm.includes(name) || name.includes(norm);
    });
  };

  const handleToggleSubject = (subject) => {
    if (subject.isCompulsory) return;
    const isSelected = selectedSubjects.includes(subject.id);
    if (isSelected) {
      setSelectedSubjects(prev => prev.filter(id => id !== subject.id));
      setCustomSubjectAllocations(prev => { const u = { ...prev }; delete u[subject.id]; return u; });
      return;
    }
    const strataNames = getStrataSubjectNames();
    if (strataNames && !isSubjectInStrata(subject, strataNames)) {
      Alert.alert('❌ Subject Blocked by Strata',
        `"${subject.name}" is not in your uploaded strata file.\n\nAvailable subjects:\n${strataNames.map(n => `• ${n}`).join('\n')}`);
      return;
    }
    if (selectedSubjects.length >= currentLimit) {
      Alert.alert('Limit Enforced', `${selectedExam} constraints restrict combinations to a maximum of ${currentLimit} subjects.`);
      return;
    }
    setSelectedSubjects(prev => [...prev, subject.id]);
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

  const handleSaveAlarmSettings = async () => {
    let hr = parseInt(manualHour, 10), mn = parseInt(manualMinute, 10);
    if (isNaN(hr) || hr < 1 || hr > 12) { Alert.alert('Invalid Input', 'Enter a valid hour between 1 and 12.'); return; }
    if (isNaN(mn) || mn < 0 || mn > 59) { Alert.alert('Invalid Input', 'Enter a valid minute between 00 and 59.'); return; }
    if (timePeriod === 'PM' && hr !== 12) hr += 12;
    if (timePeriod === 'AM' && hr === 12) hr = 0;
    const fmt = mn < 10 ? `0${mn}` : String(mn);
    const ok = await registerForPushNotificationsAsync();
    if (!ok) { Alert.alert('Permission Denied', 'Enable notifications in device settings.'); return; }
    await scheduleDailyReminder(hr, mn, alarmNote || 'Time to study! Open PrepStation and hit your daily goal.');
    setAlarmModalVisible(false);
    Alert.alert('Study Alarm Operational! ⏰', `Daily alarm set for ${manualHour}:${fmt} ${timePeriod}.\n\nNote: "${alarmNote || 'Time to study!'}"`);
  };

  const handleLocalFileUpdatePick = async () => {
    try {
      const fileResult = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });
      if (fileResult.canceled || !fileResult.assets?.length) return;
      setIsProcessingUpdate(true);
      const raw = await (await fetch(fileResult.assets[0].uri)).text();
      const pack = JSON.parse(raw.trim());

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
      if (!pack.structuralStrata) { Alert.alert('Format Mismatch', 'Valid strata signature missing.'); setIsProcessingUpdate(false); return; }

      const incoming = pack.structuralStrata;
      const examCat  = incoming.examCategory;
      if (!examCat) { Alert.alert('❌ Missing Exam Category', 'Add "examCategory": "JAMB", "WAEC", or "NECO".'); setIsProcessingUpdate(false); return; }
      if (!['JAMB', 'WAEC', 'NECO'].includes(examCat)) { Alert.alert('❌ Invalid Exam Category', `"${examCat}" must be JAMB, WAEC, or NECO.`); setIsProcessingUpdate(false); return; }
      if (examCat !== selectedExam) { Alert.alert('⚠️ Wrong Exam File', `This file is for ${examCat} but you are on ${selectedExam}.\n\nSwitch to ${examCat} tab first.`); setIsProcessingUpdate(false); return; }
      if (!incoming.strataId) { Alert.alert('❌ Invalid File', 'Strata file must declare a strataId field.'); setIsProcessingUpdate(false); return; }

      const incomingBundles = incoming.bundles || [];
      const strataIdSet = [...new Set(incomingBundles.map(b => b.strataId || incoming.strataId))];
      if (strataIdSet.length > 1) { Alert.alert('❌ Mixed Strata Rejected', `File contains bundles from ${strataIdSet.length} strata. Each upload must cover ONE strata.`); setIsProcessingUpdate(false); return; }

      const strataNum = parseInt(incoming.strataId.replace(/\D/g, ''), 10) || 1;

      const currentRaw    = await AsyncStorage.getItem('examStrataMap');
      const currentMap    = currentRaw ? JSON.parse(currentRaw) : { JAMB: [], WAEC: [], NECO: [] };
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
      if (incomingBundles.length !== 5) {
        Alert.alert('❌ Incomplete Bundle Set', `Each strata must contain exactly 5 bundles.\n\nThis file has: ${incomingBundles.length}`);
        setIsProcessingUpdate(false); return;
      }

      const existingIdx  = currentStrata.findIndex(s => s.strataId === incoming.strataId);
      const buildBundles = (bundles, existing) => bundles.map((b, i) => ({
        ...b,
        isUnlocked:  i === 0 ? true : (existing?.[i]?.isUnlocked || false),
        isCompleted: existing?.[i]?.isCompleted || false,
        lastScore:   existing?.[i]?.lastScore || null,
      }));

      const newEntry = {
        strataId:     incoming.strataId,
        examCategory: examCat,
        displayName:  incoming.displayName || `STRATA ${strataNum}`,
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
        JAMB: 0, WAEC: 0, NECO: 0,
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
        `${incoming.displayName || incoming.strataId} loaded with ${incomingBundles.length} bundles.\n\nBundle 1 is unlocked. Complete each bundle in sequence.`
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
    if (selectedSubjects.length !== currentLimit) {
      Alert.alert('Selection Match Required', `Please choose exactly ${currentLimit} subjects.`);
      return;
    }

    setLaunchingQuiz(true);
    try {
      const subMap = {
        'sub_eng': 'english', 'sub_mth': 'math', 'sub_phy': 'physics',
        'sub_chm': 'chemistry', 'sub_bio': 'biology', 'sub_agr': 'agricultural',
        'sub_geo': 'geography', 'sub_eco': 'economics', 'sub_gov': 'government',
        'sub_lit': 'literature', 'sub_crs': 'christian', 'sub_irs': 'islamic',
        'sub_com': 'commerce', 'sub_acc': 'accounting', 'sub_fth': 'further',
      };

      const allBundles     = trackingGroup?.bundles || [];
      const targetBundle   = allBundles.find(b => b.id === selectedBundleId) || allBundles[0];
      const bundleSubjects = targetBundle?.subjects || [];

      let combinedQuestionsPool = [];

      if (bundleSubjects.length > 0) {
        bundleSubjects.forEach(js => {
          const norm    = js.subjectName.toLowerCase().replace(/\s+/g, '');
          const isSelec = selectedSubjects.some(id => norm.includes(subMap[id] || id));
          if (isSelec && Array.isArray(js.questions)) {
            const normalized = js.questions.map(q => ({
              id:                  q.id,
              subject_id:          js.subjectName,
              question_text:       q.text,
              option_a:            q.options[0] || '',
              option_b:            q.options[1] || '',
              option_c:            q.options[2] || '',
              option_d:            q.options[3] || '',
              correct_option:      q.answer === q.options[0] ? 'A' : q.answer === q.options[1] ? 'B' : q.answer === q.options[2] ? 'C' : 'D',
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
            .filter(js => {
              const n = js.subjectName.toLowerCase().replace(/\s+/g, '');
              return selectedSubjects.some(id => n.includes(subMap[id] || id));
            })
            .reduce((acc, js) => {
              const start = acc.length === 0 ? 0 : acc[acc.length - 1].endIndex + 1;
              const total = js.questions?.length || 0;
              acc.push({ subjectName: js.subjectName, startIndex: start, endIndex: start + total - 1, totalQuestions: total });
              return acc;
            }, [])
        : [];

      // ── onSessionComplete is NOT set here.
      // App.js injects it via sessionPayload spread in MainNavigationRouter.
      onStartPractice({
        questions:          combinedQuestionsPool,
        mode:               'PROGRESSIVE_STRATA',
        timeAllowed:        duration * 60,
        bundleId:           selectedBundleId,
        requiredScore:      currentBundle?.requiredScore ?? 70,
        isTheoryCompulsory: selectedExam === 'WAEC' || selectedExam === 'NECO',
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

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: t.bg }]}>

      <View style={styles.topToolbarHeader}>
        <View style={styles.headerTextInfoGroup}>
          <Text style={styles.brandTitleText}>PrepStation Pro</Text>
          <Text style={styles.brandSubTitleText}>⚡ PREMIUM EXAM COMPANION • {currentStrataVersion.toUpperCase()}</Text>
        </View>
        <View style={styles.headerRightActionsGroup}>
          <TouchableOpacity style={styles.headerActionButton} onPress={() => setAlarmModalVisible(true)}>
            <Text style={styles.actionButtonEmoji}>🔔</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerActionButton} onPress={() => setIsDarkMode(!isDarkMode)}>
            <Text style={styles.actionButtonEmoji}>{isDarkMode ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerActionButton} onPress={onOpenAnalytics}>
            <Text style={styles.actionButtonEmoji}>📊</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.helpButtonWrapper} onPress={handleOpenWhatsAppSupport} activeOpacity={0.8}>
            <View style={styles.helpIconCircle}><Text style={styles.helpIconEmoji}>📞</Text></View>
            <Text style={styles.helpLabelText}>HELP?</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerAccentBottomIndicatorLine} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollWorkspaceContainer} showsVerticalScrollIndicator={false}>

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

        <Text style={[styles.sectionLabel, { color: t.textSub }]}>1. Select Target Examination</Text>
        <View style={styles.structuralGridRow}>
          {['JAMB', 'WAEC', 'NECO'].map(exam => (
            <TouchableOpacity
              key={exam}
              style={[styles.examSelectionTab, { backgroundColor: t.card, borderColor: t.border }, selectedExam === exam && styles.examSelectionTabActive]}
              onPress={() => {
                setSelectedExam(exam);
                setSelectedSubjects(['sub_eng']);
                const es    = examStrataMap[exam] || [];
                const ai    = activeStrataIndexMap[exam] || 0;
                const first = es[ai]?.bundles?.find(b => b.isUnlocked);
                setSelectedBundleId(first?.id || null);
              }}
            >
              <Text style={[styles.examTabText, { color: isDarkMode ? '#94a3b8' : '#475569' }, selectedExam === exam && styles.examTabTextActive]}>{exam}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { color: t.textSub }]}>2. Choose Your Bundle Here</Text>

        {allStrataData.map((strata, strataIndex) => {
          const strataNum      = parseInt(strata.strataId.replace(/\D/g, ''), 10) || strataIndex + 1;
          const isUnlocked     = strata.isUnlocked;
          const allBundlesDone = strata.bundles.every(b => b.isCompleted);
          return (
            <View key={strata.strataId} style={[styles.constraintsCard, {
              backgroundColor: t.card,
              borderColor: activeStrataIndex === strataIndex ? '#2563eb' : t.border,
              marginBottom: 10,
              opacity: isUnlocked ? 1 : 0.5,
            }]}>
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
                  <Text style={[styles.innerSectionTitle, { color: t.textMain, marginTop: 0, marginBottom: 2 }]}>
                    {isUnlocked ? '' : '🔒 '}{strata.displayName}
                  </Text>
                  <Text style={{ fontSize: 11, color: allBundlesDone ? '#10b981' : t.textSub }}>
                    {allBundlesDone ? '✅ All bundles completed' : `${strata.bundles.filter(b => b.isCompleted).length}/${strata.bundles.length} bundles done`}
                  </Text>
                </View>
                {activeStrataIndex === strataIndex && (
                  <View style={[styles.heroStatusLiveBadge, { backgroundColor: '#dbeafe' }]}>
                    <Text style={{ color: '#1d4ed8', fontSize: 10, fontWeight: '900' }}>ACTIVE</Text>
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
                          { paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.innerPanel, opacity: isLocked ? 0.5 : 1 },
                          isSelected && { borderColor: '#2563eb', borderWidth: 1.5 },
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
                          <Text style={[styles.subjectRowNameLabel, { color: t.textMain }]}>
                            {isLocked ? '🔒 ' : bundle.isCompleted ? '✅ ' : ''}{bundle.name}
                          </Text>
                          <Text style={{ fontSize: 11, color: t.textSub }}>
                            Required pass: {bundle.requiredScore}%
                            {bundle.lastScore != null ? `  •  Last score: ${bundle.lastScore}%` : ''}
                          </Text>
                        </View>
                        <View style={[styles.heroStatusLiveBadge, {
                          backgroundColor: bundle.isCompleted ? '#ccfbf1' : isLocked ? '#fee2e2' : '#fef9c3',
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
              3. Select Group Subjects ({selectedSubjects.length} of {currentLimit} Selected)
            </Text>
          </View>
          <Text style={[styles.accordionChevronIcon, { color: t.textSub }]}>{expandSubjectSelector ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {expandSubjectSelector && (
          <View style={styles.accordionContentDropdown}>
            <View style={styles.multiChipsContainer}>
              {ACADEMIC_SUBJECTS.map(subject => {
                const isSel = selectedSubjects.includes(subject.id);
                return (
                  <TouchableOpacity
                    key={subject.id}
                    activeOpacity={0.7}
                    onPress={() => handleToggleSubject(subject)}
                    style={[
                      styles.chipItem,
                      { backgroundColor: t.card, borderColor: t.border },
                      isSel && styles.chipItemActive,
                      subject.isCompulsory && { borderColor: '#93c5fd', backgroundColor: isDarkMode ? '#1e3a5f' : '#eff6ff' },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: isDarkMode ? '#94a3b8' : '#475569' }, isSel && styles.chipTextActive]}>
                      {subject.isCompulsory ? '🔒 ' : isSel ? '✓ ' : '+ '}{subject.name}
                    </Text>
                    {subject.isCompulsory && <Text style={{ fontSize: 9, color: '#2563eb', fontWeight: '700', marginTop: 2 }}>Compulsory</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.accordionHeaderButton, { backgroundColor: t.accordionBg, borderColor: t.border }]}
          onPress={() => setExpandVolumeSelector(p => !p)}
        >
          <View style={styles.accordionHeaderLeftWrapper}>
            <Text style={[styles.accordionTitleText, { color: t.textMain }]}>4. EXAMINATION TIMING SETUP CORNER</Text>
          </View>
          <Text style={[styles.accordionChevronIcon, { color: t.textSub }]}>{expandVolumeSelector ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {expandVolumeSelector && (
          <View style={styles.accordionContentDropdown}>
            <View style={[styles.constraintsCard, { backgroundColor: t.card, borderColor: t.border }]}>
              <Text style={[styles.innerSectionTitle, { color: t.textMain, marginTop: 0 }]}>📋 Automatic Bundle Structure</Text>
              <Text style={{ fontSize: 12, color: t.textSub, marginBottom: 10 }}>
                {selectedExam === 'JAMB' ? 'JAMB auto-configures 400 MCQ across 4 subjects.' : 'WAEC/NECO auto-configures 500 MCQ across 5 subjects.'}
              </Text>
              <View style={styles.dividerLineSpacer} />
              <Text style={[styles.innerSectionTitle, { color: t.textMain }]}>⏱️ Editable Test Duration Limit</Text>
              <View style={styles.timeAllocationBlockRow}>
                <View style={styles.allocationInputWrapper}>
                  <TextInput
                    style={[styles.allocationFieldInput, { width: 80, backgroundColor: t.innerPanel, color: t.textMain, borderColor: t.border }]}
                    keyboardType="numeric"
                    maxLength={3}
                    value={duration.toString()}
                    onChangeText={handleDurationChangeText}
                  />
                  <Text style={[styles.allocationUnitLabel, { color: t.textSub }]}>Minutes</Text>
                </View>
                <Text style={[styles.liveReadableTimeOutputString, { color: t.textMain }]}>
                  Parsed: <Text style={{ fontWeight: '800', color: '#2563eb' }}>{formatDurationLabel(duration)}</Text>
                </Text>
              </View>
              <View style={styles.summaryStatusTelemetryBox}>
                <Text style={styles.telemetryTitleText}>⚡ Total Configuration Load:</Text>
                <View style={styles.telemetryRowData}>
                  <Text style={styles.telemetryLabelText}>Worksheet Aggregate Size:</Text>
                  <Text style={[styles.telemetryValueText, { color: '#10b981' }]}>{getCalculatedTotalQuestions()} MCQ in TOTAL</Text>
                </View>
                <View style={styles.telemetryRowData}>
                  <Text style={styles.telemetryLabelText}>Post-Exam Sequence:</Text>
                  <Text style={[styles.telemetryValueText, { color: '#2563eb' }]}>
                    {selectedExam === 'WAEC' || selectedExam === 'NECO' ? 'Theory Compulsory' : 'Direct Evaluation'}
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
            <TouchableOpacity style={styles.fileSelectButton} onPress={handleLocalFileUpdatePick} disabled={isProcessingUpdate}>
              <Text style={styles.fileSelectButtonText}>
                {isProcessingUpdate ? 'Verifying License...' : 'Upload Strata Update Matrix (FILE) 📎'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Hero Modal */}
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

      {/* Alarm Modal */}
      <Modal animationType="fade" transparent visible={alarmModalVisible} onRequestClose={() => setAlarmModalVisible(false)}>
        <View style={styles.modalOverlayBackground}>
          <View style={[styles.modalCardContainer, { backgroundColor: t.card, borderColor: t.border }]}>
            <Text style={[styles.alarmModalTitle, { color: t.textMain }]}>⏰ Set Daily Study Alarm</Text>
            <View style={styles.timeInputManualContainerRow}>
              <TextInput style={[styles.manualTimeInputBox, { backgroundColor: t.innerPanel, color: t.textMain, borderColor: t.border }]} value={manualHour} onChangeText={setManualHour} keyboardType="number-pad" maxLength={2} />
              <Text style={[styles.timeSeparatorColon, { color: t.textMain }]}>:</Text>
              <TextInput style={[styles.manualTimeInputBox, { backgroundColor: t.innerPanel, color: t.textMain, borderColor: t.border }]} value={manualMinute} onChangeText={setManualMinute} keyboardType="number-pad" maxLength={2} />
              <View style={styles.periodSwitcherColumn}>
                <TouchableOpacity style={[styles.periodToggleButton, timePeriod === 'AM' && styles.periodToggleButtonActive]} onPress={() => setTimePeriod('AM')}>
                  <Text style={[styles.periodToggleText, timePeriod === 'AM' && styles.periodToggleTextActive]}>AM</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.periodToggleButton, timePeriod === 'PM' && styles.periodToggleButtonActive]} onPress={() => setTimePeriod('PM')}>
                  <Text style={[styles.periodToggleText, timePeriod === 'PM' && styles.periodToggleTextActive]}>PM</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TextInput
              style={{ width: '100%', backgroundColor: t.innerPanel, borderRadius: 8, borderWidth: 1, borderColor: t.border, color: t.textMain, fontSize: 12, padding: 10, marginTop: 14, marginBottom: 4, minHeight: 44 }}
              placeholder="Add a reminder note"
              placeholderTextColor={t.textSub}
              value={alarmNote}
              onChangeText={setAlarmNote}
              multiline
            />
            <View style={styles.modalButtonRowContainer}>
              <TouchableOpacity style={styles.modalActionCancel} onPress={() => setAlarmModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalActionSave} onPress={handleSaveAlarmSettings}>
                <Text style={styles.modalSaveText}>Save Alarm</Text>
              </TouchableOpacity>
            </View>
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
  helpButtonWrapper: { alignItems: 'center', justifyContent: 'center', marginLeft: 2, marginTop: 12 },
  helpIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center', elevation: 4 },
  helpIconEmoji: { fontSize: 16 },
  helpLabelText: { fontSize: 7, fontWeight: '900', color: '#25D366', letterSpacing: 0.5, marginTop: 2 },
  topToolbarHeader: { height: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 8, backgroundColor: '#111827', position: 'relative' },
  headerTextInfoGroup: { justifyContent: 'center', flex: 1, marginRight: 8 },
  brandTitleText: { fontSize: 19, fontWeight: '900', color: '#ffffff', letterSpacing: 0.4 },
  brandSubTitleText: { fontSize: 9, color: '#38bdf8', fontWeight: '800', marginTop: 2, letterSpacing: 0.6 },
  headerRightActionsGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerActionButton: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', justifyContent: 'center' },
  actionButtonEmoji: { fontSize: 15 },
  headerAccentBottomIndicatorLine: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: '#a855f7' },
  scrollWorkspaceContainer: { padding: 16, paddingBottom: 110 },
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
  alarmModalTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  modalButtonRowContainer: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 20 },
  modalActionCancel: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  modalActionSave: { flex: 1.5, backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modalSaveText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  timeInputManualContainerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  manualTimeInputBox: { width: 64, height: 50, borderRadius: 10, borderWidth: 1, textAlign: 'center', fontSize: 20, fontWeight: '800' },
  timeSeparatorColon: { fontSize: 24, fontWeight: '900', paddingHorizontal: 2 },
  periodSwitcherColumn: { gap: 6, marginLeft: 6 },
  periodToggleButton: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.04)', borderWidth: 1, borderColor: 'transparent' },
  periodToggleButtonActive: { backgroundColor: '#2563eb', borderColor: '#1d4ed8' },
  periodToggleText: { fontSize: 11, fontWeight: '800', color: '#64748b' },
  periodToggleTextActive: { color: '#ffffff' },
});