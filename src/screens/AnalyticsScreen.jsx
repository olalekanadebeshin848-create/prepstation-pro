import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getExamHistory, clearExamHistory } from '../database/queries'; 

// ── Vibrant & Fresh Subject Color Profiles ──
const SUBJECT_COLORS = {
  'English Language':                  { bg: '#0f172a', accent: '#38bdf8', gradient: '#0284c7', lightBg: '#e0f2fe' },
  'Use of English':                    { bg: '#0f172a', accent: '#38bdf8', gradient: '#0284c7', lightBg: '#e0f2fe' },
  'Mathematics':                       { bg: '#1e1b4b', accent: '#6366f1', gradient: '#4f46e5', lightBg: '#e0e7ff' },
  'Further Mathematics':               { bg: '#1e1b4b', accent: '#818cf8', gradient: '#4f46e5', lightBg: '#e0e7ff' },
  'Physics':                           { bg: '#071e3d', accent: '#06b6d4', gradient: '#0891b2', lightBg: '#ecfeff' },
  'Chemistry':                         { bg: '#062f4f', accent: '#10b981', gradient: '#059669', lightBg: '#dcfce7' },
  'Biology':                           { bg: '#064e3b', accent: '#22c55e', gradient: '#16a34a', lightBg: '#dcfce7' },
  'Agricultural Science':              { bg: '#1c2d11', accent: '#84cc16', gradient: '#65a30d', lightBg: '#f7fee7' },
  'Geography':                         { bg: '#065f46', accent: '#14b8a6', gradient: '#0d9488', lightBg: '#ccfbf1' },
  'Economics':                         { bg: '#451a03', accent: '#f59e0b', gradient: '#d97706', lightBg: '#fef3c7' },
  'Government':                        { bg: '#701a75', accent: '#e879f9', gradient: '#c084fc', lightBg: '#fae8ff' },
  'Literature in English':             { bg: '#581c87', accent: '#c084fc', gradient: '#9333ea', lightBg: '#f3e8ff' },
  'Christian Religious Studies':       { bg: '#1e3a8a', accent: '#60a5fa', gradient: '#3b82f6', lightBg: '#dbeafe' },
  'Islamic Religious Studies':         { bg: '#14532d', accent: '#4ade80', gradient: '#22c55e', lightBg: '#dcfce7' },
  'Civic Education':                   { bg: '#111827', accent: '#9ca3af', gradient: '#4b5563', lightBg: '#f3f4f6' },
  'Commerce':                          { bg: '#312e81', accent: '#a5b4fc', gradient: '#4f46e5', lightBg: '#e0e7ff' },
  'Financial Accounting':              { bg: '#1e293b', accent: '#94a3b8', gradient: '#475569', lightBg: '#f1f5f9' },
  'History':                           { bg: '#451a03', accent: '#fb923c', gradient: '#ea580c', lightBg: '#ffedd5' },
};

const DEFAULT_COLOR = { bg: '#1e293b', accent: '#3b82f6', gradient: '#2563eb', lightBg: '#eff6ff' };

export default function AnalyticsScreen({ onBack }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    loadTelemetryLogs();
  }, []);

  const loadTelemetryLogs = async () => {
    setLoading(true);
    const data = await getExamHistory();
    setHistory(data || []);
    setLoading(false);
  };

  const handleWipeHistory = () => {
    Alert.alert(
      "Wipe Core Logs",
      "Are you sure you want to completely delete your local diagnostic results history metrics? This process cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Wipe System Base", 
          style: "destructive",
          onPress: async () => {
            const success = await clearExamHistory();
            if (success) {
              setHistory([]);
              Alert.alert("Success", "Diagnostic history metrics cleared completely.");
            }
          }
        }
      ]
    );
  };

  // ── Metrics Aggregations ──
  const totalExams = history.length;
  const averagePercentage = totalExams > 0 
    ? Math.round(history.reduce((acc, curr) => acc + (curr.percentage || 0), 0) / totalExams) 
    : 0;
  
  const passedExams = history.filter(item => (item.percentage || 0) >= (item.required_score || 50)).length;
  const globalPassRate = totalExams > 0 ? Math.round((passedExams / totalExams) * 100) : 0;
  const totalViolations = history.reduce((acc, curr) => acc + (curr.tab_switch_count || 0), 0);

  // Subject Performance Parsing
  const subjectMap = {};
  history.forEach(item => {
    const name = item.subject_name || 'General Evaluation';
    if (!subjectMap[name]) {
      subjectMap[name] = { totalPct: 0, count: 0 };
    }
    subjectMap[name].totalPct += (item.percentage || 0);
    subjectMap[name].count += 1;
  });

  let weakestSubject = null;
  let strongestSubject = null;
  let minAvg = 999;
  let maxAvg = -1;

  Object.keys(subjectMap).forEach(name => {
    const avg = Math.round(subjectMap[name].totalPct / subjectMap[name].count);
    if (avg < minAvg) { minAvg = avg; weakestSubject = { name, avg }; }
    if (avg > maxAvg) { maxAvg = avg; strongestSubject = { name, avg }; }
  });

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
      
      {/* HEADER SECTION MAPS DIRECTLY TO APP.JS ONBACK ROUTER SWITCH */}
      <View style={styles.headerContainer}>
        <View style={styles.titleGroup}>
          <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
            <Text style={styles.backButtonText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.headerTextWrapper}>
            <Text style={styles.headerTitle}>Performance Insights</Text>
            <Text style={styles.headerSub}>Localized CBT Metrics & Historical Analysis</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.closeActionBadge} onPress={onBack} activeOpacity={0.8}>
          <Text style={styles.closeActionBadgeTxt}>Close Dashboard</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerMode}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingTxt}>Parsing Database History Cache...</Text>
        </View>
      ) : totalExams === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.illustrationContainer}>
            <View style={[styles.blob, styles.blob1]} />
            <View style={[styles.blob, styles.blob2]} />
            <View style={[styles.blob, styles.blob3]} />
            <Text style={styles.emptyIcon}>📊</Text>
          </View>
          <Text style={styles.emptyTitle}>No Performance History Yet</Text>
          <Text style={styles.emptyDesc}>
            Complete your first examination simulation using the practice suite to populate analytical evaluation metrics.
          </Text>
          <TouchableOpacity style={styles.returnButton} onPress={onBack} activeOpacity={0.8}>
            <Text style={styles.returnButtonText}>Return to Dashboard</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* SCOREBOARD SUMMARY MATRICES */}
          <View style={styles.gridContainer}>
            <View style={styles.metricCard}>
              <Text style={styles.cardLabel}>Exams Taken</Text>
              <Text style={styles.cardValue}>{totalExams}</Text>
              <Text style={styles.cardIndicator}>Session instances</Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.cardLabel}>Average Score</Text>
              <Text style={[styles.cardValue, { color: averagePercentage >= 50 ? '#10b981' : '#ef4444' }]}>
                {averagePercentage}%
              </Text>
              <Text style={styles.cardIndicator}>Cumulative performance</Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.cardLabel}>Global Pass Rate</Text>
              <Text style={styles.cardValue}>{globalPassRate}%</Text>
              <Text style={styles.cardIndicator}>{passedExams} of {totalExams} passed</Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.cardLabel}>Security Exceptions</Text>
              <Text style={[styles.cardValue, { color: totalViolations > 0 ? '#f59e0b' : '#64748b' }]}>
                {totalViolations}
              </Text>
              <Text style={styles.cardIndicator}>Tab navigation alerts</Text>
            </View>
          </View>

          {/* DIAGNOSTIC INSIGHT TILES */}
          {strongestSubject && (
            <View style={styles.strongCard}>
              <View style={styles.strongLabel}>
                <Text style={styles.strongLabelTxt}>TOP COMPETENCY VECTOR</Text>
              </View>
              <Text style={styles.strongName}>{strongestSubject.name}</Text>
              <Text style={styles.strongSub}>Achieved a dominant average velocity score of {strongestSubject.avg}%</Text>
            </View>
          )}

          {weakestSubject && weakestSubject.name !== strongestSubject?.name && (
            <View style={styles.weakCard}>
              <View style={styles.weakLabel}>
                <Text style={styles.weakLabelTxt}>ATTENTION REQUIRED</Text>
              </View>
              <Text style={styles.weakName}>{weakestSubject.name}</Text>
              <Text style={styles.weakSub}>Current historical average sits below benchmark thresholds at {weakestSubject.avg}%</Text>
            </View>
          )}

          {/* HISTORICAL FEED LOG */}
          <View style={styles.listHeaderRow}>
            <Text style={styles.sectionHeaderTitle}>Sequential Performance Records</Text>
            <TouchableOpacity onPress={handleWipeHistory} activeOpacity={0.7}>
              <Text style={styles.inlineWipeTxt}>Clear History</Text>
            </TouchableOpacity>
          </View>
          
          {history.map((log) => {
            const subjectName = log.subject_name || 'General Evaluation';
            const colorMeta = SUBJECT_COLORS[subjectName] || DEFAULT_COLOR;
            const isPassed = (log.percentage || 0) >= (log.required_score || 50);

            return (
              <View key={log.id} style={styles.historyLogCard}>
                <View style={styles.logHeaderRow}>
                  <View style={styles.subjectIdentityBlock}>
                    <View style={[styles.colorPillIndicator, { backgroundColor: colorMeta.accent }]} />
                    <View style={styles.identityTextContainer}>
                      <Text style={styles.identityTitle} numberOfLines={1}>{subjectName}</Text>
                      <Text style={styles.identityExamBody}>{log.exam_body || 'CBT'}</Text>
                    </View>
                  </View>

                  <View style={[styles.verdictBadge, { backgroundColor: isPassed ? '#dcfce7' : '#fee2e2' }]}>
                    <Text style={[styles.verdictText, { color: isPassed ? '#16a34a' : '#ef4444' }]}>
                      {log.percentage || 0}%
                    </Text>
                  </View>
                </View>

                <View style={styles.performanceMetricSummaryRow}>
                  <Text style={styles.metricRowSubtext}>
                    Raw: <Text style={styles.boldText}>{log.raw_score || log.score || 0}</Text>/{log.total_questions || 0}
                  </Text>
                  <Text style={styles.metricRowSubtext}>
                    Final: <Text style={styles.boldText}>{log.final_score || 0}</Text> pts
                  </Text>
                  {log.tab_switch_count > 0 && (
                    <Text style={styles.securityFlagText}>
                      ⚠️ {log.tab_switch_count} Breach (-{log.penalty_deduction || 0} pts)
                    </Text>
                  )}
                </View>

                <View style={styles.logMetaFooter}>
                  <Text style={styles.miniLogPill}>{log.bundle_name || 'Standard Matrix'}</Text>
                  <Text style={styles.logDateText}>
                    {log.timestamp ? new Date(log.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Prior Session'}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  centerMode: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  loadingTxt: { marginTop: 12, fontSize: 13, color: '#64748b', fontWeight: '600' },
  
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  titleGroup: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  backButton: { marginRight: 12, backgroundColor: '#f1f5f9', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  backButtonText: { fontSize: 14, color: '#475569', fontWeight: '800' },
  headerTextWrapper: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#0f172a', letterSpacing: -0.5 },
  headerSub: { fontSize: 11, color: '#64748b', marginTop: 1, fontWeight: '500' },
  
  closeActionBadge: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#0f172a' },
  closeActionBadgeTxt: { fontSize: 12, fontWeight: '700', color: '#ffffff' },

  scrollBody: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  metricCard: { backgroundColor: '#ffffff', borderRadius: 14, padding: 16, width: '47%', flexGrow: 1, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2 },
  cardLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardValue: { fontSize: 24, fontWeight: '900', color: '#0f172a', marginVertical: 4, letterSpacing: -0.5 },
  cardIndicator: { fontSize: 10, color: '#94a3b8', fontWeight: '500' },

  strongCard: { backgroundColor: '#f0fdf4', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#bbf7d0' },
  strongLabel: { alignSelf: 'flex-start', backgroundColor: '#dcfce7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6 },
  strongLabelTxt: { fontSize: 9, fontWeight: '800', color: '#16a34a', letterSpacing: 0.5 },
  strongName: { fontSize: 16, fontWeight: '800', color: '#14532d' },
  strongSub: { fontSize: 12, color: '#15803d', marginTop: 4, fontWeight: '500' },

  weakCard: { backgroundColor: '#fef2f2', borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#fca5a5' },
  weakLabel: { alignSelf: 'flex-start', backgroundColor: '#fee2e2', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6 },
  weakLabelTxt: { fontSize: 9, fontWeight: '800', color: '#ef4444', letterSpacing: 0.5 },
  weakName: { fontSize: 16, fontWeight: '800', color: '#7f1d1d' },
  weakSub: { fontSize: 12, color: '#b91c1c', marginTop: 4, fontWeight: '500' },

  listHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionHeaderTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', letterSpacing: -0.3 },
  inlineWipeTxt: { fontSize: 13, color: '#ef4444', fontWeight: '700' },

  historyLogCard: { backgroundColor: '#ffffff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#0f172a', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
  logHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  subjectIdentityBlock: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  colorPillIndicator: { width: 4, height: 28, borderRadius: 2, marginRight: 10 },
  identityTextContainer: { flex: 1 },
  identityTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  identityExamBody: { fontSize: 11, fontWeight: '600', color: '#64748b', marginTop: 1 },
  
  verdictBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, minWidth: 54, alignItems: 'center' },
  verdictText: { fontSize: 14, fontWeight: '800' },

  performanceMetricSummaryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#f1f5f9', marginBottom: 10 },
  metricRowSubtext: { fontSize: 12, color: '#475569', fontWeight: '500' },
  boldText: { fontWeight: '700', color: '#0f172a' },
  securityFlagText: { fontSize: 12, fontWeight: '700', color: '#d97706' },

  logMetaFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  miniLogPill: { fontSize: 11, fontWeight: '600', color: '#475569', backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  logDateText: { fontSize: 11, color: '#94a3b8', fontWeight: '500' },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingBottom: 60 },
  illustrationContainer: { width: 100, height: 100, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  blob: { position: 'absolute', borderRadius: 50, opacity: 0.06 },
  blob1: { width: 100, height: 100, backgroundColor: '#2563eb' },
  blob2: { width: 85, height: 85, backgroundColor: '#38bdf8' },
  blob3: { width: 70, height: 70, backgroundColor: '#10b981' },
  emptyIcon: { fontSize: 36, color: '#64748b' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  emptyDesc: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  returnButton: { backgroundColor: '#2563eb', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 },
  returnButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
});