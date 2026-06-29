import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getExamHistory, clearExamHistory } from '../database/queries';

const SUBJECT_COLORS = {
  'English Language':            '#38bdf8',
  'Use of English':              '#38bdf8',
  'Mathematics':                 '#818cf8',
  'Further Mathematics':         '#a78bfa',
  'Physics':                     '#22d3ee',
  'Chemistry':                   '#4ade80',
  'Biology':                     '#86efac',
  'Agricultural Science':        '#a3e635',
  'Geography':                   '#34d399',
  'Economics':                   '#fbbf24',
  'Government':                  '#c084fc',
  'Literature in English':       '#f87171',
  'Christian Religious Studies': '#fb923c',
  'Islamic Religious Studies':   '#a78bfa',
  'Commerce':                    '#facc15',
  'Accounting':                  '#2dd4bf',
};
const DEFAULT_ACCENT = '#64748b';

function getAccent(name) {
  if (!name) return DEFAULT_ACCENT;
  const key = Object.keys(SUBJECT_COLORS).find(k =>
    name.toLowerCase().includes(k.toLowerCase()) ||
    k.toLowerCase().includes(name.toLowerCase())
  );
  return key ? SUBJECT_COLORS[key] : DEFAULT_ACCENT;
}

function ScoreBadge({ pct }) {
  const color = pct >= 70 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <View style={[badge.wrap, { borderColor: color }]}>
      <Text style={[badge.txt, { color }]}>{pct}%</Text>
    </View>
  );
}
const badge = StyleSheet.create({
  wrap: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, minWidth: 54, alignItems: 'center' },
  txt:  { fontSize: 14, fontWeight: '900' },
});

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <View style={bar.track}>
      <View style={[bar.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}
const bar = StyleSheet.create({
  track: { height: 6, backgroundColor: '#1e293b', borderRadius: 3, overflow: 'hidden', flex: 1 },
  fill:  { height: '100%', borderRadius: 3 },
});

export default function AnalyticsScreen({ onBack }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('OVERVIEW');

  useEffect(() => { loadHistory(); }, []);

  const loadHistory = async () => {
    setLoading(true);
    const data = await getExamHistory();
    setHistory(data || []);
    setLoading(false);
  };

  const handleClear = () => {
    Alert.alert(
      'Clear All History',
      'This permanently deletes all your exam records. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            await clearExamHistory();
            setHistory([]);
          },
        },
      ]
    );
  };

  // ── Aggregations ──
  const total = history.length;
  const avgPct = total > 0
    ? Math.round(history.reduce((s, r) => s + (r.percentage || 0), 0) / total)
    : 0;
  const passed = history.filter(r => (r.percentage || 0) >= (r.required_score || 50)).length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const totalViolations = history.reduce((s, r) => s + (r.tab_switch_count || 0), 0);
  const totalPenalty = history.reduce((s, r) => s + (r.penalty_deduction || 0), 0);

  // Per-subject breakdown
  const subjectMap = {};
  history.forEach(r => {
    const name = r.subject_name || 'General Practice';
    if (!subjectMap[name]) subjectMap[name] = { total: 0, count: 0, passed: 0 };
    subjectMap[name].total += (r.percentage || 0);
    subjectMap[name].count += 1;
    if ((r.percentage || 0) >= (r.required_score || 50)) subjectMap[name].passed += 1;
  });

  const subjectStats = Object.entries(subjectMap).map(([name, d]) => ({
    name,
    avg: Math.round(d.total / d.count),
    count: d.count,
    passed: d.passed,
    accent: getAccent(name),
  })).sort((a, b) => b.avg - a.avg);

  const strongest = subjectStats[0] || null;
  const weakest   = subjectStats[subjectStats.length - 1] || null;

  // Exam body breakdown
  const examBodyMap = {};
  history.forEach(r => {
    const body = r.exam_body || 'CBT';
    if (!examBodyMap[body]) examBodyMap[body] = { total: 0, count: 0 };
    examBodyMap[body].total += (r.percentage || 0);
    examBodyMap[body].count += 1;
  });

  const TABS = ['OVERVIEW', 'SUBJECTS', 'HISTORY'];

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={s.loadingTxt}>Loading performance data...</Text>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: Math.max(insets.top, 16) }]}>

      {/* ── HEADER ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Text style={s.backBtnTxt}>✕</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Performance Analytics</Text>
          <Text style={s.headerSub}>Exam history & subject breakdown</Text>
        </View>
        {total > 0 && (
          <TouchableOpacity style={s.clearBtn} onPress={handleClear}>
            <Text style={s.clearBtnTxt}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── TABS ── */}
      <View style={s.tabRow}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, activeTab === tab && s.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[s.tabTxt, activeTab === tab && s.tabTxtActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {total === 0 ? (
        // ── EMPTY STATE ──
        <View style={s.emptyWrap}>
          <Text style={s.emptyIcon}>📊</Text>
          <Text style={s.emptyTitle}>No Exam Records Yet</Text>
          <Text style={s.emptyDesc}>
            Complete at least one examination session to populate your analytics dashboard.
          </Text>
          <TouchableOpacity style={s.emptyBtn} onPress={onBack}>
            <Text style={s.emptyBtnTxt}>Go Practice Now</Text>
          </TouchableOpacity>
        </View>
      ) : (

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
        >

          {/* ══════════════════════════════════════════
              TAB: OVERVIEW
          ══════════════════════════════════════════ */}
          {activeTab === 'OVERVIEW' && (
            <>
              {/* KPI Grid */}
              <View style={s.kpiGrid}>
                <View style={s.kpiCard}>
                  <Text style={s.kpiValue}>{total}</Text>
                  <Text style={s.kpiLabel}>Exams Taken</Text>
                </View>
                <View style={s.kpiCard}>
                  <Text style={[s.kpiValue, { color: avgPct >= 50 ? '#22c55e' : '#ef4444' }]}>{avgPct}%</Text>
                  <Text style={s.kpiLabel}>Average Score</Text>
                </View>
                <View style={s.kpiCard}>
                  <Text style={s.kpiValue}>{passRate}%</Text>
                  <Text style={s.kpiLabel}>Pass Rate</Text>
                </View>
                <View style={s.kpiCard}>
                  <Text style={[s.kpiValue, { color: totalViolations > 0 ? '#f59e0b' : '#64748b' }]}>
                    {totalViolations}
                  </Text>
                  <Text style={s.kpiLabel}>Tab Violations</Text>
                </View>
              </View>

              {/* Pass vs Fail bar */}
              <View style={s.card}>
                <Text style={s.cardTitle}>Pass / Fail Ratio</Text>
                <View style={s.pfRow}>
                  <View style={[s.pfBlock, { backgroundColor: '#052e16', borderColor: '#22c55e' }]}>
                    <Text style={[s.pfNum, { color: '#22c55e' }]}>{passed}</Text>
                    <Text style={s.pfLbl}>Passed</Text>
                  </View>
                  <View style={[s.pfBlock, { backgroundColor: '#450a0a', borderColor: '#ef4444' }]}>
                    <Text style={[s.pfNum, { color: '#ef4444' }]}>{total - passed}</Text>
                    <Text style={s.pfLbl}>Failed</Text>
                  </View>
                </View>
                <View style={s.pfBarWrap}>
                  <View style={[s.pfBarSegment, {
                    flex: passed,
                    backgroundColor: '#22c55e',
                    borderTopLeftRadius: 4, borderBottomLeftRadius: 4
                  }]} />
                  <View style={[s.pfBarSegment, {
                    flex: total - passed,
                    backgroundColor: '#ef4444',
                    borderTopRightRadius: 4, borderBottomRightRadius: 4
                  }]} />
                </View>
              </View>

              {/* Penalty summary */}
              {totalViolations > 0 && (
                <View style={[s.card, { borderColor: '#f59e0b' }]}>
                  <Text style={s.cardTitle}>⚠️ Security Violations Summary</Text>
                  <View style={s.violationRow}>
                    <View style={s.violationCell}>
                      <Text style={[s.violationNum, { color: '#f59e0b' }]}>{totalViolations}</Text>
                      <Text style={s.violationLbl}>Total Breaches</Text>
                    </View>
                    <View style={s.violationCell}>
                      <Text style={[s.violationNum, { color: '#ef4444' }]}>{totalPenalty}</Text>
                      <Text style={s.violationLbl}>Total Marks Lost</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Exam body breakdown */}
              {Object.keys(examBodyMap).length > 0 && (
                <View style={s.card}>
                  <Text style={s.cardTitle}>Performance by Exam Body</Text>
                  {Object.entries(examBodyMap).map(([body, d]) => {
                    const avg = Math.round(d.total / d.count);
                    const color = avg >= 70 ? '#22c55e' : avg >= 50 ? '#f59e0b' : '#ef4444';
                    return (
                      <View key={body} style={s.examBodyRow}>
                        <Text style={s.examBodyName}>{body}</Text>
                        <MiniBar value={avg} max={100} color={color} />
                        <Text style={[s.examBodyPct, { color }]}>{avg}%</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Insight cards */}
              {strongest && (
                <View style={[s.insightCard, { backgroundColor: '#052e16', borderColor: '#22c55e' }]}>
                  <View style={[s.insightBadge, { backgroundColor: '#dcfce7' }]}>
                    <Text style={[s.insightBadgeTxt, { color: '#16a34a' }]}>STRONGEST SUBJECT</Text>
                  </View>
                  <Text style={[s.insightName, { color: '#4ade80' }]}>{strongest.name}</Text>
                  <Text style={[s.insightSub, { color: '#86efac' }]}>
                    Average {strongest.avg}% across {strongest.count} session{strongest.count !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}

              {weakest && weakest.name !== strongest?.name && (
                <View style={[s.insightCard, { backgroundColor: '#450a0a', borderColor: '#ef4444' }]}>
                  <View style={[s.insightBadge, { backgroundColor: '#fee2e2' }]}>
                    <Text style={[s.insightBadgeTxt, { color: '#ef4444' }]}>NEEDS ATTENTION</Text>
                  </View>
                  <Text style={[s.insightName, { color: '#f87171' }]}>{weakest.name}</Text>
                  <Text style={[s.insightSub, { color: '#fca5a5' }]}>
                    Average {weakest.avg}% — prioritise this in your next session
                  </Text>
                </View>
              )}
            </>
          )}

          {/* ══════════════════════════════════════════
              TAB: SUBJECTS
          ══════════════════════════════════════════ */}
          {activeTab === 'SUBJECTS' && (
            <>
              {subjectStats.length === 0 ? (
                <Text style={s.emptyTabTxt}>No subject data available yet.</Text>
              ) : (
                subjectStats.map(sub => (
                  <View key={sub.name} style={s.subjectCard}>
                    <View style={s.subjectTopRow}>
                      <View style={[s.subjectAccentBar, { backgroundColor: sub.accent }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.subjectName}>{sub.name}</Text>
                        <Text style={s.subjectMeta}>
                          {sub.count} session{sub.count !== 1 ? 's' : ''} · {sub.passed} passed
                        </Text>
                      </View>
                      <ScoreBadge pct={sub.avg} />
                    </View>
                    <View style={s.subjectBarRow}>
                      <MiniBar value={sub.avg} max={100} color={sub.accent} />
                      <Text style={[s.subjectBarLabel, { color: sub.accent }]}>{sub.avg}%</Text>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {/* ══════════════════════════════════════════
              TAB: HISTORY
          ══════════════════════════════════════════ */}
          {activeTab === 'HISTORY' && (
            <>
              {[...history].reverse().map(r => {
                const accent = getAccent(r.subject_name);
                const isPassed = (r.percentage || 0) >= (r.required_score || 50);
                const date = r.timestamp
                  ? new Date(r.timestamp).toLocaleDateString(undefined, {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })
                  : 'Unknown date';

                return (
                  <View key={r.id} style={s.historyCard}>
                    {/* Subject + score */}
                    <View style={s.historyTopRow}>
                      <View style={[s.historyAccentBar, { backgroundColor: accent }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.historySubject} numberOfLines={1}>
                          {r.subject_name || 'General Practice'}
                        </Text>
                        <Text style={s.historyExamBody}>{r.exam_body || 'CBT'}</Text>
                      </View>
                      <View style={[s.verdictPill, {
                        backgroundColor: isPassed ? '#052e16' : '#450a0a',
                        borderColor: isPassed ? '#22c55e' : '#ef4444',
                      }]}>
                        <Text style={[s.verdictPillTxt, { color: isPassed ? '#22c55e' : '#ef4444' }]}>
                          {r.percentage || 0}% · {isPassed ? 'PASS' : 'FAIL'}
                        </Text>
                      </View>
                    </View>

                    {/* Score breakdown */}
                    <View style={s.historyStatsRow}>
                      <Text style={s.historyStatItem}>
                        Raw: <Text style={s.historyStatBold}>{r.raw_score ?? r.score ?? 0}</Text>
                      </Text>
                      <Text style={s.historyStatItem}>
                        Final: <Text style={s.historyStatBold}>{r.final_score ?? 0}</Text>/{r.total_questions ?? 0}
                      </Text>
                      <Text style={s.historyStatItem}>
                        Pass mark: <Text style={s.historyStatBold}>{r.required_score ?? 50}%</Text>
                      </Text>
                    </View>

                    {/* Violations row */}
                    {(r.tab_switch_count > 0) && (
                      <View style={s.violationBanner}>
                        <Text style={s.violationBannerTxt}>
                          ⚠️ {r.tab_switch_count} tab violation{r.tab_switch_count > 1 ? 's' : ''} · -{r.penalty_deduction || 0} marks penalty
                        </Text>
                      </View>
                    )}

                    {/* Footer */}
                    <View style={s.historyFooter}>
                      <View style={s.bundlePill}>
                        <Text style={s.bundlePillTxt}>{r.bundle_name || 'Standard'}</Text>
                      </View>
                      <Text style={s.historyDate}>{date}</Text>
                    </View>
                  </View>
                );
              })}
            </>
          )}

        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#0f172a' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  loadingTxt:  { color: '#64748b', fontSize: 13, fontWeight: '600', marginTop: 12 },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4, borderBottomWidth: 1, borderColor: '#1e293b' },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: '#334155' },
  backBtnTxt:  { color: '#94a3b8', fontSize: 14, fontWeight: '800' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#f8fafc', letterSpacing: -0.3 },
  headerSub:   { fontSize: 11, color: '#475569', fontWeight: '500', marginTop: 1 },
  clearBtn:    { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#450a0a', borderRadius: 8, borderWidth: 1, borderColor: '#dc2626' },
  clearBtnTxt: { color: '#f87171', fontSize: 12, fontWeight: '700' },

  // Tabs
  tabRow:      { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  tab:         { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1e293b', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  tabActive:   { backgroundColor: '#2563eb', borderColor: '#1d4ed8' },
  tabTxt:      { fontSize: 11, fontWeight: '700', color: '#64748b' },
  tabTxtActive:{ color: '#ffffff' },

  scroll: { padding: 16, paddingBottom: 40 },

  // Empty
  emptyWrap:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon:   { fontSize: 48, marginBottom: 16 },
  emptyTitle:  { fontSize: 18, fontWeight: '800', color: '#f8fafc', marginBottom: 8 },
  emptyDesc:   { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn:    { backgroundColor: '#2563eb', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
  emptyBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  emptyTabTxt: { color: '#475569', fontSize: 13, textAlign: 'center', marginTop: 20 },

  // KPI
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  kpiCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, width: '47%', flexGrow: 1, borderWidth: 1, borderColor: '#334155' },
  kpiValue:{ fontSize: 26, fontWeight: '900', color: '#f8fafc', letterSpacing: -0.5 },
  kpiLabel:{ fontSize: 10, color: '#64748b', fontWeight: '700', textTransform: 'uppercase', marginTop: 4 },

  // Card
  card:        { backgroundColor: '#1e293b', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  cardTitle:   { fontSize: 13, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },

  // Pass/Fail
  pfRow:       { flexDirection: 'row', gap: 10, marginBottom: 12 },
  pfBlock:     { flex: 1, borderRadius: 10, borderWidth: 1, padding: 12, alignItems: 'center' },
  pfNum:       { fontSize: 22, fontWeight: '900' },
  pfLbl:       { fontSize: 10, color: '#64748b', fontWeight: '700', marginTop: 2 },
  pfBarWrap:   { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  pfBarSegment:{ height: '100%' },

  // Exam body
  examBodyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  examBodyName:{ fontSize: 12, fontWeight: '700', color: '#cbd5e1', width: 50 },
  examBodyPct: { fontSize: 12, fontWeight: '800', width: 38, textAlign: 'right' },

  // Violations
  violationRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  violationCell:{ flex: 1, alignItems: 'center' },
  violationNum: { fontSize: 24, fontWeight: '900' },
  violationLbl: { fontSize: 10, color: '#64748b', fontWeight: '700', marginTop: 2, textAlign: 'center' },

  // Insight cards
  insightCard:      { borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1 },
  insightBadge:     { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  insightBadgeTxt:  { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  insightName:      { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  insightSub:       { fontSize: 12, fontWeight: '500' },

  // Subject tab
  subjectCard:    { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#334155' },
  subjectTopRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  subjectAccentBar:{ width: 4, height: 36, borderRadius: 2, marginRight: 10 },
  subjectName:    { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  subjectMeta:    { fontSize: 11, color: '#64748b', fontWeight: '500', marginTop: 2 },
  subjectBarRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subjectBarLabel:{ fontSize: 11, fontWeight: '800', width: 36, textAlign: 'right' },

  // History tab
  historyCard:     { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#334155' },
  historyTopRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  historyAccentBar:{ width: 4, height: 36, borderRadius: 2, marginRight: 10 },
  historySubject:  { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  historyExamBody: { fontSize: 11, color: '#64748b', fontWeight: '500', marginTop: 1 },
  verdictPill:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  verdictPillTxt:  { fontSize: 11, fontWeight: '900' },
  historyStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderColor: '#334155', marginBottom: 8 },
  historyStatItem: { fontSize: 11, color: '#64748b', fontWeight: '500' },
  historyStatBold: { fontWeight: '800', color: '#cbd5e1' },
  violationBanner: { backgroundColor: '#451a03', borderRadius: 6, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: '#92400e' },
  violationBannerTxt: { fontSize: 11, color: '#fbbf24', fontWeight: '700' },
  historyFooter:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bundlePill:      { backgroundColor: '#0f172a', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  bundlePillTxt:   { fontSize: 10, color: '#475569', fontWeight: '600' },
  historyDate:     { fontSize: 10, color: '#475569', fontWeight: '500' },
});