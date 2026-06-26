import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  Dimensions,
  AppState,
  Modal
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logExamResult } from '../database/queries';
import { WebView } from 'react-native-webview';
import { katexCSS, katexJS, autoRenderJS } from '../../assets/katex/katex-bundle';
import ResultScreen from './ResultScreen'; 
// ─────────────────────────────────────────────────────────────────────────────
// MATH RENDERING SETUP — Pure JS, works in Expo Go
// Install:  npx expo install react-native-webview
// ─────────────────────────────────────────────────────────────────────────────

const { width } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// RAW TEXT → LaTeX NORMALISER
//
// Converts plain-text math notation from your JSON questions into proper
// LaTeX so KaTeX can render it beautifully.
//
// Handles:
//   Superscripts    x^2        →  x^{2}
//   Subscripts      H_2O       →  H_{2}O
//   Fractions       a/b        →  \frac{a}{b}   (only inside math tokens)
//   Square roots    √(...)     →  \sqrt{...}
//   Greek letters   π α β γ δ θ λ μ Ω Σ
//   ± × ÷ ≤ ≥ ≠ ∞ ∑ ∫
//   Chemical arrow  →          →  \rightarrow
//   Degree symbol   °          →  ^{\circ}
//   Subscript nums  CO2 H2O    →  CO_{2}  H_{2}O
// ─────────────────────────────────────────────────────────────────────────────
function toLatex(raw) {
  if (!raw) return '';
  let s = raw;

  // Greek & special symbols
  const symbolMap = {
    'π': '\\pi',
    'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta',
    'θ': '\\theta', 'λ': '\\lambda', 'μ': '\\mu', 'σ': '\\sigma',
    'Ω': '\\Omega', 'Σ': '\\Sigma', 'Δ': '\\Delta',
    '±': '\\pm', '×': '\\times', '÷': '\\div',
    '≤': '\\leq', '≥': '\\geq', '≠': '\\neq',
    '∞': '\\infty', '∑': '\\sum', '∫': '\\int',
    '√': '\\sqrt',
    '°': '^{\\circ}',
    '→': '\\rightarrow',
    '⁻': '^{-}',
  };
  Object.entries(symbolMap).forEach(([sym, latex]) => {
    s = s.split(sym).join(latex);
  });

  // Superscripts written as ^2, ^3, ^n  → ^{2}, ^{3}, ^{n}
  // Only wrap if not already wrapped
  s = s.replace(/\^(\w+)/g, (_, exp) => `^{${exp}}`);

  // Explicit subscripts written as _2, _n → _{2}, _{n}
  s = s.replace(/_(\w+)/g, (_, sub) => `_{${sub}}`);

  // Chemical / scientific subscript numbers:
  // Letters immediately followed by digits  e.g. CO2 H2SO4 NH3 C6H12O6
  // Only when the letter is uppercase (element symbol) or a known pattern
  s = s.replace(/([A-Za-z])(\d+)/g, (_, letter, digits) => `${letter}_{${digits}}`);

  // sqrt with parentheses  \sqrt(expr)  → \sqrt{expr}
  s = s.replace(/\\sqrt\(([^)]+)\)/g, (_, inner) => `\\sqrt{${inner}}`);

  // Simple inline fractions  a/b  — only when surrounded by math tokens
  // Avoid converting things like "3/4 of students" (prose text)
  // We only convert when both sides are purely numeric/algebraic
  s = s.replace(/([A-Za-z0-9\}]+)\/([A-Za-z0-9\{][A-Za-z0-9\{\}]*)/g, (match, num, den) => {
    // Skip if it looks like a URL or file path
    if (match.includes('://')) return match;
    return `\\frac{${num}}{${den}}`;
  });

  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEGMENT PARSER
//
// Splits a question/option string into alternating plain-text and math
// segments.  A math segment is anything between $...$ or $$...$$, OR any
// token that contains a known math indicator (^, _, \, digits after letters,
// special symbols already converted to \-commands, etc.).
//
// Strategy:
//   1. If the author wrapped content in $...$ / $$...$$ → use as-is.
//   2. Otherwise auto-detect "math-looking" tokens by splitting on spaces and
//      checking each word.
// ─────────────────────────────────────────────────────────────────────────────
const MATH_TOKEN_RE = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;

// Heuristic: does this word look like it contains math?
function looksLikeMath(word) {
  // Already a LaTeX command
  if (/\\[a-zA-Z]/.test(word)) return true;
  // Contains superscript or subscript markers
  if (/[\^_{}]/.test(word)) return true;
  // Pure number or simple decimal
  if (/^-?\d+(\.\d+)?$/.test(word)) return false; // plain number → keep as text
  // Letter(s) followed by digit(s) — chemical/algebraic
  if (/[A-Za-z]\d/.test(word)) return true;
  // Fraction pattern
  if (/\d+\/\d+/.test(word)) return true;
  // Contains math operators that were converted
  if (/\\(frac|sqrt|pm|times|div|leq|geq|neq|infty|sum|int|pi|alpha|rightarrow)/.test(word)) return true;
  return false;
}

function parseSegments(rawText) {
  if (!rawText) return [{ type: 'text', content: '' }];

  const preprocessed = toLatex(rawText);

  // If explicit $ delimiters exist, use them
  if (MATH_TOKEN_RE.test(preprocessed)) {
    MATH_TOKEN_RE.lastIndex = 0;
    const parts = [];
    let lastIndex = 0;
    let match;
    MATH_TOKEN_RE.lastIndex = 0;
    while ((match = MATH_TOKEN_RE.exec(preprocessed)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: preprocessed.slice(lastIndex, match.index) });
      }
      const inner = match[0].replace(/^\$+|\$+$/g, '').trim();
      parts.push({ type: 'math', content: inner });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < preprocessed.length) {
      parts.push({ type: 'text', content: preprocessed.slice(lastIndex) });
    }
    return parts;
  }

  // Auto-detect: split into words, group consecutive math words
  const words = preprocessed.split(/(\s+)/);
  const segments = [];
  let currentText = '';
  let currentMath = '';

  words.forEach((word) => {
    const isSpace = /^\s+$/.test(word);
    if (isSpace) {
      if (currentMath) { currentMath += ' '; }
      else { currentText += word; }
      return;
    }

    if (looksLikeMath(word)) {
      if (currentText.trim()) {
        segments.push({ type: 'text', content: currentText });
        currentText = '';
      }
      currentMath += (currentMath ? ' ' : '') + word;
    } else {
      if (currentMath.trim()) {
        segments.push({ type: 'math', content: currentMath.trim() });
        currentMath = '';
      }
      currentText += (currentText ? ' ' : '') + word;
    }
  });

  if (currentMath.trim()) segments.push({ type: 'math', content: currentMath.trim() });
  if (currentText.trim()) segments.push({ type: 'text', content: currentText.trim() });

  return segments.length > 0 ? segments : [{ type: 'text', content: preprocessed }];
}

// ─────────────────────────────────────────────────────────────────────────────
// KaTeX WebView Renderer
//
// Renders a full question/option string (which may contain math) inside a
// lightweight WebView that loads KaTeX from CDN.
// Works in Expo Go — no native rebuild needed.
// ─────────────────────────────────────────────────────────────────────────────

// Build the KaTeX HTML page for a given LaTeX string
function buildKatexHtml(latex, fontSize, color) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <style>${katexCSS}</style>
  <script>${katexJS}</script>
  <script>${autoRenderJS}</script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, sans-serif;
      font-size: ${fontSize}px;
      color: ${color};
      background: transparent;
      line-height: 1.6;
      padding: 2px 0;
      word-break: break-word;
    }
    .katex { font-size: 1em; }
    .katex-display { margin: 4px 0; }
  </style>
</head>
<body>
  <span id="content"></span>
  <script>
    document.getElementById('content').textContent = ${JSON.stringify(latex)};
    renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$',  right: '$',  display: false },
        { left: '\\\\(', right: '\\\\)', display: false },
        { left: '\\\\[', right: '\\\\]', display: true }
      ],
      throwOnError: false
    });
    function sendHeight() {
      const h = document.body.scrollHeight;
      window.ReactNativeWebView.postMessage(String(h));
    }
    window.addEventListener('load', sendHeight);
    setTimeout(sendHeight, 300);
  </script>
</body>
</html>`;
}

// MathText — auto-sizes its WebView to content height
function MathText({ text, textStyle, containerStyle }) {
  const [webHeight, setWebHeight] = useState(30);

  const segments = parseSegments(text || '');
  const hasMath = segments.some(s => s.type === 'math');

  // Extract style values with safe defaults
  const fontSize = StyleSheet.flatten(textStyle)?.fontSize || 15;
  const color    = StyleSheet.flatten(textStyle)?.color    || '#0f172a';

  // Pure text — no WebView overhead
  if (!hasMath) {
    return <Text style={textStyle}>{text}</Text>;
  }

  // Reconstruct the string with $...$ delimiters around math segments
  const marked = segments.map(seg =>
    seg.type === 'math' ? `$${seg.content}$` : seg.content
  ).join('');

  const html = buildKatexHtml(marked, fontSize, color);

  return (
    <View style={[{ width: '100%', height: webHeight }, containerStyle]}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        onMessage={(e) => {
          const h = parseInt(e.nativeEvent.data, 10);
          if (!isNaN(h) && h > 0) setWebHeight(h + 4);
        }}
        style={{ backgroundColor: 'transparent', flex: 1 }}
        // Needed for transparent bg on Android
        androidLayerType="software"
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function PracticeScreen({ sessionPayload, onExit }) {
  const insets = useSafeAreaInsets();
  const { questions, mode, timeAllowed, subjectMeta, subjectPartitions = [] } = sessionPayload;

  const SUBJECT_ABBREVIATIONS = {
    'Use of English': 'ENG',
    'English Language': 'ENG',
    'Mathematics': 'MATH',
    'Further Mathematics': 'F-MATH',
    'Physics': 'PHY',
    'Chemistry': 'CHM',
    'Biology': 'BIO',
    'Agricultural Science': 'AGRIC',
    'Geography': 'GEO',
    'Economics': 'ECON',
    'Government': 'GOV',
    'Literature in English': 'LIT',
    'Christian Religious Studies (CRS)': 'CRS',
    'Islamic Religious Studies (IRS)': 'IRS',
    'Commerce': 'COM',
    'Accounting': 'ACCT',
    'French': 'FRN',
    'Yoruba': 'YOR',
    'Igbo': 'IGB',
    'Hausa': 'HAU',
  };

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [revealedAnswers, setRevealedAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(timeAllowed);
  const [showGridMenu, setShowGridMenu] = useState(false);
  const [activeSubjectIdx, setActiveSubjectIdx] = useState(0);

  const timerRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [penaltyPoints, setPenaltyPoints] = useState(0);
  const PENALTY_PER_SWITCH = 10;
  const [testStarted, setTestStarted] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(true);
  const [resultPayload, setResultPayload] = useState(null);

  const activePartition = subjectPartitions[activeSubjectIdx];
  const filteredQuestions = activePartition
    ? questions.slice(activePartition.startIndex, activePartition.endIndex + 1)
    : questions;
  const currentQuestion = filteredQuestions[currentIndex] || {};
  const isTimed = timeAllowed > 0;

  const handleSubjectTabPress = (idx) => {
    setActiveSubjectIdx(idx);
    setCurrentIndex(0);
    setShowGridMenu(false);
  };

  // Countdown timer
  useEffect(() => {
    if (isTimed) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            handleAutoSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isTimed]);
  useEffect(() => {
    if (!testStarted) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (
        appStateRef.current === 'active' &&
        (nextState === 'background' || nextState === 'inactive')
      ) {
        setTabSwitchCount(prev => {
          const newCount = prev + 1;
          const newPenalty = newCount * PENALTY_PER_SWITCH;
          setPenaltyPoints(newPenalty);
          Alert.alert(
            '⚠️ Tab Switch Detected!',
            `You left the exam screen.\n\nPenalty applied: ${PENALTY_PER_SWITCH} marks\nTotal penalty so far: ${newPenalty} marks\n\nReturn to the exam immediately.`
          );
          return newCount;
        });
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, [testStarted]);
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSelectOption = (chosenKey) => {
    if (mode === 'PRACTICE' && revealedAnswers[currentQuestion.id]) return;
    setSelectedAnswers({ ...selectedAnswers, [currentQuestion.id]: chosenKey });
  };

  const handleRevealAnswer = () => {
    if (!selectedAnswers[currentQuestion.id]) {
      Alert.alert("Selection Required", "Please select an option before checking the answer code key.");
      return;
    }
    setRevealedAnswers({ ...revealedAnswers, [currentQuestion.id]: true });
  };

  const calculateScore = () => {
    let score = 0;
    questions.forEach((q) => {
      if (selectedAnswers[q.id] === q.correct_option) score++;
    });
    const penaltyDeduction = Math.round(score * (tabSwitchCount * 0.10));
    return Math.max(0, score - penaltyDeduction);
  };

  const buildWrongAnswers = () => {
    return questions
      .filter(q => selectedAnswers[q.id] !== q.correct_option)
      .map(q => {
        // Find which subject partition this question belongs to
        const qGlobalIndex = questions.indexOf(q);
        const partition = subjectPartitions.find(
          p => qGlobalIndex >= p.startIndex && qGlobalIndex <= p.endIndex
        );
        const studentKey = selectedAnswers[q.id] || null;
  
        const getOptionText = key => {
          if (!key) return 'Not answered';
          const map = { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d };
          return map[key] || key;
        };
  
        return {
          id:           q.id,
          questionText: q.question_text,
          subjectName:  partition?.subjectName || subjectMeta.name,
          studentKey,
          studentAnswer: getOptionText(studentKey),
          // ← correct answer deliberately omitted here
        };
      });
  };
  

  const handleAutoSubmit = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
  
    let rawScore = 0;
    questions.forEach(q => {
      if (selectedAnswers[q.id] === q.correct_option) rawScore++;
    });
    const penaltyDeduction = Math.round(rawScore * (tabSwitchCount * 0.10));
    const finalScore       = Math.max(0, rawScore - penaltyDeduction);
    const totalQ           = questions.length;
    const percentage       = Math.round((finalScore / totalQ) * 100);
  
    const wrongAnswers = buildWrongAnswers();
  
    // FIX: Combined into a single uniform object signature
    await logExamResult({
      subjectId: subjectMeta.id,
      subjectName: subjectMeta.name,
      examBody: subjectMeta.exam_body,
      score: rawScore,
      totalQuestions: totalQ,
      finalScore,
      rawScore,
      percentage,
      requiredScore: sessionPayload.requiredScore || 70,
      tabSwitchCount,
      bundleName: subjectMeta.name,
      penaltyDeduction,
      wrongAnswers,
    });
  
    setResultPayload({
      rawScore,
      penaltyDeduction,
      finalScore,
      totalQ,
      percentage,
      tabSwitchCount,
      bundleName:    subjectMeta.name,
      examBody:      subjectMeta.exam_body || 'EXAM',
      requiredScore: sessionPayload.requiredScore || 70,
      wrongAnswers,
    });
  };

  const handleManualSubmit = () => {
    const unansweredCount = questions.length - Object.keys(selectedAnswers).length;
    let warningMsg = 'Are you sure you want to end this examination session?';
    if (unansweredCount > 0)
      warningMsg += ` You have ${unansweredCount} unanswered question${unansweredCount > 1 ? 's' : ''}.`;
  
    Alert.alert('Submit Examination', warningMsg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Submit Sheet',
        onPress: async () => {
          if (timerRef.current) clearInterval(timerRef.current);
  
          let rawScore = 0;
          questions.forEach(q => {
            if (selectedAnswers[q.id] === q.correct_option) rawScore++;
          });
          const penaltyDeduction = Math.round(rawScore * (tabSwitchCount * 0.10));
          const finalScore       = Math.max(0, rawScore - penaltyDeduction);
          const totalQ           = questions.length;
          const percentage       = Math.round((finalScore / totalQ) * 100);
  
          const wrongAnswers = buildWrongAnswers();
  
          // FIX: Combined into a single uniform object signature
          await logExamResult({
            subjectId: subjectMeta.id,
            subjectName: subjectMeta.name,
            examBody: subjectMeta.exam_body,
            score: rawScore,
            totalQuestions: totalQ,
            finalScore,
            rawScore,
            percentage,
            requiredScore: sessionPayload.requiredScore || 70,
            tabSwitchCount,
            bundleName: subjectMeta.name,
            penaltyDeduction,
            wrongAnswers,
          });
  
          setResultPayload({
            rawScore,
            penaltyDeduction,
            finalScore,
            totalQ,
            percentage,
            tabSwitchCount,
            bundleName:    subjectMeta.name,
            examBody:      subjectMeta.exam_body || 'EXAM',
            requiredScore: sessionPayload.requiredScore || 70,
            wrongAnswers,
          });
        },
      },
    ]);
  };
  

  const handleExitPrematurely = () => {
    Alert.alert(
      "Exit Workspace",
      "Discard this session? Your current progress and metrics will not be logged.",
      [
        { text: "Continue Testing", style: "cancel" },
        { text: "Exit & Discard", style: "destructive", onPress: onExit }
      ]
    );
  };

  const currentSelection = selectedAnswers[currentQuestion.id];
  const isCurrentRevealed = revealedAnswers[currentQuestion.id];

  const optionMapping = currentQuestion.shuffledOptions?.length
    ? currentQuestion.shuffledOptions
    : [
        { key: 'A', text: currentQuestion.option_a },
        { key: 'B', text: currentQuestion.option_b },
        { key: 'C', text: currentQuestion.option_c },
        { key: 'D', text: currentQuestion.option_d },
      ].filter(opt => opt.text != null);


      if (resultPayload) {
        return (
          <ResultScreen
            resultPayload={resultPayload}
            onExit={onExit}
          />
        );
      }
      return (

        
        <View style={[styles.container, { paddingTop: insets.top }]}>
    
          {/* ── PRE-TEST WARNING MODAL ── */}
          <Modal visible={showWarningModal} transparent animationType="fade">
            <View style={styles.warningOverlay}>
              <View style={styles.warningCard}>
                <Text style={styles.warningTitle}>⚠️ EXAM RULES</Text>
                <Text style={styles.warningBody}>
                  {`Before you begin, note the following:\n\n`}
                  {`🚫 Do NOT minimize this app\n`}
                  {`🚫 Do NOT press the Home button\n`}
                  {`🚫 Do NOT switch to another app\n`}
                  {`🚫 Do NOT allow app overlays\n\n`}
                  {`Every tab switch or screen exit will attract a `}
                  <Text style={{ fontWeight: '900', color: '#dc2626' }}>10-mark penalty</Text>
                  {`, deducted from your final score.\n\nPenalties accumulate for every violation.`}
                </Text>
                <TouchableOpacity
                  style={styles.warningAcceptBtn}
                  onPress={() => {
                    setShowWarningModal(false);
                    setTestStarted(true);
                  }}
                >
                  <Text style={styles.warningAcceptText}>I Understand — Begin Exam</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

      {/* ── PENALTY BANNER ── */}
      {penaltyPoints > 0 && (
        <View style={styles.penaltyBanner}>
          <Text style={styles.penaltyBannerText}>
          🚨 TAB VIOLATIONS: {tabSwitchCount}x  |  PENALTY: -{tabSwitchCount * 10}% of earned score
          </Text>
        </View>
      )}

      {/* 1. Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={handleExitPrematurely}>
          <Text style={styles.closeBtnText}>✕ Close</Text>
        </TouchableOpacity>
        <View style={styles.metaHeaderInfo}>
          <Text style={styles.subjectText} numberOfLines={1}>{subjectMeta.name}</Text>
          <Text style={styles.modeIndicatorTag}>{mode}</Text>
        </View>
        {isTimed ? (
          <View style={[styles.timerBox, timeLeft < 60 && styles.timerUrgent]}>
            <Text style={[styles.timerText, timeLeft < 60 && styles.timerTextUrgent]}>
              ⏳ {formatTime(timeLeft)}
            </Text>
          </View>
        ) : (
          <View style={styles.practiceBox}>
            <Text style={styles.practiceText}>∞ Untimed</Text>
          </View>
        )}
      </View>

      {/* Subject tabs */}
      {subjectPartitions.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.subjectTabBar}
          contentContainerStyle={styles.subjectTabBarContent}
        >
          {subjectPartitions.map((partition, idx) => {
            const isActive = activeSubjectIdx === idx;
            return (
              <TouchableOpacity
                key={idx}
                style={[styles.subjectTab, isActive && styles.subjectTabActive]}
                onPress={() => handleSubjectTabPress(idx)}
              >
                <Text style={[styles.subjectTabText, isActive && styles.subjectTabTextActive]}>
                  {SUBJECT_ABBREVIATIONS[partition.subjectName] || partition.subjectName.slice(0, 5).toUpperCase()}
                </Text>
                <Text style={[styles.subjectTabCount, isActive && styles.subjectTabCountActive]}>
                  {partition.totalQuestions}Q
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* 2. Question workspace */}
      <ScrollView contentContainerStyle={styles.questionWorkspace} showsVerticalScrollIndicator={false}>
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>
            Question {currentIndex + 1} of {filteredQuestions.length}
          </Text>
          <TouchableOpacity style={styles.gridToggleButton} onPress={() => setShowGridMenu(!showGridMenu)}>
            <Text style={styles.gridToggleText}>📂 Matrix Map</Text>
          </TouchableOpacity>
        </View>

        {/* ── Question Card with MathText ── */}
        <View style={styles.questionCard}>
          <MathText
            text={currentQuestion.question_text}
            textStyle={styles.questionBodyText}
          />
        </View>

        {/* ── Answer Options ── */}
        <View style={styles.optionsWrapper}>
          {optionMapping.map((opt) => {
            const isSelected = currentSelection === opt.key;
            let customCardStyle = isSelected ? styles.selectedOptionCard : null;
            let customTextStyle = isSelected ? styles.selectedOptionText : null;

            if (mode === 'PRACTICE' && isCurrentRevealed) {
              if (opt.key === currentQuestion.correct_option) {
                customCardStyle = styles.correctOptionCard;
                customTextStyle = styles.correctOptionText;
              } else if (isSelected) {
                customCardStyle = styles.wrongOptionCard;
                customTextStyle = styles.wrongOptionText;
              }
            }

            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.optionCard, customCardStyle]}
                onPress={() => handleSelectOption(opt.key)}
                activeOpacity={0.7}
              >
                <View style={[styles.bulletIndicator, isSelected && styles.bulletSelected]}>
                  <Text style={[styles.bulletText, isSelected && styles.bulletTextSelected]}>
                    {opt.key}
                  </Text>
                </View>

                {/* ── Option text rendered with MathText ── */}
                <MathText
                  text={opt.text}
                  textStyle={[styles.optionBodyText, customTextStyle]}
                  containerStyle={{ flex: 1 }}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Explanation block */}
        {mode === 'PRACTICE' && isCurrentRevealed && currentQuestion.explanation && (
          <View style={styles.explanationBlock}>
            <Text style={styles.explanationTitle}>💡 Architectural Review Insight:</Text>
            <MathText
              text={currentQuestion.explanation}
              textStyle={styles.explanationText}
            />
          </View>
        )}
      </ScrollView>

      {/* 3. Grid overlay */}
      {showGridMenu && (
        <View style={[styles.gridOverlay, { top: 65 + insets.top }]}>
          <Text style={styles.gridMenuHeading}>Jump to Question Profile:</Text>
          <ScrollView contentContainerStyle={styles.gridMatrixLayout} horizontal={false}>
            {filteredQuestions.map((q, idx) => {
              const isAnswered = !!selectedAnswers[q.id];
              const isCurrent = idx === currentIndex;
              return (
                <TouchableOpacity
                  key={q.id}
                  style={[
                    styles.gridChip,
                    isAnswered && styles.gridChipAnswered,
                    isCurrent && styles.gridChipCurrent
                  ]}
                  onPress={() => { setCurrentIndex(idx); setShowGridMenu(false); }}
                >
                  <Text style={[
                    styles.gridChipText,
                    isAnswered && styles.gridChipTextAnswered,
                    isCurrent && styles.gridChipTextCurrent
                  ]}>
                    {idx + 1}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* 4. Footer */}
      <View style={[styles.footerToolbar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.footerNavRow}>
          <TouchableOpacity
            style={[styles.navBtn, currentIndex === 0 && styles.disabledNavBtn]}
            disabled={currentIndex === 0}
            onPress={() => { setCurrentIndex(currentIndex - 1); setShowGridMenu(false); }}
          >
            <Text style={styles.navBtnText}>◀ Back</Text>
          </TouchableOpacity>

          {mode === 'PRACTICE' && !isCurrentRevealed ? (
            <TouchableOpacity style={styles.actionVerificationBtn} onPress={handleRevealAnswer}>
              <Text style={styles.actionVerificationText}>Check Answer</Text>
            </TouchableOpacity>
          ) : currentIndex === filteredQuestions.length - 1 ? (
            <TouchableOpacity style={styles.submitExamBtn} onPress={handleManualSubmit}>
              <Text style={styles.submitExamText}>Submit Paper</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => { setCurrentIndex(currentIndex + 1); setShowGridMenu(false); }}
            >
              <Text style={styles.navBtnText}>Next ▶</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },

  // Header
  header: { height: 65, backgroundColor: '#ffffff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  closeBtn: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#fee2e2', borderRadius: 6 },
  closeBtnText: { fontSize: 13, fontWeight: '700', color: '#dc2626' },
  metaHeaderInfo: { flex: 1, alignItems: 'center', paddingHorizontal: 10 },
  subjectText: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  modeIndicatorTag: { fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginTop: 1 },
  timerBox: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#f0fdf4', borderRadius: 6, borderWidth: 1, borderColor: '#bbf7d0' },
  timerUrgent: { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  timerText: { fontSize: 14, fontWeight: '700', color: '#16a34a', fontFamily: 'monospace' },
  timerTextUrgent: { color: '#dc2626' },
  practiceBox: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#eff6ff', borderRadius: 6 },
  practiceText: { fontSize: 13, fontWeight: '700', color: '#2563eb' },

  // Subject tabs
  subjectTabBar: { backgroundColor: '#1e293b', borderBottomWidth: 1, borderColor: '#334155' },
  subjectTabBarContent: { paddingHorizontal: 10, paddingVertical: 6, gap: 8, flexDirection: 'row' },
  subjectTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#334155', alignItems: 'center', minWidth: 60 },
  subjectTabActive: { backgroundColor: '#2563eb' },
  subjectTabText: { fontSize: 11, fontWeight: '800', color: '#94a3b8' },
  subjectTabTextActive: { color: '#ffffff' },
  subjectTabCount: { fontSize: 9, fontWeight: '600', color: '#64748b', marginTop: 1 },
  subjectTabCountActive: { color: '#bfdbfe' },

  // Workspace
  questionWorkspace: { padding: 16, paddingBottom: 120 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  progressText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  gridToggleButton: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#ffffff', borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1' },
  gridToggleText: { fontSize: 12, fontWeight: '700', color: '#475569' },

  // Question card
  questionCard: { backgroundColor: '#ffffff', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16, elevation: 1 },
  questionBodyText: { fontSize: 16, fontWeight: '500', color: '#0f172a', lineHeight: 26 },
  // Options
  optionsWrapper: { gap: 10 },
  optionCard: { backgroundColor: '#ffffff', padding: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  selectedOptionCard: { backgroundColor: '#eff6ff', borderColor: '#3b82f6', borderWidth: 1.5 },
  correctOptionCard: { backgroundColor: '#f0fdf4', borderColor: '#22c55e', borderWidth: 1.5 },
  wrongOptionCard: { backgroundColor: '#fef2f2', borderColor: '#ef4444', borderWidth: 1.5 },
  bulletIndicator: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: '#cbd5e1' },
  bulletSelected: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  bulletText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  bulletTextSelected: { color: '#ffffff' },
  optionBodyText: { fontSize: 14, fontWeight: '600', color: '#334155', lineHeight: 22 },
  selectedOptionText: { color: '#1e40af' },
  correctOptionText: { color: '#166534' },
  wrongOptionText: { color: '#991b1b' },
  // Grid overlay
  explanationBlock: { marginTop: 20, backgroundColor: '#f8fafc', padding: 16, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4, borderLeftColor: '#3b82f6' },
  explanationTitle: { fontSize: 13, fontWeight: '700', color: '#1e40af', marginBottom: 6 },
  explanationText: { fontSize: 13, color: '#475569', lineHeight: 20 },
  // Grid overlay
  gridOverlay: { position: 'absolute', left: 0, right: 0, bottom: 80, backgroundColor: '#ffffff', padding: 16, borderBottomWidth: 2, borderColor: '#cbd5e1', zIndex: 99, maxHeight: 255 },
  gridMenuHeading: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 12, textTransform: 'uppercase' },
  gridMatrixLayout: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 10 },
  gridChip: { width: 42, height: 42, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1' },
  gridChipAnswered: { backgroundColor: '#cbd5e1', borderColor: '#94a3b8' },
  gridChipCurrent: { backgroundColor: '#2563eb', borderColor: '#1d4ed8' },
  gridChipText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  gridChipTextAnswered: { color: '#1e293b' },
  gridChipTextCurrent: { color: '#ffffff' },

  // Footer
  footerToolbar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderColor: '#e2e8f0' },
  footerNavRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  navBtn: { flex: 1, backgroundColor: '#475569', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  disabledNavBtn: { opacity: 0.35 },
  navBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  actionVerificationBtn: { flex: 1.2, backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  actionVerificationText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  submitExamBtn: { flex: 1.2, backgroundColor: '#10b981', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  submitExamText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },

  // Warning modal
  warningOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  warningCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380 },
  warningTitle: { fontSize: 20, fontWeight: '900', color: '#dc2626', textAlign: 'center', marginBottom: 16 },
  warningBody: { fontSize: 13, color: '#1e293b', lineHeight: 22, marginBottom: 20 },
  warningAcceptBtn: { backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  warningAcceptText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },

  // Penalty banner
  penaltyBanner: { backgroundColor: '#dc2626', paddingVertical: 6, paddingHorizontal: 16, alignItems: 'center' },
  penaltyBannerText: { color: '#ffffff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
});

