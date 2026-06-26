import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Linking,
  Animated,
  Dimensions
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system'; 
import { getSubjectsByExamBody, getCustomQuestionSet, getTopicsBySubject } from '../database/queries';
import { getOrCreateDeviceLicense, validateLicenseInFile } from '../services/LicenseService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  registerForPushNotificationsAsync, 
  scheduleDailyReminder, 
  scheduleExamCountdown 
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
  const isAnimating = useRef(false);

  const runTicker = (currentIndex) => {
    translateX.setValue(containerWidth);
    isAnimating.current = true;

    Animated.timing(translateX, {
      toValue: 0,
      duration: 900,
      useNativeDriver: true,
    }).start(() => {
      isAnimating.current = false;
    });

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
      <Animated.View
        style={{
          transform: [{ translateX }],
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Text style={{ fontSize: 26 }}>{slide.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{
            fontSize: 13,
            fontWeight: '700',
            color: slide.accentColor,
            letterSpacing: 0.2,
            marginBottom: 3,
          }}>
            {slide.heading}
          </Text>
          <Text style={{
            fontSize: 11,
            fontWeight: '600',
            color: slide.accentColor,
            opacity: 0.75,
            lineHeight: 15,
          }}>
            {slide.sub}
          </Text>
        </View>

        {/* Dot indicators */}
        <View style={{ gap: 4, alignItems: 'center' }}>
          {TICKER_SLIDES.map((_, i) => (
            <View
              key={i}
              style={{
                width: 5,
                height: i === activeIndex ? 14 : 5,
                borderRadius: 3,
                backgroundColor: i === activeIndex ? slide.accentColor : 'rgba(255,255,255,0.2)',
              }}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const STUDY_HUB_DATA = {
  keypoints: [
    { title: "Active Recall", text: "Don't just re-read text. Close your book and write down everything you remember. This builds strong neural connections." },
    { title: "Spaced Repetition", text: "Review difficult subject topics at increasing intervals (1 day, 3 days, 7 days) instead of cramming everything in 24 hours." },
    { title: "The 80/20 Rule", text: "Identify high-yield topics. In exams like JAMB/WAEC, 80% of questions typically come from 20% of core syllabus modules." }
  ],
  equations: [
    { id: "quadratic", name: "Quadratic Formula", isFraction: true, numerator: "-b ± √(b² - 4ac)", denominator: "2a", prefix: "x = " },
    { id: "ap", name: "Arithmetic Progression (n-th term)", isFraction: false, expr: "Tn = a + (n - 1)d" },
    { id: "gp", name: "Geometric Progression (Sum to infinity)", isFraction: true, numerator: "a", denominator: "1 - r", prefix: "S∞ = ", suffix: "  (where |r| < 1)" }
  ],
  tips: [
    { quote: "Consistency beats intensity.", author: "Study Rule" },
    { quote: "Mistakes are proof that you are trying. Use your app analytics screen to attack your weakest subjects directly.", author: "Exam Mentor" }
  ],
  dosAndDonts: {
    dos: ["Read the entire question carefully before looking at any options.", "Keep an eye on the digital screen timer; skip hard questions and come back to them later."],
    donts: ["Do not spend more than 60 seconds on a single question.", "Do not panic if the first 5 questions look unfamiliar."]
  }
};

// --- COMPREHENSIVE NIGERIAN ACADEMIC EXAM REGISTRY ---
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

export default function HomeScreen({ onStartPractice, onOpenAnalytics, historicalPerformanceData }) {
  const insets = useSafeAreaInsets();
  const [deviceLicenseCode, setDeviceLicenseCode] = useState(null);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(true);
  const fadeAnim = useState(new Animated.Value(1))[0];

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

  const [currentStrataVersion, setCurrentStrataVersion] = useState("Strata 1");
  // WITH THIS:
// Per-exam strata storage — each exam keeps its own independent strata list
const [examStrataMap, setExamStrataMap] = useState({
  JAMB: [],
  WAEC: [],
  NECO: [],
});

const [selectedBundleId, setSelectedBundleId] = useState(null);
const [activeStrataIndexMap, setActiveStrataIndexMap] = useState({
  JAMB: 0, WAEC: 0, NECO: 0
});

// Derived helpers — always read from current exam's strata
const allStrataData = examStrataMap[selectedExam] || [];
const activeStrataIndex = activeStrataIndexMap[selectedExam] || 0;

const setAllStrataData = (updaterOrValue) => {
  setExamStrataMap(prev => ({
    ...prev,
    [selectedExam]: typeof updaterOrValue === 'function'
      ? updaterOrValue(prev[selectedExam] || [])
      : updaterOrValue
  }));
};

const setActiveStrataIndex = (idx) => {
  setActiveStrataIndexMap(prev => ({ ...prev, [selectedExam]: idx }));
};

 

  const [duration, setDuration] = useState(180); 

  const [customSubjectAllocations, setCustomSubjectAllocations] = useState({});

  const [activeHubTab, setActiveHubTab] = useState('KEYPOINTS'); 

  const [expandModeSelector, setExpandModeSelector] = useState(false);
  const [expandSubjectSelector, setExpandSubjectSelector] = useState(true); 
  const [expandFiltersSelector, setExpandFiltersSelector] = useState(false);
  const [expandVolumeSelector, setExpandVolumeSelector] = useState(false);
  const [expandUpdaterPanel, setExpandUpdaterPanel] = useState(false); 

  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [launchingQuiz, setLaunchingQuiz] = useState(false);
  const [isProcessingUpdate, setIsProcessingUpdate] = useState(false);

  // Dynamic Exam Parameter Rules Configuration
  const currentLimit = selectedExam === 'JAMB' ? 4 : 5;

  const t = {
    bg: isDarkMode ? '#0f172a' : '#f8fafc',
    card: isDarkMode ? '#1e293b' : '#ffffff',
    textMain: isDarkMode ? '#f8fafc' : '#0f172a',
    textSub: isDarkMode ? '#94a3b8' : '#64748b',
    border: isDarkMode ? '#334155' : '#cbd5e1',
    accordionBg: isDarkMode ? '#1e293b' : '#ffffff',
    innerPanel: isDarkMode ? '#0f172a' : '#f1f5f9'
  };

  useEffect(() => {
    const splashTimer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }).start(() => {
        setShowWelcomeScreen(false);
      });
    }, 3500);

    return () => clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    if (historicalPerformanceData && historicalPerformanceData.length > 0) {
      const sortedHistory = [...historicalPerformanceData].sort((a, b) => a.averageScore - b.averageScore);
      const worstArea = sortedHistory[0];
      if (worstArea) {
        setAnalyticsWeakSpot({
          subjectName: worstArea.subjectName || 'Target Subject',
          score: Math.round(worstArea.averageScore)
        });
      }
    }
  }, [historicalPerformanceData]);
  useEffect(() => {
    getOrCreateDeviceLicense().then(code => {
      setDeviceLicenseCode(code);
    });
  }, []);
  // ── LOAD persisted strata on app start ──
  useEffect(() => {
    const loadPersistedStrata = async () => {
      try {
        const saved = await AsyncStorage.getItem('examStrataMap');
        if (saved) setExamStrataMap(JSON.parse(saved));
      } catch (err) {
        console.error('Failed to load strata:', err);
      }
    };
    loadPersistedStrata();
  }, []);

  // ── SAVE strata whenever it changes ──
  useEffect(() => {
    const saveStrata = async () => {
      try {
        await AsyncStorage.setItem('examStrataMap', JSON.stringify(examStrataMap));
      } catch (err) {
        console.error('Failed to save strata:', err);
      }
    };
    saveStrata();
  }, [examStrataMap]);

  // ── LOAD persisted active strata index on app start ──
  useEffect(() => {
    const loadIndex = async () => {
      try {
        const saved = await AsyncStorage.getItem('activeStrataIndexMap');
        if (saved) setActiveStrataIndexMap(JSON.parse(saved));
      } catch (err) {
        console.error('Failed to load strata index:', err);
      }
    };
    loadIndex();
  }, []);

  // ── SAVE active strata index whenever it changes ──
  useEffect(() => {
    const saveIndex = async () => {
      try {
        await AsyncStorage.setItem('activeStrataIndexMap', JSON.stringify(activeStrataIndexMap));
      } catch (err) {
        console.error('Failed to save strata index:', err);
      }
    };
    saveIndex();
  }, [activeStrataIndexMap]);

  useEffect(() => {
    const handleDailyCycleCheck = () => {
      const todayString = new Date().toDateString();
      if (lastCheckedDate !== todayString) {
        setLastCheckedDate(todayString);
        
        if (!heroDailyTaskDone && heroProfile) {
          setHeroProfile(prev => ({
            ...prev,
            successProbability: Math.max(20, prev.successProbability - 15)
          }));
          
          Alert.alert(
            "Study Day Missed! 🚨", 
            "You didn't check off yesterday's study goal. Your passing probability dropped because consistency is key. Don't skip today's task!"
          );
        } else {
          setHeroDailyTaskDone(false);
        }
      }
    };

    const threadTimer = setInterval(handleDailyCycleCheck, 45000); 
    handleDailyCycleCheck();
    return () => clearInterval(threadTimer);
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
        console.error("Failed to load targets:", err);
      } finally {
        setLoadingSubjects(false);
      }
    }
    loadSubjects();
  }, [selectedExam]);

  useEffect(() => {
    async function aggregateTopics() {
      if (selectedSubjects.length === 0) {
        setAvailableTopics([]);
        setSelectedTopics([]);
        return;
      }
      setLoadingTopics(true);
      try {
        let MasterTopicsList = [];
        for (const subId of selectedSubjects) {
          const subTopics = await getTopicsBySubject(subId);
          MasterTopicsList = [...MasterTopicsList, ...subTopics];
        }
        const uniqueTopics = [...new Set(MasterTopicsList)];
        setAvailableTopics(uniqueTopics);
      } catch (err) {
        console.error("Failed aggregating topics:", err);
      } finally {
        setLoadingTopics(false);
      }
    }
    if (setupMode === 'CUSTOM_DRILL') {
      aggregateTopics();
    }
  }, [selectedSubjects, setupMode]);

  const handleOpenWhatsAppSupport = () => {
    const message = "Hello, I need assistance with the examination platform.";
    const url = `whatsapp://send?phone=+2349135912668&text=${encodeURIComponent(message)}`;
    
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(url);
        } else {
          return Linking.openURL(`https://wa.me/2349135912668?text=${encodeURIComponent(message)}`);
        }
      })
      .catch(() => Alert.alert("Error", "Could not open WhatsApp support channel."));
  };

  const getCalculatedTotalQuestions = () => {
    // Custom override takes priority
    if (Object.keys(customSubjectAllocations).length > 0) {
      return Object.values(customSubjectAllocations).reduce(
        (sum, val) => sum + (parseInt(val, 10) || 0), 0
      );
    }
  
    // Count actual questions from the uploaded JSON across all bundles
    const strata = getActiveStrata();
    if (strata?.bundles) {
      const allSubjects = strata.bundles.flatMap(b => b.subjects || []);
      if (allSubjects.length > 0) {
        // Sum only the selected subjects' question counts
        const subjectIdToNameMap = {
          'sub_eng': 'english', 'sub_mth': 'math', 'sub_phy': 'physics',
          'sub_chm': 'chemistry', 'sub_bio': 'biology', 'sub_agr': 'agricultural',
          'sub_geo': 'geography', 'sub_eco': 'economics', 'sub_gov': 'government',
          'sub_lit': 'literature', 'sub_crs': 'christian', 'sub_irs': 'islamic',
          'sub_com': 'commerce', 'sub_acc': 'accounting', 'sub_fth': 'further',
        };
  
        const total = allSubjects.reduce((sum, jsonSubject) => {
          const normName = jsonSubject.subjectName.toLowerCase().replace(/\s+/g, '');
          const isSelected = selectedSubjects.some(subId => {
            const keyword = subjectIdToNameMap[subId] || String(subId).toLowerCase();
            return normName.includes(keyword);
          });
          return isSelected ? sum + (jsonSubject.questions?.length || 0) : sum;
        }, 0);
  
        if (total > 0) return total;
      }
    }
  
    // Final fallback to exam defaults if no file uploaded yet
    return selectedExam === 'JAMB' ? 400 : 500;
  };

  const formatDurationLabel = (mins) => {
    const totalMins = parseInt(mins, 10) || 0;
    if (totalMins <= 0) return "No time limit";
    if (totalMins === 240) return "4 Hours (Strict Ceiling)";
    
    const hrs = Math.floor(totalMins / 60);
    const remMins = totalMins % 60;
    return hrs > 0 ? `${hrs}h ${remMins}m` : `${remMins} Minutes`;
  };

  const handleCustomSubjectCountChange = (subjectId, value) => {
    const sanitizedValue = value.replace(/[^0-9]/g, '');
    setCustomSubjectAllocations(prev => ({
      ...prev,
      [subjectId]: sanitizedValue
    }));
  };

  // REPLACE getStrataSubjectNames with this:
// ── PROGRESSION HELPERS ──────────────────────────────────────

// Get the currently active strata object
const getActiveStrata = () => allStrataData[activeStrataIndex] || allStrataData[0];

// Get the currently selected bundle across all strata
const getSelectedBundle = () => {
  for (const strata of allStrataData) {
    const found = strata.bundles.find(b => b.id === selectedBundleId);
    if (found) return { bundle: found, strata };
  }
  return null;
};

// Called after a quiz completes — pass in { bundleId, score }
const handleBundleCompletion = (bundleId, score) => {
  setAllStrataData(prev => {
    const updated = prev.map((strata, strataIndex) => {
      const bundleIndex = strata.bundles.findIndex(b => b.id === bundleId);
      if (bundleIndex === -1) return strata;

      const passed = score >= strata.bundles[bundleIndex].requiredScore;
      const newBundles = strata.bundles.map((b, i) => {
        if (i === bundleIndex) return { ...b, isCompleted: passed, lastScore: score };
        // Unlock next bundle in this strata if passed
        if (i === bundleIndex + 1 && passed) return { ...b, isUnlocked: true };
        return b;
      });

      // Check if all bundles in this strata are completed
      const allCompleted = newBundles.every(b => b.isCompleted);

      // If all completed, unlock next strata's first bundle
      let nextStrataCopy = [...prev];
      if (allCompleted && strataIndex + 1 < prev.length) {
        nextStrataCopy = prev.map((s, si) => {
          if (si === strataIndex + 1) {
            return {
              ...s,
              isUnlocked: true,
              bundles: s.bundles.map((b, bi) =>
                bi === 0 ? { ...b, isUnlocked: true } : b
              )
            };
          }
          return s;
        });
      }

      return {
        ...nextStrataCopy[strataIndex],
        bundles: newBundles
      };
    });
    return updated;
  });
};

// Subject gate — only allow subjects present across all bundles of active strata
const getStrataSubjectNames = () => {
  const strata = getActiveStrata();
  if (!strata?.bundles) return null;

  const hasUploadedSubjects = strata.bundles.some(
    b => Array.isArray(b.subjects) && b.subjects.length > 0
  );
  if (!hasUploadedSubjects) return null;

  const subjectNames = strata.bundles
    .flatMap(bundle => bundle.subjects || [])
    .map(s => s.subjectName.toLowerCase().trim());

  return subjectNames.length > 0 ? subjectNames : null;
};

const isSubjectInStrata = (uiSubject, strataNames) => {
  if (!strataNames) return true;
  const name = uiSubject.name.toLowerCase().replace(/\s+/g, '');
  return strataNames.some(strataName => {
    const norm = strataName.replace(/\s+/g, '');
    return norm === name || norm.includes(name) || name.includes(norm);
  });
};

// ─── Step 3: Replaced handleToggleSubject ───
const handleToggleSubject = (subject) => {
  if (subject.isCompulsory) return;

  const isAlreadySelected = selectedSubjects.includes(subject.id);

  if (isAlreadySelected) {
    // Always allow deselection
    setSelectedSubjects(prev => prev.filter(id => id !== subject.id));
    setCustomSubjectAllocations(prev => {
      const updated = { ...prev };
      delete updated[subject.id];
      return updated;
    });
    return;
  }

  // ── GATE 1: Strata subject validation (HARD BLOCK) ──
  const strataNames = getStrataSubjectNames();
  if (strataNames && !isSubjectInStrata(subject, strataNames)) {
    const blockedBundle = (isMegaStrataActive ? megaStrataData : activeStrataData)
    .bundles?.find(b => b.id === selectedBundleId);

  // REPLACE the Alert inside GATE 1:
Alert.alert(
  "❌ Subject Blocked by Strata",
  `"${subject.name}" is not in your uploaded strata file.\n\n` +
  `Available subjects:\n${strataNames.map(n => `• ${n}`).join('\n')}\n\n` +
  `Only these subjects can be selected with your current matrix.`
);
    return; // HARD BLOCK — do not add to selectedSubjects
  }

  // ── GATE 2: Exam subject count limit ──
  if (selectedSubjects.length >= currentLimit) {
    Alert.alert(
      "Limit Enforced",
      `${selectedExam} constraints restrict combinations to a maximum of ${currentLimit} subjects.`
    );
    return;
  }

  setSelectedSubjects(prev => [...prev, subject.id]);
};

  const toggleTopic = (topicName) => {
    if (selectedTopics.includes(topicName)) {
      setSelectedTopics(selectedTopics.filter(t => t !== topicName));
    } else {
      setSelectedTopics([...selectedTopics, topicName]);
    }
  };

  const handleDurationChangeText = (val) => {
    const sanitizedMins = parseInt(val.replace(/[^0-9]/g, ''), 10) || 0;
    if (sanitizedMins > 240) {
      setDuration(240);
      Alert.alert("Ceiling Enforced", "The maximum allowed duration structure is locked at 4 Hours (240 Minutes). It can only be adjusted downwards.");
    } else {
      setDuration(sanitizedMins);
    }
  };

  const handleSmartWeaknessDrill = () => {
    const targetSubjectName = analyticsWeakSpot.score ? analyticsWeakSpot.subjectName : (subjects[0]?.name || '');
    const targetSubjectObj = subjects.find(s => s.name.toLowerCase() === targetSubjectName.toLowerCase()) || subjects[0];

    if (!targetSubjectObj) {
      Alert.alert("Engine Offline", "Please select an exam first to sync parameters.");
      return;
    }

    setSelectedSubjects([targetSubjectObj.id]);
    setSetupMode('STANDARD');
    setDuration(15);
    setCustomSubjectAllocations({});
    Alert.alert(
      "Smart Focus Locked 🎯",
      `We found optimization gaps in "${targetSubjectObj.name}". We've loaded your selected Strata targeting matrix over this scope.`
    );
  };

  const handleGenerateHeroPlan = () => {
    if (!heroWeakSubjects || !heroWeakTopics) {
      Alert.alert("Data Incomplete", "Please specify your weak items to help us map your strategy trajectory.");
      return;
    }

    let baselineScore = 45;
    if (heroPastScore && !heroPastScore.toLowerCase().includes('fail')) baselineScore += 15;
    if (heroChallenges.length > 30) baselineScore -= 10;

    setHeroProfile({
      exam: heroExam,
      date: heroDate,
      weakSubjects: heroWeakSubjects,
      weakTopics: heroWeakTopics,
      challenges: heroChallenges,
      successProbability: Math.min(96, Math.max(25, baselineScore)),
      dailyObjective: `Master structural questions in ${heroWeakSubjects.split(',')[0]} targeting ${heroWeakTopics.split(',')[0]}.`
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
    const isDoneNow = !heroDailyTaskDone;
    setHeroDailyTaskDone(isDoneNow);
    
    setHeroProfile(prev => ({
      ...prev,
      successProbability: isDoneNow 
        ? Math.min(99, prev.successProbability + 15) 
        : Math.max(25, prev.successProbability - 15)
    }));
  };

  const handleSaveAlarmSettings = async () => {
    let hr = parseInt(manualHour, 10);
    let mn = parseInt(manualMinute, 10);

    if (isNaN(hr) || hr < 1 || hr > 12) {
      Alert.alert("Invalid Input", "Please enter a valid hour between 1 and 12.");
      return;
    }
    if (isNaN(mn) || mn < 0 || mn > 59) {
      Alert.alert("Invalid Input", "Please enter a valid minute between 00 and 59.");
      return;
    }

    if (timePeriod === 'PM' && hr !== 12) hr += 12;
    if (timePeriod === 'AM' && hr === 12) hr = 0;

    const formattedMinuteString = mn < 10 ? `0${mn}` : `${mn}`;

    const permissionGranted = await registerForPushNotificationsAsync();
if (!permissionGranted) {
  Alert.alert(
    "Permission Denied",
    "Please enable notifications for this app in your device settings to use the study alarm."
  );
  return;
}
await scheduleDailyReminder(hr, mn, alarmNote || 'Time to study! Open PrepStation and hit your daily goal.');
setAlarmModalVisible(false);
Alert.alert(
  "Study Alarm Operational! ⏰",
  `Daily alarm set for ${manualHour}:${formattedMinuteString} ${timePeriod}.\n\nNote: "${alarmNote || 'Time to study!'}"`
);
  };

  const handleLocalFileUpdatePick = async () => {
    try {
      const fileResult = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', 'application/octet-stream'],
        copyToCacheDirectory: true
      });
      if (fileResult.canceled || !fileResult.assets || fileResult.assets.length === 0) return;
  
      setIsProcessingUpdate(true);
      const pickedFile = fileResult.assets[0];
      const rawFileContents = await (await fetch(pickedFile.uri)).text();
      const updateDataPack = JSON.parse(rawFileContents.trim());
  
      // ── GATE 1: Device License ──
      const licenseCheck = await validateLicenseInFile(updateDataPack);
      if (!licenseCheck.valid) {
        let userMessage = '';
        if (licenseCheck.reason === 'NO_LICENSE_IN_FILE') {
          userMessage = `This file has no device license.\n\nYour device code:\n🔑 ${deviceLicenseCode}`;
        } else if (licenseCheck.reason === 'MISMATCH') {
          userMessage = `File locked to a different device.\n\nFile code: ${licenseCheck.fileCode}\nThis device: ${deviceLicenseCode}`;
        } else {
          userMessage = 'License verification failed.';
        }
        Alert.alert('🔒 Device License Mismatch', userMessage);
        setIsProcessingUpdate(false);
        return;
      }
  
      // ── GATE 2: Must have structuralStrata ──
      if (!updateDataPack.structuralStrata) {
        Alert.alert('Format Mismatch', 'Valid strata signature missing from file.');
        setIsProcessingUpdate(false);
        return;
      }
  
      const incoming = updateDataPack.structuralStrata;

      // ── GATE 2.5: Exam category validation ──
const fileExamCategory = incoming.examCategory;
if (!fileExamCategory) {
  Alert.alert(
    '❌ Missing Exam Category',
    'This strata file does not declare an examCategory.\n\nAdd "examCategory": "JAMB", "WAEC", or "NECO" to the structuralStrata object.'
  );
  setIsProcessingUpdate(false);
  return;
}

if (!['JAMB', 'WAEC', 'NECO'].includes(fileExamCategory)) {
  Alert.alert(
    '❌ Invalid Exam Category',
    `"${fileExamCategory}" is not a valid exam category.\n\nMust be one of: JAMB, WAEC, NECO.`
  );
  setIsProcessingUpdate(false);
  return;
}

if (fileExamCategory !== selectedExam) {
  Alert.alert(
    '⚠️ Wrong Exam File',
    `This file is for ${fileExamCategory} but you are currently on ${selectedExam}.\n\nPlease switch to the ${fileExamCategory} tab first, then upload this file.`
  );
  setIsProcessingUpdate(false);
  return;
}
  
      // ── GATE 3: Validate incoming strata has exactly ONE strataId ──
      if (!incoming.strataId) {
        Alert.alert('❌ Invalid File', 'Strata file must declare a strataId field.');
        setIsProcessingUpdate(false);
        return;
      }
  
      // ── GATE 4: All bundles must belong to the same strata ──
      // (Prevent mixed-strata uploads — each file covers ONE full strata)
      const incomingStrataBundles = incoming.bundles || [];
      const bundleStrataIds = incomingStrataBundles.map(b => b.strataId || incoming.strataId);
      const uniqueStrataIds = [...new Set(bundleStrataIds)];
      if (uniqueStrataIds.length > 1) {
        Alert.alert(
          '❌ Mixed Strata Rejected',
          `This file contains bundles from ${uniqueStrataIds.length} different strata.\n\nEach upload must contain all bundles for ONE strata only.\n\nDetected: ${uniqueStrataIds.join(', ')}`
        );
        setIsProcessingUpdate(false);
        return;
      }
  
      // ── GATE 5: Strata sequence enforcement ──
      // Cannot upload Strata N+2 if Strata N+1 hasn't been completed
      const incomingStrataId = incoming.strataId;
      const incomingStrataNumber = parseInt(incomingStrataId.replace(/\D/g, ''), 10) || 1;
  
     // Check sequence against THIS exam's existing strata only
     const currentExamStrata = examStrataMap[fileExamCategory] || [];
     const existingStrataNumbers = currentExamStrata.map(s =>
       parseInt(s.strataId.replace(/\D/g, ''), 10) || 1
     );
     const highestCompletedStrataNumber = currentExamStrata.reduce((max, s) => {
       const num = parseInt(s.strataId.replace(/\D/g, ''), 10) || 1;
       const allDone = s.bundles.every(b => b.isCompleted);
       return allDone ? Math.max(max, num) : max;
     }, 0);
     const maxExistingStrataNumber = existingStrataNumbers.length > 0
       ? Math.max(...existingStrataNumbers)
       : 0;
      
  
      // Allow: same strata (update), next strata (progression), or strata 1 (fresh)
      const isUpdate = existingStrataNumbers.includes(incomingStrataNumber);
      const isNextInSequence = incomingStrataNumber === maxExistingStrataNumber + 1;
      const isFirstStrata = incomingStrataNumber === 1;
  
      if (!isUpdate && !isNextInSequence && !isFirstStrata) {
        Alert.alert(
          '❌ Strata Sequence Violation',
          `You are trying to install ${incoming.displayName || incomingStrataId}.\n\n` +
          `You must complete Strata ${incomingStrataNumber - 1} fully before unlocking this tier.\n\n` +
          `Currently on: Strata ${maxExistingStrataNumber}`
        );
        setIsProcessingUpdate(false);
        return;
      }
  
      // ── GATE 6: Bundle count enforcement (must upload ALL bundles for that strata) ──
      const expectedBundleCount = 5; // hardcoded hierarchy: always 5 bundles per strata
      if (incomingStrataBundles.length !== expectedBundleCount) {
        Alert.alert(
          '❌ Incomplete Bundle Set',
          `Each strata upload must contain exactly ${expectedBundleCount} bundles.\n\n` +
          `This file contains: ${incomingStrataBundles.length} bundle(s).\n\n` +
          `Upload the complete set for ${incoming.displayName || incomingStrataId}.`
        );
        setIsProcessingUpdate(false);
        return;
      }
  
      // ── ALL GATES PASSED: Merge or add strata ──
  // ── ALL GATES PASSED: Merge or add strata into the correct exam slot ──
setExamStrataMap(prev => {
  const currentExamStrata = prev[fileExamCategory] || [];
  const existingIndex = currentExamStrata.findIndex(s => s.strataId === incomingStrataId);

  const buildBundles = (incomingBundles, existingBundles) => {
    return incomingBundles.map((b, i) => {
      const existingBundle = existingBundles?.[i];
      return {
        ...b,
        isUnlocked: i === 0 ? true : (existingBundle?.isUnlocked || false),
        isCompleted: existingBundle?.isCompleted || false,
        lastScore: existingBundle?.lastScore || null,
      };
    });
  };

  const newStrataEntry = {
    strataId: incomingStrataId,
    examCategory: fileExamCategory,
    displayName: incoming.displayName || `STRATA ${incomingStrataNumber}`,
    isUnlocked: incomingStrataNumber === 1 || currentExamStrata.some(
      s => parseInt(s.strataId.replace(/\D/g, ''), 10) === incomingStrataNumber - 1 &&
           s.bundles.every(b => b.isCompleted)
    ),
    bundles: buildBundles(
      incomingStrataBundles,
      existingIndex >= 0 ? currentExamStrata[existingIndex].bundles : []
    )
  };

  let updatedExamStrata;
  if (existingIndex >= 0) {
    updatedExamStrata = [...currentExamStrata];
    updatedExamStrata[existingIndex] = newStrataEntry;
  } else {
    updatedExamStrata = [...currentExamStrata, newStrataEntry].sort((a, b) => {
      const numA = parseInt(a.strataId.replace(/\D/g, ''), 10) || 1;
      const numB = parseInt(b.strataId.replace(/\D/g, ''), 10) || 1;
      return numA - numB;
    });
  }

  return { ...prev, [fileExamCategory]: updatedExamStrata };
});

setCurrentStrataVersion(incoming.displayName || `Strata ${incomingStrataNumber}`);
setSelectedBundleId(incomingStrataBundles[0]?.id || null);
setActiveStrataIndexMap(prev => ({ ...prev, [fileExamCategory]: incomingStrataNumber - 1 }));

Alert.alert(
  `✅ ${fileExamCategory} Strata Installed`,
  `${incoming.displayName || incomingStrataId} (${fileExamCategory}) with ${incomingStrataBundles.length} bundles has been loaded.\n\nBundle 1 is unlocked. Complete each bundle in sequence to progress.`
);
  
      setIsProcessingUpdate(false);
    } catch (err) {
      console.error(err);
      Alert.alert('Import Failure', `Failed parsing configuration pack: ${err.message}`);
      setIsProcessingUpdate(false);
    }
  };

  const handleLaunchExaminationSuite = async () => {
    const trackingGroup = getActiveStrata();
    const currentBundle = trackingGroup?.bundles?.find(b => b.id === selectedBundleId);
  
    if (currentBundle && !currentBundle.isUnlocked) {
      Alert.alert(
        "Progression Lock Guard",
        `You must secure the barest minimum of ${currentBundle.requiredScore}% on earlier bundles within this sequence to unlock this level.`
      );
      return;
    }
  
    const standardTargetLimit = selectedExam === 'JAMB' ? 4 : 5;
    if (selectedSubjects.length !== standardTargetLimit) {
      Alert.alert(
        "Selection Match Required",
        `Please choose exactly ${standardTargetLimit} subjects to build this unified operational bundle.`
      );
      return;
    }
  
    setLaunchingQuiz(true);
    try {
      let combinedQuestionsPool = [];
  
      // STRATAGEM 1: Uploaded JSON file in memory
     // STRATAGEM 1: Uploaded JSON file in memory
     const allBundles = trackingGroup?.bundles || [];
     const targetBundle = allBundles.find(b => b.id === selectedBundleId) || allBundles[0];
     const allSubjectsAcrossBundles = targetBundle?.subjects || [];
  
      if (allSubjectsAcrossBundles.length > 0) {
        console.log("Uploaded matrix payload detected in state memory. Extracting...");
  
        const subjectIdToNameMap = {
          'sub_eng': 'english',
          'sub_mth': 'math',
          'sub_phy': 'physics',
          'sub_chm': 'chemistry',
          'sub_bio': 'biology',
          'sub_agr': 'agricultural',
          'sub_geo': 'geography',
          'sub_eco': 'economics',
          'sub_gov': 'government',
          'sub_lit': 'literature',
          'sub_crs': 'christian',
          'sub_irs': 'islamic',
          'sub_com': 'commerce',
          'sub_acc': 'accounting',
          'sub_fth': 'further',
        };
  
        allSubjectsAcrossBundles.forEach(jsonSubject => {
          const normJsonName = jsonSubject.subjectName.toLowerCase().replace(/\s+/g, '');
  
          const isSelected = selectedSubjects.some(subId => {
            const expectedNameKeyword = subjectIdToNameMap[subId] || String(subId).toLowerCase();
            return normJsonName.includes(expectedNameKeyword);
          });
  
          if (isSelected && Array.isArray(jsonSubject.questions)) {
            console.log(`Successfully mapped matrix questions for: ${jsonSubject.subjectName}`);
  
            const normalized = jsonSubject.questions.map(q => ({
              id: q.id,
              subject_id: jsonSubject.subjectName,
              question_text: q.text,
              option_a: q.options[0] || '',
              option_b: q.options[1] || '',
              option_c: q.options[2] || '',
              option_d: q.options[3] || '',
              correct_option: q.answer === q.options[0] ? 'A' :
                              q.answer === q.options[1] ? 'B' :
                              q.answer === q.options[2] ? 'C' : 'D',
              explanation: q.explanation || ''
            }));
            combinedQuestionsPool = [...combinedQuestionsPool, ...normalized];
          }
        });
      }
  
      // STRATAGEM 2: Database fallback
      if (combinedQuestionsPool.length === 0) {
        console.log("No uploaded file matching this criteria. Querying local SQLite records...");
        const globalCalculatedQuestions = getCalculatedTotalQuestions();
        const quotaPerSubject = Math.floor(globalCalculatedQuestions / selectedSubjects.length);
  
        for (const subId of selectedSubjects) {
          let perSubjectLimit = quotaPerSubject;
          if (customSubjectAllocations[subId] !== undefined) {
            perSubjectLimit = parseInt(customSubjectAllocations[subId], 10) || 0;
          }
  
          if (perSubjectLimit > 0) {
            const queryConfig = { subjectId: subId, limit: perSubjectLimit, mode: 'STRATA_RUN' };
            const questionsList = await getCustomQuestionSet(queryConfig);
            if (questionsList && questionsList.length > 0) {
              combinedQuestionsPool = [...combinedQuestionsPool, ...questionsList];
            }
          }
        }
      }
  
      if (combinedQuestionsPool.length === 0) {
        Alert.alert("Data Matrix Empty", "No questions found in memory or database matching selection layout keys.");
        setLaunchingQuiz(false);
        return;
      }
  
      const includeTheorySequence = (selectedExam === 'WAEC' || selectedExam === 'NECO');
  
      const subjectIdToNameMap = {
        'sub_eng': 'english',
        'sub_mth': 'math',
        'sub_phy': 'physics',
        'sub_chm': 'chemistry',
        'sub_bio': 'biology',
        'sub_agr': 'agricultural',
        'sub_geo': 'geography',
        'sub_eco': 'economics',
        'sub_gov': 'government',
        'sub_lit': 'literature',
        'sub_crs': 'christian',
        'sub_irs': 'islamic',
        'sub_com': 'commerce',
        'sub_acc': 'accounting',
        'sub_fth': 'further',
      };
  
      // Build partitions from the SELECTED bundle only, not all bundles
const selectedBundleSubjects = (() => {
  const activeBundles = trackingGroup?.bundles || [];
  const targetBundle = activeBundles.find(b => b.id === selectedBundleId) 
    || activeBundles[0];
  return targetBundle?.subjects || [];
})();

const subjectPartitions = selectedBundleSubjects.length > 0
  ? selectedBundleSubjects
      .filter(jsonSubject => {
        const normJsonName = jsonSubject.subjectName.toLowerCase().replace(/\s+/g, '');
        return selectedSubjects.some(subId => {
          const keyword = subjectIdToNameMap[subId] || String(subId).toLowerCase();
          return normJsonName.includes(keyword);
        });
      })
      .reduce((acc, jsonSubject) => {
        const startIndex = acc.length === 0 ? 0 : acc[acc.length - 1].endIndex + 1;
        const totalQuestions = jsonSubject.questions?.length || 0;
        acc.push({
          subjectName: jsonSubject.subjectName,
          startIndex,
          endIndex: startIndex + totalQuestions - 1,
          totalQuestions
        });
        return acc;
      }, [])
  : [];
  
      onStartPractice({
        questions: combinedQuestionsPool,
        mode: 'PROGRESSIVE_STRATA',
        timeAllowed: duration * 60,
        bundleId: selectedBundleId,
        isTheoryCompulsory: includeTheorySequence,
        subjectMeta: {
          name: `${currentBundle?.name || 'Bundle Track'} Run`,
          exam_body: selectedExam
        },
        subjectPartitions
      });
  
    } catch (err) {
      console.error("Critical Suite Failure: ", err);
      Alert.alert("Error", "Could not safely assemble testing parameters.");
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
          <TouchableOpacity
  style={styles.helpButtonWrapper}
  onPress={handleOpenWhatsAppSupport}
  activeOpacity={0.8}
>
  <View style={styles.helpIconCircle}>
    {/* WhatsApp-style green phone icon */}
    <Text style={styles.helpIconEmoji}>📞</Text>
  </View>
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
                  backgroundColor: getHeroStatusCommentary(heroProfile.successProbability).color 
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
  onPress={() => Linking.openURL('https://community.dmsgroups.ng')}
>
  <View style={styles.smartFocusLeftContentLayoutColumn}>
  <Text style={[styles.smartFocusHeadingTitle, { color: '#6ee7b7' }]}>
      🌍 PrepStation Community
    </Text>
    <Text style={[styles.smartFocusBriefDescriptionParagraph, { color: '#ddd6fe' }]}>
      Get correct answers, step-by-step explanations, and connect with top students and tutors. Your results make more sense here.
    </Text>
    <View style={[styles.smartFocusActionInlineActionPillBtn, { backgroundColor: '#10b981' }]}>
    <Text style={[styles.smartFocusActionInlineActionPillBtnText, { color: '#022c22' }]}>
        Join the Community →
      </Text>
    </View>
  </View>
  <Text style={styles.smartFocusRightGraphicEmojiIcon}>🔗</Text>
</TouchableOpacity>

        <Text style={[styles.sectionLabel, { color: t.textSub }]}>1. Select Target Examination</Text>
        <View style={styles.structuralGridRow}>
          {['JAMB', 'WAEC', 'NECO'].map((exam) => (
            <TouchableOpacity
              key={exam}
              style={[styles.examSelectionTab, { backgroundColor: t.card, borderColor: t.border }, selectedExam === exam && styles.examSelectionTabActive]}
              onPress={() => {
                setSelectedExam(exam);
                setSelectedSubjects(['sub_eng']);
                // Restore the last selected bundle for this exam, or pick first available
                const examStrata = examStrataMap[exam] || [];
                const activeIdx = activeStrataIndexMap[exam] || 0;
                const activeStrata = examStrata[activeIdx];
                const firstUnlocked = activeStrata?.bundles?.find(b => b.isUnlocked);
                setSelectedBundleId(firstUnlocked?.id || null);
              }}
            >
              <Text style={[styles.examTabText, { color: isDarkMode ? '#94a3b8' : '#475569' }, selectedExam === exam && styles.examTabTextActive]}>{exam}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { color: t.textSub }]}>2. Select Target Progress Strata Bundle</Text>

{allStrataData.map((strata, strataIndex) => {
  const strataNumber = parseInt(strata.strataId.replace(/\D/g, ''), 10) || strataIndex + 1;
  const isStrataUnlocked = strata.isUnlocked;
  const allBundlesDone = strata.bundles.every(b => b.isCompleted);

  return (
    <View key={strata.strataId} style={[styles.constraintsCard, {
      backgroundColor: t.card,
      borderColor: activeStrataIndex === strataIndex ? '#2563eb' : t.border,
      marginBottom: 10,
      opacity: isStrataUnlocked ? 1 : 0.5
    }]}>
      {/* Strata Header */}
      <TouchableOpacity
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        onPress={() => {
          if (!isStrataUnlocked) {
            Alert.alert('🔒 Strata Locked', `Complete all bundles in Strata ${strataNumber - 1} to unlock this tier.`);
            return;
          }
          setActiveStrataIndex(strataIndex);
          const firstUnlocked = strata.bundles.find(b => b.isUnlocked);
          if (firstUnlocked) setSelectedBundleId(firstUnlocked.id);
        }}
      >
        <View>
          <Text style={[styles.innerSectionTitle, { color: t.textMain, marginTop: 0, marginBottom: 2 }]}>
            {isStrataUnlocked ? '' : '🔒 '}{strata.displayName}
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

      {/* Bundle List — only show for active strata */}
      {activeStrataIndex === strataIndex && (
        <View style={{ gap: 8, marginTop: 10 }}>
          {strata.bundles.map((bundle, bundleIndex) => {
            const isSelected = selectedBundleId === bundle.id;
            const prevBundle = bundleIndex > 0 ? strata.bundles[bundleIndex - 1] : null;
            const isLocked = !bundle.isUnlocked;

            return (
              <TouchableOpacity
                key={bundle.id}
                style={[
                  styles.subjectAllocationRow,
                  {
                    paddingHorizontal: 10,
                    borderRadius: 8,
                    backgroundColor: t.innerPanel,
                    opacity: isLocked ? 0.5 : 1
                  },
                  isSelected && { borderColor: '#2563eb', borderWidth: 1.5 }
                ]}
                onPress={() => {
                  if (isLocked) {
                    Alert.alert(
                      '🔒 Bundle Locked',
                      `You must score at least ${prevBundle?.requiredScore ?? '—'}% on ${prevBundle?.name ?? 'the previous bundle'} before accessing ${bundle.name}.\n\n` +
                      `${prevBundle?.lastScore != null ? `Your last score on ${prevBundle.name}: ${prevBundle.lastScore}%` : 'You have not attempted the previous bundle yet.'}`
                    );
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
                  backgroundColor: bundle.isCompleted ? '#ccfbf1' : isLocked ? '#fee2e2' : '#fef9c3'
                }]}>
                  <Text style={{
                    fontSize: 10,
                    fontWeight: '900',
                    color: bundle.isCompleted ? '#0f766e' : isLocked ? '#991b1b' : '#92400e'
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

        {/* 3. Pick Subjects — REPLACED WITH NEW SUBJECT GRID */}
        <TouchableOpacity style={[styles.accordionHeaderButton, { backgroundColor: t.accordionBg, borderColor: t.border }]} onPress={() => setExpandSubjectSelector(!expandSubjectSelector)}>
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
              {ACADEMIC_SUBJECTS.map((subject) => {
                const isSelected = selectedSubjects.includes(subject.id);
                return (
                  <TouchableOpacity
                    key={subject.id}
                    activeOpacity={0.7}
                    onPress={() => handleToggleSubject(subject)}
                    style={[
                      styles.chipItem,
                      { backgroundColor: t.card, borderColor: t.border },
                      isSelected && styles.chipItemActive,
                      subject.isCompulsory && { borderColor: '#93c5fd', backgroundColor: isDarkMode ? '#1e3a5f' : '#eff6ff' }
                    ]}
                  >
                    <Text style={[styles.chipText, { color: isDarkMode ? '#94a3b8' : '#475569' }, isSelected && styles.chipTextActive]}>
                      {subject.isCompulsory ? '🔒 ' : isSelected ? '✓ ' : '+ '}{subject.name}
                    </Text>
                    {subject.isCompulsory && (
                      <Text style={{ fontSize: 9, color: '#2563eb', fontWeight: '700', marginTop: 2 }}>Compulsory</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* 4. Worksheet Volume & Duration */}
        <TouchableOpacity style={[styles.accordionHeaderButton, { backgroundColor: t.accordionBg, borderColor: t.border }]} onPress={() => setExpandVolumeSelector(!expandVolumeSelector)}>
          <View style={styles.accordionHeaderLeftWrapper}>
            <Text style={[styles.accordionTitleText, { color: t.textMain }]}>4. Volume Strategy & Duration Constraints</Text>
          </View>
          <Text style={[styles.accordionChevronIcon, { color: t.textSub }]}>{expandVolumeSelector ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {expandVolumeSelector && (
          <View style={styles.accordionContentDropdown}>
            <View style={[styles.constraintsCard, { backgroundColor: t.card, borderColor: t.border }]}>
              
              <Text style={[styles.innerSectionTitle, { color: t.textMain, marginTop: 0 }]}>📋 Automatic Bundle Structure</Text>
              <Text style={{ fontSize: 12, color: t.textSub, marginBottom: 10 }}>
                {selectedExam === 'JAMB' 
                  ? "JAMB specific mode auto-configures a balanced 400 MCQ matrix mapped evenly across 4 core subjects." 
                  : "WAEC and NECO formats map questions into a target 500 MCQ structural framework split across 5 subjects."}
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
                  <Text style={[styles.telemetryValueText, { color: '#10b981' }]}>
                    {getCalculatedTotalQuestions()} MCQ in TOTAL
                  </Text>
                </View>
                <View style={styles.telemetryRowData}>
                  <Text style={styles.telemetryLabelText}>Post-Exam Sequence:</Text>
                  <Text style={[styles.telemetryValueText, { color: '#2563eb' }]}>
                    {(selectedExam === 'WAEC' || selectedExam === 'NECO') ? "Theory Compulsory" : "Direct Evaluation"}
                  </Text>
                </View>
              </View>

            </View>
          </View>
        )}

        <TouchableOpacity style={[styles.accordionHeaderButton, { borderColor: '#10b981', backgroundColor: isDarkMode ? '#064e3b' : '#f0fdf4' }]} onPress={() => setExpandUpdaterPanel(!expandUpdaterPanel)}>
          <Text style={[styles.accordionTitleText, { color: isDarkMode ? '#f8fafc' : '#047857' }]}>📂 Strata & Architecture Update Sync</Text>
          <Text style={{ color: isDarkMode ? '#f8fafc' : '#047857' }}>{expandUpdaterPanel ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {expandUpdaterPanel && (
  <View style={[styles.updaterContainerBox, { backgroundColor: t.card, borderColor: t.border }]}>
    
    {/* DEVICE LICENSE DISPLAY */}
    <View style={{
      backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9',
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1.5,
      borderColor: '#2563eb',
      alignItems: 'center'
    }}>
      <Text style={{ fontSize: 10, fontWeight: '800', color: '#2563eb', letterSpacing: 1, marginBottom: 4 }}>
        🔑 THIS DEVICE'S LICENSE CODE
      </Text>
      <Text style={{
        fontSize: 28,
        fontWeight: '900',
        color: t.textMain,
        letterSpacing: 6,
      }}>
        {deviceLicenseCode ?? '------'}
      </Text>
      <Text style={{ fontSize: 10, color: t.textSub, marginTop: 4, textAlign: 'center' }}>
        Share this code with your administrator to generate a strata file locked to this device.
        This code changes if the app is uninstalled and reinstalled.
      </Text>
    </View>

    <Text style={{ fontSize: 11, color: t.textSub, marginBottom: 8 }}>
      Uploading a structural matrix file drops outdated tiers immediately. The file must be generated for this specific device code.
    </Text>
    <TouchableOpacity
      style={styles.fileSelectButton}
      onPress={handleLocalFileUpdatePick}
      disabled={isProcessingUpdate}
    >
      <Text style={styles.fileSelectButtonText}>
        {isProcessingUpdate ? 'Verifying License...' : 'Upload Strata Update Matrix (FILE) 📎'}
      </Text>
    </TouchableOpacity>
  </View>
)}
      </ScrollView>

      <Modal animationType="slide" transparent={true} visible={heroModalOpen} onRequestClose={() => setHeroModalOpen(false)}>
        <ScrollView contentContainerStyle={styles.heroFormScrollOverlayContainer}>
          <View style={[styles.heroFormCardBody, { backgroundColor: t.card, borderColor: t.border }]}>
            <Text style={[styles.heroModalTitleHeader, { color: t.textMain }]}>🛡️ Build Your Hero Blueprint</Text>
            
            <Text style={[styles.inputFieldLabelLabel, { color: t.textMain }]}>Target Examination to Write:</Text>
            <View style={styles.structuralGridRow}>
              {['JAMB', 'WAEC', 'NECO'].map((exam) => (
                <TouchableOpacity key={exam} style={[styles.examSelectionTab, { backgroundColor: t.innerPanel, borderColor: t.border }, heroExam === exam && styles.examSelectionTabActive]} onPress={() => setHeroExam(exam)}>
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

            <Text style={[styles.inputFieldLabelLabel, { color: t.textMain }]}>Past Score (If rewriting or mock metrics):</Text>
            <TextInput style={[styles.heroTextInputBox, { backgroundColor: t.innerPanel, color: t.textMain, borderColor: t.border }]} placeholder="e.g. 180 last year" placeholderTextColor={t.textSub} value={heroPastScore} onChangeText={setHeroPastScore} />

            <Text style={[styles.inputFieldLabelLabel, { color: t.textMain }]}>Your Core Study Challenges:</Text>
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

      <Modal animationType="fade" transparent={true} visible={alarmModalVisible} onRequestClose={() => setAlarmModalVisible(false)}>
        <View style={styles.modalOverlayBackground}>
          <View style={[styles.modalCardContainer, { backgroundColor: t.card, borderColor: t.border }]}>
            <Text style={[styles.alarmModalTitle, { color: t.textMain }]}>⏰ Set Daily Study Alarm</Text>
            
            <View style={styles.timeInputManualContainerRow}>
              <TextInput 
                style={[styles.manualTimeInputBox, { backgroundColor: t.innerPanel, color: t.textMain, borderColor: t.border }]}
                value={manualHour}
                onChangeText={setManualHour}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text style={[styles.timeSeparatorColon, { color: t.textMain }]}>:</Text>
              <TextInput 
                style={[styles.manualTimeInputBox, { backgroundColor: t.innerPanel, color: t.textMain, borderColor: t.border }]}
                value={manualMinute}
                onChangeText={setManualMinute}
                keyboardType="number-pad"
                maxLength={2}
              />
              
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
  style={{
    width: '100%',
    backgroundColor: t.innerPanel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.border,
    color: t.textMain,
    fontSize: 12,
    padding: 10,
    marginTop: 14,
    marginBottom: 4,
    minHeight: 44,
  }}
  placeholder="Add a reminder note (e.g. Focus on Chemistry today)"
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
          <Text style={styles.masterLaunchActionBtnText}>Launch Active Strata Module Run 🚀</Text>
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
    marginLeft: 2,
    marginTop: 12,
  },
  helpIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.55,
    shadowRadius: 4,
    elevation: 4,
  },
  helpIconEmoji: {
    fontSize: 16,
  },
  helpLabelText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#25D366',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  welcomeSplashContainer: { flex: 1, backgroundColor: '#0b0f19', justifyContent: 'center', alignItems: 'center', padding: 24 },
  welcomeSplashContentBox: { alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: 420 },
  welcomeSplashBadge: { color: '#38bdf8', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, backgroundColor: 'rgba(56, 189, 248, 0.12)', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, overflow: 'hidden', marginBottom: 24, textTransform: 'uppercase' },
  welcomeSplashMainSloganText: { color: '#ffffff', fontSize: 22, fontWeight: '900', textAlign: 'center', lineHeight: 32, letterSpacing: 0.5 },
  welcomeSplashHorizontalLineDivider: { width: 60, height: 4, backgroundColor: '#a855f7', borderRadius: 2, marginVertical: 28 },
  welcomeSplashDeveloperCreditText: { color: '#94a3b8', fontSize: 11.5, fontWeight: '800', letterSpacing: 1.2, textAlign: 'center', textTransform: 'uppercase' },
  welcomeSplashFooterLoaderContainer: { position: 'absolute', bottom: 50, alignItems: 'center' },
  welcomeSplashLoadingIndicatorText: { color: '#475569', fontSize: 11, fontWeight: '700', marginTop: 4 },

  topToolbarHeader: { height: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 8, backgroundColor: '#111827', position: 'relative' },
  headerTextInfoGroup: { justifyContent: 'center', flex: 1, marginRight: 8 },
  brandTitleText: { fontSize: 19, fontWeight: '900', color: '#ffffff', letterSpacing: 0.4 }, 
  brandSubTitleText: { fontSize: 9, color: '#38bdf8', fontWeight: '800', marginTop: 2, letterSpacing: 0.6 },
  headerRightActionsGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerActionButton: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.07)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', justifyContent: 'center' },
  actionButtonEmoji: { fontSize: 15 },
  whatsappSupportBtn: { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' },
  headerAccentBottomIndicatorLine: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: '#a855f7' },
  
  scrollWorkspaceContainer: { padding: 16, paddingBottom: 110 },
  sectionLabel: { fontSize: 11, fontWeight: '800', marginBottom: 8, textTransform: 'uppercase', marginTop: 10 },
  structuralGridRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  examSelectionTab: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  examSelectionTabActive: { backgroundColor: '#2563eb', borderColor: '#1d4ed8' },
  examTabText: { fontSize: 13, fontWeight: '700' },
  examTabTextActive: { color: '#ffffff' },

  gamifiedGamificationCard: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  gamifiedTopMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  streakStatusBadgeContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  streakFlameEmojiGraphicIcon: { fontSize: 24 },
  streakCountCounterValueText: { fontSize: 14, fontWeight: '800' },
  streakSubHeadingNoticeText: { fontSize: 11, color: '#10b981', fontWeight: '600' },
  trophyWrapperContainerGraphicBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' },
  trophyEmojiSymbol: { fontSize: 16 },
  gamifiedProgressBarTrackBackgroundTrackLine: { height: 7, backgroundColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden' },
  gamifiedProgressBarActiveFillProgressLine: { height: '100%', backgroundColor: '#2563eb', borderRadius: 4 },

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
  heroCatchyMetricsSubPanel: { backgroundColor: 'rgba(76, 29, 149, 0.35)', padding: 14, borderRadius: 12, marginVertical: 12, borderWidth: 1, borderColor: 'rgba(167, 139, 250, 0.2)' },
  heroCatchyLabelMini: { color: '#c084fc', fontSize: 9, fontWeight: '800', letterSpacing: 0.5, marginBottom: 6 },
  heroCatchyScoreValueRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
  heroCatchyBigPercentageString: { color: '#ffffff', fontSize: 28, fontWeight: '900' },
  heroCatchyVerdictPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  heroCatchyVerdictText: { color: '#ffffff', fontSize: 11, fontWeight: '900', letterSpacing: 0.3 },
  heroCatchyMeterTrack: { height: 8, backgroundColor: '#3b0764', borderRadius: 4, overflow: 'hidden' },
  heroCatchyMeterFill: { height: '100%', borderRadius: 4 },
  heroCatchyMissionTitleHeader: { color: '#ffffff', fontSize: 11, fontWeight: '800', marginBottom: 8 },
  heroCatchyTaskInteractiveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.04)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#3b0764' },
  heroCatchyTaskInteractiveRowChecked: { borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.05)' },
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

  summaryStatusTelemetryBox: { backgroundColor: 'rgba(37, 99, 235, 0.05)', borderRadius: 10, padding: 12, marginTop: 16, borderWidth: 1, borderColor: 'rgba(37, 99, 235, 0.15)' },
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

  modalOverlayBackground: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
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
  periodToggleTextActive: { color: '#ffffff' }
});