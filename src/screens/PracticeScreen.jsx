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
  Modal,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logExamResult } from '../database/queries';
import { WebView } from 'react-native-webview';
import { katexCSS, katexJS, autoRenderJS } from '../../assets/katex/katex-bundle';
import ResultScreen from './ResultScreen'; 
import { applyBundleCompletionToStorage } from './HomeScreen';
const { width } = Dimensions.get('window');

function toLatex(raw) {
  if (!raw) return '';
  let s = raw;
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
  s = s.replace(/\^(\w+)/g, (_, exp) => `^{${exp}}`);
  s = s.replace(/_(\w+)/g, (_, sub) => `_{${sub}}`);
  s = s.replace(/([A-Za-z])(\d+)/g, (_, letter, digits) => `${letter}_{${digits}}`);
  s = s.replace(/\\sqrt\(([^)]+)\)/g, (_, inner) => `\\sqrt{${inner}}`);
  s = s.replace(/([A-Za-z0-9\}]+)\/([A-Za-z0-9\{][A-Za-z0-9\{\}]*)/g, (match, num, den) => {
    if (match.includes('://')) return match;
    return `\\frac{${num}}{${den}}`;
  });
  return s;
}

const MATH_TOKEN_RE = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;

function looksLikeMath(word) {
  if (/\\[a-zA-Z]/.test(word)) return true;
  if (/[\^_{}]/.test(word)) return true;
  if (/^-?\d+(\.\d+)?$/.test(word)) return false;
  if (/[A-Za-z]\d/.test(word)) return true;
  if (/\d+\/\d+/.test(word)) return true;
  if (/\\(frac|sqrt|pm|times|div|leq|geq|neq|infty|sum|int|pi|alpha|rightarrow)/.test(word)) return true;
  return false;
}

function parseSegments(rawText) {
  if (!rawText) return [{ type: 'text', content: '' }];
  const preprocessed = toLatex(rawText);
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

function MathText({ text, textStyle, containerStyle }) {
  const [webHeight, setWebHeight] = useState(30);
  const segments = parseSegments(text || '');
  const hasMath = segments.some(s => s.type === 'math');
  const fontSize = StyleSheet.flatten(textStyle)?.fontSize || 15;
  const color    = StyleSheet.flatten(textStyle)?.color    || '#0f172a';
  if (!hasMath) {
    return <Text style={textStyle}>{text}</Text>;
  }
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
        androidLayerType="software"
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QuestionImage — renders base64 images including SVG via WebView
// React Native's <Image> does not support SVG base64, so we use WebView
// for all question images regardless of format.
// ─────────────────────────────────────────────────────────────────────────────
function QuestionImage({ imageUri }) {
  const [imgHeight, setImgHeight] = useState(220);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; background: transparent; }
    img, svg-wrapper {
      width: 100%;
      height: auto;
      display: block;
    }
    img {
      max-width: 100%;
      object-fit: contain;
    }
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
    <View style={{ width: '100%', height: imgHeight, marginBottom: 14, borderRadius: 8, overflow: 'hidden', backgroundColor: '#f1f5f9' }}>
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

export default function PracticeScreen({ sessionPayload, onExit }) {
  const insets = useSafeAreaInsets();
  const {
    questions,
    mode,
    timeAllowed,
    subjectMeta,
    subjectPartitions = [],
    bundleId,
    requiredScore,
    examCategory,
    onBundleComplete,
  } = sessionPayload;

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

  const [showCalculator, setShowCalculator] = useState(false);
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcExpression, setCalcExpression] = useState('');
  const [calcJustEvaluated, setCalcJustEvaluated] = useState(false);
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

  const buildWrongAnswers = () => {
    return questions
      .filter(q => selectedAnswers[q.id] !== q.correct_option)
      .map(q => {
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
          id:                q.id,
          questionText:      q.question_text,
          image:             q.image || null,
          subjectName:       partition?.subjectName || subjectMeta.name,
          studentKey,
          studentAnswer:     getOptionText(studentKey),
          correctKey:        q.correct_option,
          correctAnswerText: q.correct_answer_text || getOptionText(q.correct_option),
          explanation:       q.explanation || '',
        };
      });
  };

  const finaliseResult = async (snapshotAnswers) => {
    if (timerRef.current) clearInterval(timerRef.current);

    let rawScore = 0;
    questions.forEach(q => {
      if (snapshotAnswers[q.id] === q.correct_option) rawScore++;
    });

    const totalQ            = questions.length;
    const penaltyDeduction  = Math.round(rawScore * (tabSwitchCount * 0.10));
    const finalScore        = Math.max(0, rawScore - penaltyDeduction);
    const percentage        = totalQ > 0 ? Math.round((finalScore / totalQ) * 100) : 0;
    const effectiveRequired = typeof requiredScore === 'number' ? requiredScore : 70;
    const passed            = percentage >= effectiveRequired;

    const wrongAnswers = questions
      .filter(q => snapshotAnswers[q.id] !== q.correct_option)
      .map(q => {
        const qIdx       = questions.indexOf(q);
        const partition  = subjectPartitions.find(p => qIdx >= p.startIndex && qIdx <= p.endIndex);
        const studentKey = snapshotAnswers[q.id] || null;
        const getOpt     = key => !key ? 'Not answered' : ({ A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d }[key] || key);
        return {
          id:                q.id,
          questionText:      q.question_text,
          subjectName:       partition?.subjectName || subjectMeta.name,
          studentKey,
          studentAnswer:     getOpt(studentKey),
          correctKey:        q.correct_option,
          correctAnswerText: q.correct_answer_text || getOpt(q.correct_option),
          explanation:       q.explanation || '',
        };
      });

    logExamResult({
      subjectId: subjectMeta.id ?? null, subjectName: subjectMeta.name,
      examBody: subjectMeta.exam_body, score: rawScore, totalQuestions: totalQ,
      finalScore, rawScore, percentage, requiredScore: effectiveRequired,
      tabSwitchCount, bundleName: subjectMeta.name, penaltyDeduction, wrongAnswers,
    }).catch(err => console.error('logExamResult:', err));

    if (bundleId && examCategory) {
      await applyBundleCompletionToStorage(bundleId, percentage, examCategory);
    }
    setResultPayload({
      rawScore, penaltyDeduction, finalScore, totalQ, percentage,
      tabSwitchCount, bundleName: subjectMeta.name,
      examBody: subjectMeta.exam_body || 'EXAM',
      requiredScore: effectiveRequired, passed, wrongAnswers,
    });
  };

  const handleAutoSubmit = async () => {
    await finaliseResult({ ...selectedAnswers });
  };

  const handleManualSubmit = () => {
    const unanswered = questions.length - Object.keys(selectedAnswers).length;
    const msg = unanswered > 0
      ? `Are you sure? You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}.`
      : 'Are you sure you want to end this examination session?';
    const snapshot = { ...selectedAnswers };
    Alert.alert('Submit Examination', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Submit Sheet', onPress: () => finaliseResult(snapshot) },
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

  // ─────────────────────────────────────────────────────────────────────────────
  // SCIENTIFIC CALCULATOR
  // ─────────────────────────────────────────────────────────────────────────────
  const handleCalcInput = (value) => {
    if (value === 'AC') {
      setCalcDisplay('0');
      setCalcExpression('');
      setCalcJustEvaluated(false);
      return;
    }

    if (value === '⌫') {
      if (calcDisplay.length > 1) {
        setCalcDisplay(calcDisplay.slice(0, -1));
      } else {
        setCalcDisplay('0');
      }
      return;
    }

    if (value === '=') {
      try {
        // Build full expression — always append display if it's not the "hidden zero" placeholder
        let fullExpr = calcExpression;
        const expressionEndsClosed = /[)]$/.test(calcExpression); // already closed, e.g. "tan(45)"
        if (calcDisplay === '0' && calcExpression === '') {
          fullExpr = '0';
        } else if (expressionEndsClosed) {
          // Expression already complete (ends in closing bracket) — don't append display
          fullExpr = calcExpression;
        } else if (calcDisplay !== '' && !(calcDisplay === '0' && calcExpression !== '' && /[+\-×÷^(]$/.test(calcExpression))) {
          fullExpr += calcDisplay;
        }
    
        // Strip any trailing operator (incomplete expression) before evaluating
        fullExpr = fullExpr.replace(/[+\-×÷^]+$/, '');
    
        // ── Auto-close any unmatched opening brackets (e.g. from sin(, log(, etc.) ──
        const openCount  = (fullExpr.match(/\(/g) || []).length;
        const closeCount = (fullExpr.match(/\)/g) || []).length;
        if (openCount > closeCount) {
          fullExpr += ')'.repeat(openCount - closeCount);
        }
    
        // For trig functions, JAMB/WAEC convention is DEGREES, not radians.
        // Convert degree inputs to radians before applying Math.sin/cos/tan.
        const sanitized = fullExpr
          .replace(/×/g, '*')
          .replace(/÷/g, '/')
          .replace(/π/g, Math.PI.toString())
          .replace(/sin\(([^()]*)\)/g, 'Math.sin(($1)*Math.PI/180)')
          .replace(/cos\(([^()]*)\)/g, 'Math.cos(($1)*Math.PI/180)')
          .replace(/tan\(([^()]*)\)/g, 'Math.tan(($1)*Math.PI/180)')
          .replace(/log\(/g, 'Math.log10(')
          .replace(/ln\(/g, 'Math.log(')
          .replace(/√\(/g, 'Math.sqrt(')
          .replace(/\^/g, '**');
    
        // eslint-disable-next-line no-eval
        const result = eval(sanitized);
        const resultStr = Number.isFinite(result)
          ? parseFloat(result.toFixed(10)).toString()
          : 'Error';
        setCalcDisplay(resultStr);
        setCalcExpression('');
        setCalcJustEvaluated(true);
      } catch {
        setCalcDisplay('Error');
        setCalcExpression('');
        setCalcJustEvaluated(true);
      }
      return;
    }

    const operators = ['+', '-', '×', '÷', '^'];
    const isOperator = operators.includes(value);

    const funcTokens = ['sin(', 'cos(', 'tan(', 'log(', 'ln(', '√('];
    const isFunc = funcTokens.includes(value);

    if (isFunc) {
      if (calcJustEvaluated) {
        setCalcExpression(calcDisplay + value);
        setCalcDisplay('0');
        setCalcJustEvaluated(false);
      } else {
        const prefix = calcDisplay === '0' ? '' : calcDisplay;
        setCalcExpression(calcExpression + prefix + value);
        setCalcDisplay('0');
      }
      return;
    }

    if (isOperator) {
      // ── Prevent consecutive operators from stacking ──
      // If display is the hidden "0" placeholder (meaning an operator was
      // already pressed and no new number typed yet), swap the trailing
      // operator in the expression instead of appending a new one.
      if (calcDisplay === '0' && calcExpression !== '') {
        const lastCharIsOperator = /[+\-×÷^]$/.test(calcExpression);
        if (lastCharIsOperator) {
          if (value === '-' && !/--$/.test(calcExpression)) {
            setCalcExpression(calcExpression + value);
          } else {
            setCalcExpression(calcExpression.slice(0, -1) + value);
          }
          return;
        }
      }

      // Allow leading minus for negative numbers when display is fresh
      if (calcDisplay === '0' && calcExpression === '' && value === '-') {
        setCalcDisplay('-');
        return;
      }

      const prefix = calcDisplay === '0' ? '' : calcDisplay;
      setCalcExpression(calcExpression + prefix + value);
      setCalcDisplay('0');
      setCalcJustEvaluated(false);
      return;
    }

    if (value === ')') {
      const prefix = calcDisplay === '0' ? '' : calcDisplay;
      setCalcExpression(calcExpression + prefix + ')');
      setCalcDisplay('0');
      return;
    }

    if (value === 'π') {
      setCalcDisplay(Math.PI.toFixed(8).toString());
      setCalcJustEvaluated(false);
      return;
    }

    if (value === 'x²') {
      try {
        const sq = parseFloat(calcDisplay) ** 2;
        setCalcDisplay(parseFloat(sq.toFixed(10)).toString());
        setCalcJustEvaluated(true);
      } catch {
        setCalcDisplay('Error');
      }
      return;
    }

    if (value === '%') {
      try {
        const pct = parseFloat(calcDisplay) / 100;
        setCalcDisplay(parseFloat(pct.toFixed(10)).toString());
        setCalcJustEvaluated(true);
      } catch {
        setCalcDisplay('Error');
      }
      return;
    }

    if (value === '+/-') {
      if (calcDisplay !== '0' && calcDisplay !== 'Error') {
        setCalcDisplay(
          calcDisplay.startsWith('-') ? calcDisplay.slice(1) : '-' + calcDisplay
        );
      }
      return;
    }

    // Number / decimal input
    if (calcJustEvaluated) {
      setCalcDisplay(value === '.' ? '0.' : value);
      setCalcJustEvaluated(false);
      return;
    }

    if (value === '.') {
      if (!calcDisplay.includes('.')) {
        setCalcDisplay(calcDisplay + '.');
      }
      return;
    }

    if (calcDisplay === '0' || calcDisplay === '') {
      setCalcDisplay(value);
    } else {
      if (calcDisplay.length < 12) {
        setCalcDisplay(calcDisplay + value);
      }
    }
  };

  const CALC_BUTTONS = [
    ['sin(', 'cos(', 'tan(', 'AC'],
    ['log(', 'ln(',  '√(',   '⌫'],
    ['x²',  'π',    '%',    '÷'],
    ['7',   '8',    '9',    '×'],
    ['4',   '5',    '6',    '-'],
    ['1',   '2',    '3',    '+'],
    ['+/-', '0',    '.',    '^'],
    ['(',   ')',    '',     '='],
  ];

  const getCalcButtonStyle = (val) => {
    if (val === '=')   return { backgroundColor: '#2563eb' };
    if (val === 'AC')  return { backgroundColor: '#ef4444' };
    if (val === '⌫')   return { backgroundColor: '#f59e0b' };
    if (['+', '-', '×', '÷', '^'].includes(val)) return { backgroundColor: '#334155' };
    if (['sin(','cos(','tan(','log(','ln(','√(','x²','π','%','+/-','(',')'].includes(val))
      return { backgroundColor: '#1e3a5f' };
    return { backgroundColor: '#1e293b' };
  };

  const getCalcTextStyle = (val) => {
    if (val === '=')  return { color: '#ffffff', fontWeight: '900' };
    if (val === 'AC') return { color: '#ffffff', fontWeight: '900' };
    if (val === '⌫')  return { color: '#ffffff', fontWeight: '900' };
    if (['+', '-', '×', '÷', '^'].includes(val)) return { color: '#38bdf8', fontWeight: '800' };
    if (['sin(','cos(','tan(','log(','ln(','√('].includes(val))
      return { color: '#a5f3fc', fontWeight: '700', fontSize: 11 };
    return { color: '#f1f5f9', fontWeight: '700' };
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
        onSessionComplete={sessionPayload.onSessionComplete}
        onExit={onExit}
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

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
              <Text style={{ fontWeight: '900', color: '#dc2626' }}>10% penalty</Text>
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

      {penaltyPoints > 0 && (
        <View style={styles.penaltyBanner}>
          <Text style={styles.penaltyBannerText}>
            🚨 TAB VIOLATIONS: {tabSwitchCount}x  |  PENALTY: -{tabSwitchCount * 10}% of earned score
          </Text>
        </View>
      )}

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

      <ScrollView contentContainerStyle={styles.questionWorkspace} showsVerticalScrollIndicator={false}>
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>
            Question {currentIndex + 1} of {filteredQuestions.length}
          </Text>
          <TouchableOpacity style={styles.gridToggleButton} onPress={() => setShowGridMenu(!showGridMenu)}>
            <Text style={styles.gridToggleText}>📂 Matrix Map</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.questionCard}>
          {currentQuestion.image ? (
            <QuestionImage imageUri={currentQuestion.image} />
          ) : null}
          <MathText
            text={currentQuestion.question_text}
            textStyle={styles.questionBodyText}
          />
        </View>

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
                <MathText
                  text={opt.text}
                  textStyle={[styles.optionBodyText, customTextStyle]}
                  containerStyle={{ flex: 1 }}
                />
              </TouchableOpacity>
            );
          })}
        </View>

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

      {/* ── FLOATING CALCULATOR BUTTON ── */}
      {!showGridMenu && (
        <TouchableOpacity
          style={calcStyles.floatingBtn}
          onPress={() => setShowCalculator(true)}
          activeOpacity={0.85}
        >
          <Text style={calcStyles.floatingBtnText}>🧮</Text>
        </TouchableOpacity>
      )}

      {/* ── CALCULATOR MODAL ── */}
      <Modal
        visible={showCalculator}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCalculator(false)}
      >
        <View style={calcStyles.modalOverlay}>
          <View style={[calcStyles.calcContainer, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>

            {/* Header */}
            <View style={calcStyles.calcHeader}>
              <Text style={calcStyles.calcTitle}>Scientific Calculator</Text>
              <TouchableOpacity onPress={() => setShowCalculator(false)} style={calcStyles.closeCalcBtn}>
                <Text style={calcStyles.closeCalcBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Display */}
            <View style={calcStyles.displayBox}>
              <Text style={calcStyles.expressionText} numberOfLines={1}>
                {calcExpression || ' '}
              </Text>
              <Text style={calcStyles.displayText} numberOfLines={1} adjustsFontSizeToFit>
                {calcDisplay === '0' && calcExpression !== '' ? '' : calcDisplay}
              </Text>
            </View>

            {/* Buttons */}
            <View style={calcStyles.buttonGrid}>
              {CALC_BUTTONS.map((row, ri) => (
                <View key={ri} style={calcStyles.buttonRow}>
                  {row.map((btn, bi) => (
                    btn === '' ? (
                      <View key={bi} style={calcStyles.buttonPlaceholder} />
                    ) : (
                      <TouchableOpacity
                        key={bi}
                        style={[calcStyles.calcButton, getCalcButtonStyle(btn), btn === '=' && calcStyles.equalsBtn]}
                        onPress={() => handleCalcInput(btn)}
                        activeOpacity={0.7}
                      >
                        <Text style={[calcStyles.calcButtonText, getCalcTextStyle(btn)]}>
                          {btn}
                        </Text>
                      </TouchableOpacity>
                    )
                  ))}
                </View>
              ))}
            </View>

          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  questionImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 14,
    backgroundColor: '#f1f5f9',
  },
  container: { flex: 1, backgroundColor: '#f1f5f9' },
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
  subjectTabBar: { backgroundColor: '#1e293b', borderBottomWidth: 1, borderColor: '#334155' },
  subjectTabBarContent: { paddingHorizontal: 10, paddingVertical: 6, gap: 8, flexDirection: 'row' },
  subjectTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#334155', alignItems: 'center', minWidth: 60 },
  subjectTabActive: { backgroundColor: '#2563eb' },
  subjectTabText: { fontSize: 11, fontWeight: '800', color: '#94a3b8' },
  subjectTabTextActive: { color: '#ffffff' },
  subjectTabCount: { fontSize: 9, fontWeight: '600', color: '#64748b', marginTop: 1 },
  subjectTabCountActive: { color: '#bfdbfe' },
  questionWorkspace: { padding: 16, paddingBottom: 120 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  progressText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  gridToggleButton: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#ffffff', borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1' },
  gridToggleText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  questionCard: { backgroundColor: '#ffffff', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16, elevation: 1 },
  questionBodyText: { fontSize: 16, fontWeight: '500', color: '#0f172a', lineHeight: 26 },
  optionsWrapper: { gap: 10 },
  optionCard: { backgroundColor: '#ffffff', padding: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderColor: '#e2e8f0' },
  selectedOptionCard: { backgroundColor: '#eff6ff', borderColor: '#3b82f6', borderWidth: 1.5 },
  correctOptionCard: { backgroundColor: '#f0fdf4', borderColor: '#22c55e', borderWidth: 1.5 },
  wrongOptionCard: { backgroundColor: '#fef2f2', borderColor: '#ef4444', borderWidth: 1.5 },
  bulletIndicator: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 2, borderWidth: 1, borderColor: '#cbd5e1', flexShrink: 0 },
  bulletSelected: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  bulletText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  bulletTextSelected: { color: '#ffffff' },
  optionBodyText: { fontSize: 14, fontWeight: '600', color: '#334155', lineHeight: 22, flexShrink: 1, flexWrap: 'wrap' },
  selectedOptionText: { color: '#1e40af' },
  correctOptionText: { color: '#166534' },
  wrongOptionText: { color: '#991b1b' },
  explanationBlock: { marginTop: 20, backgroundColor: '#f8fafc', padding: 16, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4, borderLeftColor: '#3b82f6' },
  explanationTitle: { fontSize: 13, fontWeight: '700', color: '#1e40af', marginBottom: 6 },
  explanationText: { fontSize: 13, color: '#475569', lineHeight: 20 },
  gridOverlay: { position: 'absolute', left: 0, right: 0, bottom: 80, backgroundColor: '#ffffff', padding: 16, borderBottomWidth: 2, borderColor: '#cbd5e1', zIndex: 99, maxHeight: 255 },
  gridMenuHeading: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 12, textTransform: 'uppercase' },
  gridMatrixLayout: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 10 },
  gridChip: { width: 42, height: 42, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1' },
  gridChipAnswered: { backgroundColor: '#cbd5e1', borderColor: '#94a3b8' },
  gridChipCurrent: { backgroundColor: '#2563eb', borderColor: '#1d4ed8' },
  gridChipText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  gridChipTextAnswered: { color: '#1e293b' },
  gridChipTextCurrent: { color: '#ffffff' },
  footerToolbar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderColor: '#e2e8f0' },
  footerNavRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  navBtn: { flex: 1, backgroundColor: '#475569', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  disabledNavBtn: { opacity: 0.35 },
  navBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  actionVerificationBtn: { flex: 1.2, backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  actionVerificationText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  submitExamBtn: { flex: 1.2, backgroundColor: '#10b981', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  submitExamText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  warningOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  warningCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380 },
  warningTitle: { fontSize: 20, fontWeight: '900', color: '#dc2626', textAlign: 'center', marginBottom: 16 },
  warningBody: { fontSize: 13, color: '#1e293b', lineHeight: 22, marginBottom: 20 },
  warningAcceptBtn: { backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  warningAcceptText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  penaltyBanner: { backgroundColor: '#dc2626', paddingVertical: 6, paddingHorizontal: 16, alignItems: 'center' },
  penaltyBannerText: { color: '#ffffff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
});

const calcStyles = StyleSheet.create({
  floatingBtn: {
    position: 'absolute',
    bottom: 90,
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    borderWidth: 1.5,
    borderColor: '#38bdf8',
    zIndex: 50,
  },
  floatingBtnText: {
    fontSize: 22,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  calcContainer: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  calcHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  calcTitle: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  closeCalcBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeCalcBtnText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '800',
  },
  displayBox: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 4,
    marginBottom: 12,
    alignItems: 'flex-end',
    minHeight: 80,
    justifyContent: 'flex-end',
  },
  expressionText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
  },
  displayText: {
    color: '#f8fafc',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  buttonGrid: {
    gap: 8,
    paddingHorizontal: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  calcButton: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  equalsBtn: {
    backgroundColor: '#2563eb',
  },
  buttonPlaceholder: {
    flex: 1,
    height: 52,
  },
  calcButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f1f5f9',
  },
});