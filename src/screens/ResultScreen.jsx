import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Linking } from 'react-native';
import { logExamResult } from '../database/queries';
import { WebView } from 'react-native-webview';

const { width } = Dimensions.get('window');

const SUBJECT_COLORS = {
  'English Language':               { bg: '#1e3a5f', accent: '#38bdf8', text: '#bae6fd' },
  'Use of English':                 { bg: '#1e3a5f', accent: '#38bdf8', text: '#bae6fd' },
  'Mathematics':                    { bg: '#1e1b4b', accent: '#818cf8', text: '#c7d2fe' },
  'Further Mathematics':            { bg: '#1e1b4b', accent: '#818cf8', text: '#c7d2fe' },
  'Physics':                        { bg: '#0c2340', accent: '#22d3ee', text: '#a5f3fc' },
  'Chemistry':                      { bg: '#14231a', accent: '#4ade80', text: '#bbf7d0' },
  'Biology':                        { bg: '#1a2e1a', accent: '#86efac', text: '#dcfce7' },
  'Agricultural Science':           { bg: '#1c2a10', accent: '#a3e635', text: '#ecfccb' },
  'Geography':                      { bg: '#1e2a1a', accent: '#34d399', text: '#d1fae5' },
  'Economics':                      { bg: '#2d1b00', accent: '#fbbf24', text: '#fef3c7' },
  'Government':                     { bg: '#1e0a2e', accent: '#c084fc', text: '#f3e8ff' },
  'Literature in English':          { bg: '#2d0a0a', accent: '#f87171', text: '#fee2e2' },
  'Commerce':                       { bg: '#1a1a00', accent: '#facc15', text: '#fef9c3' },
  'Accounting':                     { bg: '#002020', accent: '#2dd4bf', text: '#ccfbf1' },
  'Christian Religious Studies (CRS)': { bg: '#1a0a00', accent: '#fb923c', text: '#ffedd5' },
  'Islamic Religious Studies (IRS)': { bg: '#0a001a', accent: '#a78bfa', text: '#ede9fe' },
};

const DEFAULT_SUBJECT_COLOR = { bg: '#1e293b', accent: '#94a3b8', text: '#e2e8f0' };

function getSubjectColor(name) {
  return SUBJECT_COLORS[name] || DEFAULT_SUBJECT_COLOR;
}

function ScoreRing({ percentage, passed }) {
  const color = passed
    ? percentage >= 85 ? '#22c55e' : '#4ade80'
    : percentage >= 50 ? '#f59e0b' : '#ef4444';

  const label = passed ? 'PASSED' : 'RETAKE';
  const labelColor = passed ? '#22c55e' : '#ef4444';

  return (
    <View style={ring.wrapper}>
      <View style={[ring.outer, { borderColor: color }]}>
        <View style={ring.inner}>
          <Text style={[ring.pct, { color }]}>{percentage}%</Text>
          <Text style={[ring.verdict, { color: labelColor }]}>{label}</Text>
        </View>
      </View>
    </View>
  );
}

const ring = StyleSheet.create({
  wrapper:  { alignItems: 'center', marginVertical: 4 },
  outer:    { width: 140, height: 140, borderRadius: 70, borderWidth: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' },
  inner:    { alignItems: 'center' },
  pct:      { fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  verdict:  { fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: 2 },
});

function SubjectBadge({ name, count }) {
  const c = getSubjectColor(name);
  return (
    <View style={[badge.wrap, { backgroundColor: c.bg, borderColor: c.accent }]}>
      <Text style={[badge.name, { color: c.accent }]}>{name}</Text>
      <Text style={[badge.count, { color: c.text }]}>{count} missed</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap:  { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  name:  { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  count: { fontSize: 10, fontWeight: '600', marginTop: 1 },
});

// ─────────────────────────────────────────────────────────────────────────────
// ResultQuestionImage — renders SVG and base64 images via WebView
// <Image> does not support SVG base64 URIs in React Native
// ─────────────────────────────────────────────────────────────────────────────
function ResultQuestionImage({ imageUri }) {
  const [imgHeight, setImgHeight] = useState(200);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; background: transparent; }
    img { width: 100%; height: auto; display: block; max-width: 100%; object-fit: contain; }
  </style>
</head>
<body>
  <img
    src="${imageUri}"
    onload="window.ReactNativeWebView.postMessage(String(Math.ceil(this.naturalHeight * (window.innerWidth / this.naturalWidth))))"
    onerror="document.body.innerHTML='<p style=color:#ef4444;font-size:12px;padding:8px>Image failed to load</p>'"
  />
</body>
</html>`;

  return (
    <View style={{ width: '100%', height: imgHeight, marginBottom: 10, borderRadius: 8, overflow: 'hidden', backgroundColor: '#0f172a' }}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: 'transparent', flex: 1 }}
        androidLayerType="software"
        onMessage={(e) => {
          const h = parseInt(e.nativeEvent.data, 10);
          if (!isNaN(h) && h > 0 && h < 600) {
            setImgHeight(h);
          }
        }}
      />
    </View>
  );
}

function WrongRow({ item, globalIndex, passed }) {
  const [expanded, setExpanded] = useState(false);
  const c = getSubjectColor(item.subjectName);
  const notAnswered = !item.studentKey;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setExpanded(e => !e)}
      style={[row.card, { borderLeftColor: c.accent }]}
    >
      {/* collapsed row */}
      <View style={row.top}>
        <View style={[row.numBadge, { backgroundColor: c.bg }]}>
          <Text style={[row.num, { color: c.accent }]}>Q{globalIndex}</Text>
        </View>
        <Text style={row.preview} numberOfLines={expanded ? 0 : 2}>
          {item.questionText}
        </Text>
        <Text style={row.chevron}>{expanded ? '▲' : '▼'}</Text>
      </View>

      {/* expanded detail */}
      {expanded && (
        <View style={row.detail}>
          <View style={row.divider} />

          <Text style={[row.subjectTag, { color: c.accent }]}>
            {item.subjectName.toUpperCase()}
          </Text>

          {/* Question image — uses WebView to support SVG base64 */}
          {item.image ? (
            <ResultQuestionImage imageUri={item.image} />
          ) : null}

          {/* Your answer */}
          <View style={[row.answerChip, notAnswered ? row.skipChip : row.wrongChip]}>
            <Text style={row.answerLabel}>
              {notAnswered ? '⬜ NOT ANSWERED' : `✗  YOUR ANSWER  (${item.studentKey})`}
            </Text>
            <Text style={row.answerText}>{item.studentAnswer}</Text>
          </View>

          {/* Correct answer — only shown if user passed */}
          {passed && item.correctAnswerText ? (
            <View style={row.correctChip}>
              <Text style={row.correctLabel}>✓  CORRECT ANSWER  ({item.correctKey})</Text>
              <Text style={row.correctText}>{item.correctAnswerText}</Text>
            </View>
          ) : !passed ? (
            <TouchableOpacity
              style={row.communityNudge}
              onPress={() => Linking.openURL('https://community.dmsgroups.com.ng')}
              activeOpacity={0.8}
            >
              <Text style={row.communityNudgeText}>
                🔐 Correct answers are unlocked when you pass this bundle.{'\n'}
                Visit PrepStation Community for step-by-step solutions →
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* Explanation — only shown if user passed and explanation exists */}
          {passed && item.explanation ? (
            <View style={row.explanationChip}>
              <Text style={row.explanationLabel}>💡 EXPLANATION</Text>
              <Text style={row.explanationText}>{item.explanation}</Text>
            </View>
          ) : null}

          {/* Community link — always shown at bottom */}
          <TouchableOpacity
            style={s.communityComingSoon}
            onPress={() => Linking.openURL('https://community.dmsgroups.com.ng')}
            activeOpacity={0.8}
          >
            <Text style={s.communityComingSoonText}>🔗 Visit PrepStation Community →</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

const row = StyleSheet.create({
  card:        { backgroundColor: '#1e293b', borderRadius: 10, marginBottom: 8, borderLeftWidth: 4, overflow: 'hidden' },
  top:         { flexDirection: 'row', alignItems: 'flex-start', padding: 12, gap: 10 },
  numBadge:    { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  num:         { fontSize: 11, fontWeight: '900' },
  preview:     { flex: 1, fontSize: 13, color: '#cbd5e1', lineHeight: 18, fontWeight: '500' },
  chevron:     { fontSize: 10, color: '#475569', paddingTop: 2 },
  detail:      { paddingHorizontal: 12, paddingBottom: 12 },
  divider:     { height: 1, backgroundColor: '#334155', marginBottom: 10 },
  subjectTag:  { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginBottom: 8 },
  answerChip:  { borderRadius: 8, padding: 10, marginBottom: 10 },
  wrongChip:   { backgroundColor: '#450a0a', borderWidth: 1, borderColor: '#dc2626' },
  skipChip:    { backgroundColor: '#1c1917', borderWidth: 1, borderColor: '#57534e' },
  answerLabel: { fontSize: 9, fontWeight: '900', color: '#94a3b8', letterSpacing: 1, marginBottom: 4 },
  answerText:  { fontSize: 13, color: '#fca5a5', fontWeight: '600', lineHeight: 18 },
  correctChip:      { backgroundColor: '#052e16', borderRadius: 8, borderWidth: 1, borderColor: '#22c55e', padding: 10, marginBottom: 10 },
  correctLabel:     { fontSize: 9, fontWeight: '900', color: '#4ade80', letterSpacing: 1, marginBottom: 4 },
  correctText:      { fontSize: 13, color: '#86efac', fontWeight: '700', lineHeight: 18 },
  explanationChip:  { backgroundColor: '#0c1a2e', borderRadius: 8, borderWidth: 1, borderColor: '#3b82f6', padding: 10, marginBottom: 10 },
  explanationLabel: { fontSize: 9, fontWeight: '900', color: '#60a5fa', letterSpacing: 1, marginBottom: 4 },
  explanationText:  { fontSize: 13, color: '#bfdbfe', fontWeight: '500', lineHeight: 20 },
  communityNudge:     { backgroundColor: '#1e1b4b', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#4c1d95', marginBottom: 10 },
  communityNudgeText: { fontSize: 12, color: '#c4b5fd', lineHeight: 17 },
});

export default function ResultScreen({ resultPayload, onExit, onSessionComplete }) {
  const insets = useSafeAreaInsets();
  const {
    rawScore,
    penaltyDeduction,
    finalScore,
    totalQ,
    percentage,
    tabSwitchCount,
    bundleName,
    examBody,
    requiredScore,
    wrongAnswers,
    passed,
    completionMeta,
  } = resultPayload;

  useEffect(() => {
    logExamResult({
      subjectId:        resultPayload.subjectId ?? null,
      subjectName:      resultPayload.subjectName ?? 'General Practice',
      examBody:         examBody,
      rawScore:         rawScore,
      finalScore:       finalScore,
      score:            finalScore,
      totalQuestions:   totalQ,
      percentage:       percentage,
      requiredScore:    requiredScore,
      tabSwitchCount:   tabSwitchCount,
      penaltyDeduction: penaltyDeduction,
      bundleName:       bundleName,
      wrongAnswers:     wrongAnswers,
    });
  }, []);

  const handleExit = () => {
    if (typeof onSessionComplete === 'function') {
      onSessionComplete(completionMeta || null);
    }
    onExit();
  };

  const correctCount = totalQ - wrongAnswers.length;

  const bySubject = {};
  wrongAnswers.forEach(w => {
    if (!bySubject[w.subjectName]) bySubject[w.subjectName] = [];
    bySubject[w.subjectName].push(w);
  });

  const subjectNames = Object.keys(bySubject);
  const [activeSubject, setActiveSubject] = useState('ALL');
  const displayedWrong = activeSubject === 'ALL'
    ? wrongAnswers
    : bySubject[activeSubject] || [];

  const globalIndexMap = {};
  wrongAnswers.forEach((w, i) => { globalIndexMap[w.id] = i + 1; });

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {/* FIXED HEADER */}
      <View style={s.header}>
        <View>
          <Text style={s.headerEyebrow}>{examBody}  •  {bundleName}</Text>
          <Text style={s.headerTitle}>RESULT PROFILE</Text>
        </View>
        <TouchableOpacity style={s.exitBtn} onPress={handleExit}>
          <Text style={s.exitBtnText}>
            {passed ? 'Next Bundle →' : 'Retake'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >

        {/* SECTION A: SCORE CARD */}
        <View style={s.scoreCard}>
          <ScoreRing percentage={percentage} passed={passed} />

          <View style={s.statsRow}>
            <View style={s.statCell}>
              <Text style={s.statValue}>{rawScore}</Text>
              <Text style={s.statLabel}>Raw Score</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statCell}>
              <Text style={[s.statValue, { color: penaltyDeduction > 0 ? '#ef4444' : '#64748b' }]}>
                -{penaltyDeduction}
              </Text>
              <Text style={s.statLabel}>Tab Penalty</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statCell}>
              <Text style={[s.statValue, { color: passed ? '#22c55e' : '#f87171' }]}>
                {finalScore}
              </Text>
              <Text style={s.statLabel}>Final / {totalQ}</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statCell}>
              <Text style={s.statValue}>{correctCount}</Text>
              <Text style={s.statLabel}>Correct</Text>
            </View>
          </View>

          <View style={s.thresholdWrap}>
            <View style={s.thresholdTrack}>
              <View style={[
                s.thresholdFill,
                {
                  width: `${Math.min(percentage, 100)}%`,
                  backgroundColor: passed ? '#22c55e' : '#ef4444'
                }
              ]} />
              <View style={[s.thresholdMark, { left: `${requiredScore}%` }]} />
            </View>
            <View style={s.thresholdLabels}>
              <Text style={s.thresholdLabelLeft}>0%</Text>
              <Text style={[s.thresholdLabelPass, { left: `${requiredScore}%` }]}>
                Pass: {requiredScore}%
              </Text>
              <Text style={s.thresholdLabelRight}>100%</Text>
            </View>
          </View>

          <View style={[s.verdictBox, { borderColor: passed ? '#22c55e' : '#ef4444', backgroundColor: passed ? '#052e16' : '#450a0a' }]}>
            <Text style={[s.verdictText, { color: passed ? '#4ade80' : '#f87171' }]}>
              {passed
                ? `🎉 You cleared the ${requiredScore}% threshold. Correct answers and explanations are now unlocked below.`
                : `You need ${requiredScore}% to pass. You scored ${percentage}%. Study the community, then retake.`}
            </Text>
            {tabSwitchCount > 0 && (
              <Text style={s.verdictPenaltyNote}>
                ⚠️ {tabSwitchCount} tab violation{tabSwitchCount > 1 ? 's' : ''} cost you {penaltyDeduction} mark{penaltyDeduction !== 1 ? 's' : ''}.
              </Text>
            )}
          </View>
        </View>

        {/* SECTION B: PASS/FAIL CONTEXT CARD */}
        {passed ? (
          <View style={[s.communityCard, { backgroundColor: '#052e16', borderColor: '#22c55e' }]}>
            <Text style={[s.communityTitle, { color: '#4ade80' }]}>
              🏆 Answers & Explanations Unlocked
            </Text>
            <Text style={[s.communityBody, { color: '#86efac' }]}>
              You passed this bundle. Every question you missed now shows the{' '}
              <Text style={{ fontWeight: '900', color: '#ffffff' }}>correct answer</Text>
              {' '}and a{' '}
              <Text style={{ fontWeight: '900', color: '#ffffff' }}>step-by-step explanation</Text>
              {' '}from the strata file. Tap any question below to expand it.
            </Text>
            <View style={[s.communityDivider, { backgroundColor: '#166534' }]} />
            <Text style={[s.communityBody, { color: '#6ee7b7' }]}>
              For deeper tutor explanations and community discussion, visit PrepStation Community.
            </Text>
            <TouchableOpacity
              style={[s.communityComingSoon, { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)' }]}
              onPress={() => Linking.openURL('https://community.dmsgroups.com.ng')}
              activeOpacity={0.8}
            >
              <Text style={[s.communityComingSoonText, { color: '#4ade80' }]}>
                🔗 Visit PrepStation Community →
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.communityCard}>
            <Text style={s.communityTitle}>🌍 Why no correct answers?</Text>
            <Text style={s.communityBody}>
              Correct answers and expert explanations are{' '}
              <Text style={s.communityAccent}>unlocked only after you pass</Text>
              {' '}this bundle. This ensures you engage deeply, not just memorise letters.
            </Text>
            <View style={s.communityDivider} />
            <Text style={s.communityReasonHeading}>This is intentional:</Text>
            <View style={s.communityReasonList}>
              <View style={s.communityReasonItem}>
                <Text style={s.communityReasonIcon}>🧠</Text>
                <Text style={s.communityReasonText}>
                  <Text style={{ fontWeight: '800', color: '#fbbf24' }}>Memorising answer letters is not understanding.</Text>
                  {' '}Students who only know "the answer is A" without knowing why{' '}
                  <Text style={{ fontWeight: '900', color: '#ef4444' }}>fail standard exams</Text>
                  {' '}like UTME, WAEC, and NECO.
                </Text>
              </View>
              <View style={s.communityReasonItem}>
                <Text style={s.communityReasonIcon}>⚡</Text>
                <Text style={s.communityReasonText}>
                  Pass this bundle, and every wrong answer below will reveal the correct answer and explanation from your strata file.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={s.communityComingSoon}
              onPress={() => Linking.openURL('https://community.dmsgroups.com.ng')}
              activeOpacity={0.8}
            >
              <Text style={s.communityComingSoonText}>🔗 Visit PrepStation Community →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* SECTION C: MISSED QUESTIONS */}
        {wrongAnswers.length > 0 ? (
          <View style={s.wrongSection}>
            <View style={s.wrongSectionHeader}>
              <Text style={s.wrongSectionTitle}>
                {passed ? 'Review Missed Questions' : 'Questions You Missed'}
              </Text>
              <View style={s.wrongSectionCount}>
                <Text style={s.wrongSectionCountText}>
                  {wrongAnswers.length} of {totalQ}
                </Text>
              </View>
            </View>

            {passed && (
              <View style={s.unlockedBanner}>
                <Text style={s.unlockedBannerText}>
                  ✅ Answers & explanations visible — tap any question to expand
                </Text>
              </View>
            )}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.badgeRow}
            >
              {subjectNames.map(name => (
                <SubjectBadge key={name} name={name} count={bySubject[name].length} />
              ))}
            </ScrollView>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.filterTabRow}
            >
              {['ALL', ...subjectNames].map(tab => (
                <TouchableOpacity
                  key={tab}
                  style={[s.filterTab, activeSubject === tab && s.filterTabActive]}
                  onPress={() => setActiveSubject(tab)}
                >
                  <Text style={[s.filterTabText, activeSubject === tab && s.filterTabTextActive]}>
                    {tab === 'ALL' ? `All (${wrongAnswers.length})` : `${tab.split(' ')[0]} (${bySubject[tab].length})`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={s.wrongInstruction}>
              {passed
                ? 'Tap any question to see your answer, the correct answer, and the explanation.'
                : 'Tap any question to see what you chose. Pass this bundle to unlock correct answers.'}
            </Text>

            {displayedWrong.map(item => (
              <WrongRow
                key={item.id}
                item={item}
                globalIndex={globalIndexMap[item.id]}
                passed={passed}
              />
            ))}
          </View>
        ) : (
          <View style={s.perfectCard}>
            <Text style={s.perfectEmoji}>🏆</Text>
            <Text style={s.perfectTitle}>Flawless.</Text>
            <Text style={s.perfectBody}>
              Every single question answered correctly. That is exceptional preparation.
              Move to the next bundle and keep the momentum.
            </Text>
          </View>
        )}

        {/* BOTTOM EXIT BUTTON */}
        <TouchableOpacity
          style={[s.bottomExitBtn, { backgroundColor: passed ? '#16a34a' : '#2563eb' }]}
          onPress={handleExit}
        >
          <Text style={s.bottomExitBtnText}>
            {passed ? '🚀 Unlock Next Bundle & Return' : '🔄 Return to Dashboard & Retake'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: Math.max(insets.bottom + 16, 24) }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#111827', borderBottomWidth: 1, borderColor: '#1e293b',
  },
  headerEyebrow: { fontSize: 9, fontWeight: '800', color: '#475569', letterSpacing: 1.5, textTransform: 'uppercase' },
  headerTitle:   { fontSize: 18, fontWeight: '900', color: '#f8fafc', letterSpacing: 0.5, marginTop: 2 },
  exitBtn:       { backgroundColor: '#1e293b', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: '#334155' },
  exitBtnText:   { fontSize: 12, fontWeight: '800', color: '#94a3b8' },
  scroll: { padding: 16, paddingBottom: 20 },
  scoreCard:   { backgroundColor: '#1e293b', borderRadius: 16, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: '#334155' },
  statsRow:    { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 16 },
  statCell:    { flex: 1, alignItems: 'center' },
  statValue:   { fontSize: 20, fontWeight: '900', color: '#f8fafc' },
  statLabel:   { fontSize: 9, color: '#64748b', fontWeight: '700', marginTop: 2, textTransform: 'uppercase' },
  statDivider: { width: 1, height: 36, backgroundColor: '#334155' },
  thresholdWrap:       { marginBottom: 14 },
  thresholdTrack:      { height: 8, backgroundColor: '#334155', borderRadius: 4, overflow: 'visible', position: 'relative' },
  thresholdFill:       { height: '100%', borderRadius: 4 },
  thresholdMark:       { position: 'absolute', top: -4, width: 2, height: 16, backgroundColor: '#f59e0b', borderRadius: 1 },
  thresholdLabels:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, position: 'relative' },
  thresholdLabelLeft:  { fontSize: 9, color: '#475569', fontWeight: '700' },
  thresholdLabelRight: { fontSize: 9, color: '#475569', fontWeight: '700' },
  thresholdLabelPass:  { position: 'absolute', fontSize: 9, color: '#f59e0b', fontWeight: '900', transform: [{ translateX: -18 }] },
  verdictBox:        { borderRadius: 10, borderWidth: 1, padding: 12 },
  verdictText:       { fontSize: 13, fontWeight: '700', lineHeight: 19 },
  verdictPenaltyNote: { fontSize: 11, color: '#fca5a5', marginTop: 6, fontWeight: '600' },
  communityCard:          { backgroundColor: '#1e1b4b', borderRadius: 16, padding: 20, marginBottom: 14, borderWidth: 1.5, borderColor: '#4c1d95' },
  communityTitle:         { fontSize: 16, fontWeight: '900', color: '#c4b5fd', marginBottom: 10 },
  communityBody:          { fontSize: 13, color: '#ddd6fe', lineHeight: 19 },
  communityAccent:        { color: '#a78bfa', fontWeight: '900' },
  communityDivider:       { height: 1, backgroundColor: '#4c1d95', marginVertical: 14 },
  communityReasonHeading: { fontSize: 12, fontWeight: '800', color: '#a78bfa', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  communityReasonList:    { gap: 12 },
  communityReasonItem:    { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  communityReasonIcon:    { fontSize: 18, marginTop: 1 },
  communityReasonText:    { flex: 1, fontSize: 13, color: '#ddd6fe', lineHeight: 19 },
  communityComingSoon:    { marginTop: 16, backgroundColor: 'rgba(167,139,250,0.12)', borderRadius: 20, paddingVertical: 9, paddingHorizontal: 16, borderWidth: 1, borderColor: '#7c3aed', alignItems: 'center' },
  communityComingSoonText: { color: '#a78bfa', fontSize: 12, fontWeight: '800' },
  wrongSection:       { marginBottom: 14 },
  wrongSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  wrongSectionTitle:  { fontSize: 16, fontWeight: '900', color: '#f8fafc' },
  wrongSectionCount:  { backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  wrongSectionCountText: { fontSize: 11, color: '#fff', fontWeight: '900' },
  unlockedBanner: { backgroundColor: '#052e16', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#22c55e', alignItems: 'center' },
  unlockedBannerText: { fontSize: 12, color: '#4ade80', fontWeight: '700' },
  badgeRow:    { gap: 8, paddingBottom: 12, flexDirection: 'row' },
  filterTabRow: { gap: 8, paddingBottom: 12, flexDirection: 'row' },
  filterTab:   { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  filterTabActive: { backgroundColor: '#2563eb', borderColor: '#1d4ed8' },
  filterTabText:   { fontSize: 11, fontWeight: '700', color: '#64748b' },
  filterTabTextActive: { color: '#ffffff' },
  wrongInstruction: { fontSize: 11, color: '#475569', marginBottom: 12, fontWeight: '600', fontStyle: 'italic' },
  perfectCard:  { backgroundColor: '#052e16', borderRadius: 16, padding: 28, alignItems: 'center', marginBottom: 14, borderWidth: 1.5, borderColor: '#22c55e' },
  perfectEmoji: { fontSize: 48, marginBottom: 10 },
  perfectTitle: { fontSize: 26, fontWeight: '900', color: '#22c55e', marginBottom: 6 },
  perfectBody:  { fontSize: 13, color: '#6ee7b7', textAlign: 'center', lineHeight: 20 },
  bottomExitBtn:     { paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  bottomExitBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
});