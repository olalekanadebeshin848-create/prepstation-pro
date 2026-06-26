import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTopicsBySubject, getCustomQuestionSet } from '../database/queries';

export default function ExamConfigScreen({ subject, onBack, onStartExam }) {
  const insets = useSafeAreaInsets();
  
  // App Config Parameters
  const [mode, setMode] = useState('PRACTICE'); // 'PRACTICE' | 'MOCK' | 'PAST_QUESTION' | 'DRILL'
  const [selectedYear, setSelectedYear] = useState(2024);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [topics, setTopics] = useState([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [launching, setLaunching] = useState(false);

  const availableYears = [2024, 2023, 2022, 2021, 2020, 2019, 2018];

  // Fetch topics instantly if drill mode is chosen
  useEffect(() => {
    if (mode === 'DRILL') {
      async function loadTopics() {
        setLoadingTopics(true);
        const fetchedTopics = await getTopicsBySubject(subject.id);
        setTopics(fetchedTopics);
        if (fetchedTopics.length > 0) setSelectedTopic(fetchedTopics[0]);
        setLoadingTopics(false);
      }
      loadTopics();
    }
  }, [mode, subject.id]);

  // Handle building the question pack and forwarding to the engine workspace
  const handleInitiateSession = async () => {
    setLaunching(true);
    
    // Configure session constants matching exam body constraints
    let limit = mode === 'MOCK' ? 40 : 25; 
    let durationSeconds = mode === 'PRACTICE' ? 0 : 45 * 60; // 45 Mins standard if timed
    
    if (mode === 'MOCK' && subject.exam_body === 'JAMB') {
      durationSeconds = 40 * 60; // 40 minutes per subject matching standard configurations
    }

    const questionSet = await getCustomQuestionSet({
      subjectId: subject.id,
      mode: mode,
      year: mode === 'PAST_QUESTION' ? selectedYear : null,
      topicName: mode === 'DRILL' ? selectedTopic : null,
      limit: limit
    });

    setLaunching(false);

    if (questionSet.length === 0) {
      alert("No questions found matching this exact filter combination in the local bank.");
      return;
    }

    // Pass configuration back up to layout architecture state engine
    onStartExam({
      questions: questionSet,
      mode: mode,
      timeAllowed: durationSeconds,
      subjectMeta: subject
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Exit Setup</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{subject.name} Configuration</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
        
        {/* Step 1: Mode Picker Selection */}
        <Text style={styles.sectionTitle}>1. Select Workspace Mode</Text>
        <View style={styles.modeRow}>
          {[
            { id: 'PRACTICE', title: 'Practice Mode', sub: 'Untimed, instant answers' },
            { id: 'MOCK', title: 'Mock Exam Simulation', sub: 'Strict timing, real conditions' },
            { id: 'PAST_QUESTION', title: 'Past Question Mode', sub: 'Attempt explicit year sheets' },
            { id: 'DRILL', title: 'Topic-Based Drill', sub: 'Target precise conceptual areas' }
          ].map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.modeCard, mode === item.id && styles.activeModeCard]}
              onPress={() => setMode(item.id)}
            >
              <Text style={[styles.modeTitle, mode === item.id && styles.activeModeText]}>{item.title}</Text>
              <Text style={[styles.modeSub, mode === item.id && styles.activeModeSubText]}>{item.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Step 2: Contextual Condition Rendering */}
        {mode === 'PAST_QUESTION' && (
          <View style={styles.conditionalBlock}>
            <Text style={styles.sectionTitle}>2. Select Available Exam Year</Text>
            <View style={styles.wrapGrid}>
              {availableYears.map((year) => (
                <TouchableOpacity
                  key={year}
                  style={[styles.selectorChip, selectedYear === year && styles.activeChip]}
                  onPress={() => setSelectedYear(year)}
                >
                  <Text style={[styles.chipText, selectedYear === year && styles.activeChipText]}>{year}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {mode === 'DRILL' && (
          <View style={styles.conditionalBlock}>
            <Text style={styles.sectionTitle}>2. Select Target Topic Drill</Text>
            {loadingTopics ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : topics.length === 0 ? (
              <Text style={styles.errorText}>No classified sub-topics found for this syllabus row.</Text>
            ) : (
              <View style={styles.wrapGrid}>
                {topics.map((topic) => (
                  <TouchableOpacity
                    key={topic}
                    style={[styles.selectorChip, selectedTopic === topic && styles.activeChip]}
                    onPress={() => setSelectedTopic(topic)}
                  >
                    <Text style={[styles.chipText, selectedTopic === topic && styles.activeChipText]}>{topic}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Start Master Button Action */}
        <TouchableOpacity 
          style={[styles.launchBtn, launching && styles.disabledBtn]} 
          onPress={handleInitiateSession}
          disabled={launching}
        >
          {launching ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.launchBtnText}>Assemble Examination Blueprint ➔</Text>
          )}
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  backButton: { marginRight: 12, paddingVertical: 4, paddingHorizontal: 8 },
  backButtonText: { fontSize: 14, color: '#64748b', fontWeight: '600' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  scrollBody: { padding: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  modeRow: { marginBottom: 16 },
  modeCard: { backgroundColor: '#ffffff', padding: 16, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  activeModeCard: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  modeTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  modeSub: { fontSize: 12, color: '#64748b', marginTop: 4 },
  activeModeText: { color: '#ffffff' },
  activeModeSubText: { color: '#bfdbfe' },
  conditionalBlock: { marginTop: 8, marginBottom: 16, backgroundColor: '#ffffff', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  wrapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectorChip: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#f1f5f9', borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  activeChip: { backgroundColor: '#1e3a8a', borderColor: '#1e3a8a' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  activeChipText: { color: '#ffffff' },
  errorText: { fontSize: 13, color: '#64748b', fontStyle: 'italic' },
  launchBtn: { backgroundColor: '#10b981', paddingVertical: 16, borderRadius: 8, alignItems: 'center', marginTop: 16, elevation: 2 },
  disabledBtn: { opacity: 0.7 },
  launchBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' }
});