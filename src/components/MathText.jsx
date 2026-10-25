// ─────────────────────────────────────────────────────────────────────────────
// Universal Offline MathText Component for PrepStation Pro (Web, Desktop & Mobile)
// ─────────────────────────────────────────────────────────────────────────────
// Features:
//   • 100% Offline: KaTeX runs synchronously with embedded base64 fonts.
//   • Native Web/Desktop: Direct inline DOM rendering (zero iframes, zero lag).
//   • High-Performance Mobile (Android/iOS):
//       - Pre-renders math via katex.renderToString on the JS thread.
//       - Pointer-events passthrough ensures option taps always work on Android.
//       - Smart initial height heuristic eliminates layout snapping.
//   • Smart Tokenizer: Isolates mathematical clauses from English prose text
//     and avoids treating English phonetics (/bʌt/, /ə/) or English sentences as math.
//   • Mixed Sentence Parser: Extracts mathematical terms from English instructions
//     (e.g. "Convert 11111_2 to decimal.", "Convert 25_{10} to binary.") so English words
//     remain natural text while only formulas are formatted with KaTeX.
//   • HTML-Clean: Strips <p>, <span>, <br> tags so they never trigger math mode.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { katexCSS } from '../../assets/katex/katex-bundle';
import katex from 'katex';

// Inject KaTeX CSS into document head once on Web/Electron
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  if (!document.getElementById('katex-injected-css')) {
    const style = document.createElement('style');
    style.id = 'katex-injected-css';
    style.textContent = katexCSS;
    document.head.appendChild(style);
  }
}

// ─── Mathematical Normalizer ──────────────────────────────────────────────────
export function normalizeMath(raw) {
  if (!raw) return '';
  let s = String(raw).trim();

  // 1. Escape % so it does not comment out LaTeX
  s = s.replace(/%/g, '\\%');

  // 2. Degree before slash: e.g. 360°/4 → \frac{360^\circ}{4}
  s = s.replace(/([0-9]+)°\s*\/\s*([0-9]+)/g, '\\frac{$1^\\circ}{$2}');

  // 3. Corrupted LaTeX roots: \sqrt_{3} or \sqrt_{x} → \sqrt{3}
  s = s.replace(/\\sqrt_\{([^{}]+)\}/g, '\\sqrt{$1}');
  s = s.replace(/\\sqrt_(\d)/g, '\\sqrt{$1}');

  // 4. Unbraced \sqrt followed by numbers/parens: \sqrt3 → \sqrt{3}
  s = s.replace(/\\sqrt\s*(\d+)/g, '\\sqrt{$1}');

  // 5. Unicode roots: √3 → \sqrt{3}, ∛x → \sqrt[3]{x}, ∜x → \sqrt[4]{x}
  s = s.replace(/∜\s*([0-9a-zA-Z]+|\([^)]+\))/g, (m, g) => `\\sqrt[4]{${g.replace(/^\(|\)$/g, '')}}`);
  s = s.replace(/∛\s*([0-9a-zA-Z]+|\([^)]+\))/g, (m, g) => `\\sqrt[3]{${g.replace(/^\(|\)$/g, '')}}`);
  s = s.replace(/√\s*([0-9a-zA-Z]+|\([^)]+\))/g, (m, g) => `\\sqrt{${g.replace(/^\(|\)$/g, '')}}`);

  // 6. Vulgar Unicode fractions: ½ → \frac{1}{2}
  const vulgarMap = {
    '½': '\\frac{1}{2}', '⅓': '\\frac{1}{3}', '⅔': '\\frac{2}{3}',
    '¼': '\\frac{1}{4}', '¾': '\\frac{3}{4}', '⅕': '\\frac{1}{5}',
    '⅖': '\\frac{2}{5}', '⅗': '\\frac{3}{5}', '⅘': '\\frac{4}{5}',
    '⅙': '\\frac{1}{6}', '⅚': '\\frac{5}{6}', '⅛': '\\frac{1}{8}',
    '⅜': '\\frac{3}{8}', '⅝': '\\frac{5}{8}', '⅞': '\\frac{7}{8}'
  };
  s = s.replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, m => vulgarMap[m] || m);

  // 7. Parenthesized caret exponents: 2^(2x+1) → 2^{2x+1}
  s = s.replace(/\^\(([^)]+)\)/g, '^{$1}');
  s = s.replace(/\^([a-zA-Z0-9+\-]+)/g, '^{$1}');

  // 8. Multi-digit Unicode subscripts: log₁₀ → \log_{10}, 11111₂ → 11111_{2}
  const subMap = {
    '₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9',
    '₊':'+','₋':'-','₌':'=','₍':'(','₎':')','ₐ':'a','ₑ':'e','ₒ':'o','ₓ':'x','ₕ':'h','ₖ':'k','ₗ':'l','ₘ':'m','ₙ':'n','ₚ':'p','ₛ':'s','ₜ':'t'
  };
  s = s.replace(/[₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜ]+/g, (match) => {
    const digits = match.split('').map(c => subMap[c] || c).join('');
    return `_{${digits}}`;
  });

  // Ensure raw numeric subscripts have braces: 25_10 → 25_{10}, 11111_2 → 11111_{2}
  s = s.replace(/_([a-zA-Z0-9]+)(?![a-zA-Z0-9{])/g, '_{$1}');

  // 9. Unicode superscripts: 10⁻¹² → 10^{-12}, 2⁵⁰ → 2^{50}
  const supMap = {
    '⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9',
    '⁺':'+','⁻':'-','⁼':'=','⁽':'(','⁾':')','ⁿ':'n','ⁱ':'i'
  };
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ]+/g, (match) => {
    const exp = match.split('').map(c => supMap[c] || c).join('');
    return `^{${exp}}`;
  });

  // 10. Math operators and symbols
  s = s.replace(/×/g, '\\times ');
  s = s.replace(/÷/g, '\\div ');
  s = s.replace(/±/g, '\\pm ');
  s = s.replace(/≤/g, '\\le ');
  s = s.replace(/≥/g, '\\ge ');
  s = s.replace(/≠/g, '\\ne ');
  s = s.replace(/°/g, '^\\circ ');
  s = s.replace(/→/g, '\\rightarrow ');
  s = s.replace(/←/g, '\\leftarrow ');
  s = s.replace(/∞/g, '\\infty ');
  s = s.replace(/∂/g, '\\partial ');
  s = s.replace(/∇/g, '\\nabla ');
  s = s.replace(/∫/g, '\\int ');

  // 11. Greek letters
  s = s.replace(/α/g, '\\alpha ');
  s = s.replace(/β/g, '\\beta ');
  s = s.replace(/γ/g, '\\gamma ');
  s = s.replace(/δ/g, '\\delta ');
  s = s.replace(/ε/g, '\\epsilon ');
  s = s.replace(/θ/g, '\\theta ');
  s = s.replace(/λ/g, '\\lambda ');
  s = s.replace(/μ/g, '\\mu ');
  s = s.replace(/π/g, '\\pi ');
  s = s.replace(/σ/g, '\\sigma ');
  s = s.replace(/ω/g, '\\omega ');
  s = s.replace(/Δ/g, '\\Delta ');
  s = s.replace(/Ω/g, '\\Omega ');

  // 12. Functions: log, ln, sin, cos, tan
  s = s.replace(/(^|[^a-zA-Z\\])log(_\{[^}]+\})?/g, '$1\\log$2 ');
  s = s.replace(/(^|[^a-zA-Z\\])ln([^a-zA-Z]|$)/g, '$1\\ln $2');
  s = s.replace(/(^|[^a-zA-Z\\])sin([^a-zA-Z]|$)/g, '$1\\sin $2');
  s = s.replace(/(^|[^a-zA-Z\\])cos([^a-zA-Z]|$)/g, '$1\\cos $2');
  s = s.replace(/(^|[^a-zA-Z\\])tan([^a-zA-Z]|$)/g, '$1\\tan $2');

  // 13. Fractions: (expr)/denom or num/denom
  s = s.replace(/\(([^)]+)\)\s*\/\s*(\(\?\\sqrt\{[^}]+\}\)\?|[0-9a-zA-Z]+)/g, (match, num, den) => {
    const cleanDen = den.replace(/^\(|\)$/g, '');
    return `\\frac{${num}}{${cleanDen}}`;
  });
  s = s.replace(/(?<!\^\\circ\s*)([0-9a-zA-Z]+)\s*\/\s*(\(\?\\sqrt\{[^}]+\}\)\?|[0-9a-zA-Z]+)/g, (match, num, den) => {
    if (match.includes('\\frac')) return match;
    const cleanDen = den.replace(/^\(|\)$/g, '');
    return `\\frac{${num}}{${cleanDen}}`;
  });

  return s;
}

// ─── HTML Cleaning ────────────────────────────────────────────────────────────
export function cleanHtmlTags(str) {
  if (!str || typeof str !== 'string') return '';
  let s = str.replace(/<br\s*\/?>/gi, ' ');
  s = s.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*[^>]*>/g, '');
  s = s.replace(/&nbsp;/g, ' ')
       .replace(/&lt;/g, '<')
       .replace(/&gt;/g, '>')
       .replace(/&amp;/g, '&')
       .replace(/&quot;/g, '"')
       .replace(/&#39;/g, "'");
  return s;
}

// ─── Pure Prose Detection ─────────────────────────────────────────────────────
export function isPureProse(s) {
  if (!s || typeof s !== 'string') return true;
  if (/\$(.+?)\$/.test(s)) return false;
  if (/\\[a-zA-Z]{2,}/.test(s)) return false;
  if (/[=≤≥≠]/.test(s)) return false;
  if (/\^[0-9a-zA-Z(]/.test(s)) return false;
  if (/[√∛∜]/.test(s)) return false;
  if (/\d+_(?:\{[0-9a-zA-Z]+\}|[0-9a-zA-Z]+)/.test(s) || /\d+[₀₁₂₃₄₅₆₇₈₉]+/.test(s)) return false;
  if (/\b\d+\s*\/\s*\d+\b/.test(s)) return false;
  if (/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱ]/.test(s)) return false;
  if (/\[\[.+?\]\]/.test(s)) return false;
  if (/[α-ωΑ-Ω]/.test(s)) return false;
  return true;
}

// ─── Smart Clause & Equation Tokenizer ─────────────────────────────────────────
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function tokenizeToSegments(raw) {
  if (!raw) return [{ type: 'text', content: '' }];

  const cleaned = cleanHtmlTags(raw);
  if (!cleaned.trim()) return [{ type: 'text', content: raw }];

  // 1. Phonetics /.../
  if (/^\s*\/[^\/0-9=+\-×÷^√∛∜±≤≥≠_]+\/\s*$/.test(cleaned)) {
    return [{ type: 'text', content: cleaned }];
  }

  // 2. Explicit $...$ or $$...$$
  if (/\$(.+?)\$/.test(cleaned)) {
    const parts = [];
    const re = /\$\$([\s\S]+?)\$\$|\$([^\$\n]+?)\$/g;
    let last = 0;
    let m;
    while ((m = re.exec(cleaned)) !== null) {
      if (m.index > last) {
        parts.push({ type: 'text', content: cleaned.slice(last, m.index) });
      }
      parts.push({ type: 'math', content: normalizeMath(m[1] || m[2]) });
      last = m.index + m[0].length;
    }
    if (last < cleaned.length) {
      parts.push({ type: 'text', content: cleaned.slice(last) });
    }
    return parts;
  }

  // 3. Pure Prose Check: Natural English prose with no math formulas
  if (isPureProse(cleaned)) {
    return [{ type: 'text', content: cleaned }];
  }

  // 4. Option lists ONLY: e.g. "x = 1 or x = 2", "(1, -2) and (3, 2)", "30° and 210°"
  // Must be short (< 90 chars) and each part must have <= 1 regular English words!
  if (cleaned.length < 90 && /\s+(?:or|and)\s+/.test(cleaned) && /[=<>≤≥\^√°]/.test(cleaned)) {
    const parts = cleaned.split(/(\s+(?:or|and)\s+)/);
    const isOptionList = parts.every(p => {
      if (/^\s+(?:or|and)\s+$/.test(p)) return true;
      const engWords = (p.match(/[a-zA-Z]{3,}/g) || []).filter(w =>
        !/^(sin|cos|tan|cot|sec|csc|log|ln|det|lim|sqrt|frac|alpha|beta|gamma|theta|lambda|pi|rho|sigma|omega|Delta|Omega|mod|dim|deg|only)$/i.test(w)
      );
      return engWords.length <= 1;
    });

    if (isOptionList) {
      const segments = [];
      for (const part of parts) {
        if (/^\s+(?:or|and)\s+$/.test(part)) {
          segments.push({ type: 'text', content: part });
        } else if (!isPureProse(part)) {
          segments.push({ type: 'math', content: normalizeMath(part) });
        } else {
          segments.push({ type: 'text', content: part });
        }
      }
      return segments;
    }
  }

  // 5. Standalone mathematical expression (e.g. "24/5", "x = 4", "[[2,1],[0,3]]", "(12√5 + 8√3)/33")
  const nonMathWords = (cleaned.match(/[a-zA-Z]{3,}/g) || []).filter(w => 
    !/^(sin|cos|tan|cot|sec|csc|log|ln|det|lim|sqrt|frac|alpha|beta|gamma|theta|lambda|pi|rho|sigma|omega|Delta|Omega|mod|dim|deg)$/i.test(w)
  );

  if (nonMathWords.length === 0) {
    return [{ type: 'math', content: normalizeMath(cleaned) }];
  }

  // 6. Mixed text and math: English sentence containing embedded math terms
  // (e.g. "Convert 11111_2 to decimal.", "Solve the system: y = x² - 2x - 3 and y = 2x - 4.")
  const mathChars = '[-0-9a-zA-Zα-ωΑ-Ω⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱ₀₁₂₃₄₅₆₇₈₉√∛∜()^+*\/_.,]';
  const mathPattern = new RegExp(
    '(?:' +
      '\\[\\[.*?\\]\\]|' +
      '\\\\[a-zA-Z]+(?:\\{[^}]*\\}|_[0-9a-zA-Z]+|\\^[0-9a-zA-Z]+)*|' +
      '(?:' + mathChars + '+(?:\\s*[+\\-*\\/]\\s*' + mathChars + '+)*)\\s*[=<>≤≥≠]\\s*(?:' + mathChars + '+(?:\\s*[+\\-*\\/]\\s*' + mathChars + '+)*)|' +
      '\\b(?:log|ln|sin|cos|tan|cot|sec|csc)\\b[₀₁₂₃₄₅₆₇₈₉]*(?:_\\w+)?(?:\\s*(?:[0-9a-zA-Zα-ωΑ-Ω√∛∜.]+|\\([^)]+\\)))|' +
      '\\d+_(?:\\{[0-9a-zA-Z]+\\}|[0-9a-zA-Z]+)|\\d+[₀₁₂₃₄₅₆₇₈₉]+|' +
      '(?:\\([^)]+\\)|[0-9a-zA-Zα-ωΑ-Ω√∛∜.]+)\\s*\\/\\s*(?:\\([^)]+\\)|[0-9a-zA-Zα-ωΑ-Ω√∛∜.]+)|' +
      '[0-9a-zA-Zα-ωΑ-Ω]+(?:[\\^][0-9a-zA-Z+\\-(){}]+|[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱ]+)+|' +
      '[√∛∜](?:\\([^)]+\\)|[0-9a-zA-Z.]+)|' +
      '[0-9]+°\\s*(?:[≤≥<>=]\\s*[a-zA-Zα-ωΑ-Ω]+\\s*[≤≥<>=]\\s*[0-9]+°)?|' +
      '\\b[α-ωΑ-Ω]\\b' +
    ')',
    'g'
  );

  const segments = [];
  let lastIndex = 0;
  let match;

  while ((match = mathPattern.exec(cleaned)) !== null) {
    let mathStr = match[0].trim();
    let trailingPunct = '';
    const punctMatch = mathStr.match(/([.,;:?]+)$/);
    if (punctMatch && !/^[0-9]+\.[0-9]+$/.test(mathStr)) {
      trailingPunct = punctMatch[1];
      mathStr = mathStr.slice(0, -trailingPunct.length).trim();
    }

    if (!mathStr) continue;

    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: cleaned.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'math', content: normalizeMath(mathStr) });
    if (trailingPunct) {
      segments.push({ type: 'text', content: trailingPunct });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < cleaned.length) {
    segments.push({ type: 'text', content: cleaned.slice(lastIndex) });
  }

  if (segments.length > 0 && segments.some(s => s.type === 'math')) {
    return segments;
  }

  return [{ type: 'text', content: cleaned }];
}

// ─── KaTeX HTML Template for Mobile WebView ──────────────────────────────────
function buildMobileKatexHtml(preRenderedContent, fontSize, color) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
  <style>
    ${katexCSS}
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: ${fontSize}px;
      color: ${color};
      background: transparent;
      line-height: 1.5;
      padding: 0;
      word-break: break-word;
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
    }
    .katex { font-size: 1.05em; display: inline-block; vertical-align: baseline; margin: 0 1px; }
    .katex-display { margin: 2px 0; overflow-x: auto; overflow-y: hidden; }
    #content {
      display: inline-block;
      width: 100%;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <div id="content">${preRenderedContent}</div>
  <script>
    function sendHeight() {
      var root = document.getElementById("content") || document.body;
      var h = Math.ceil(root.getBoundingClientRect().height || root.offsetHeight || 30);
      if (window.ReactNativeWebView && h > 0) {
        window.ReactNativeWebView.postMessage(String(h));
      }
    }
    window.addEventListener("load", sendHeight);
    document.addEventListener("DOMContentLoaded", sendHeight);
    setTimeout(sendHeight, 40);
    setTimeout(sendHeight, 180);
  </script>
</body>
</html>`;
}

// ─── MathText Component ───────────────────────────────────────────────────────
export default function MathText({ text, textStyle, containerStyle }) {
  const segments = useMemo(() => tokenizeToSegments(text || ''), [text]);
  const hasMath = segments.some(s => s.type === 'math');
  const flatStyle = StyleSheet.flatten(textStyle) || {};

  const fontSize = flatStyle.fontSize || 15;
  const color = flatStyle.color || '#0f172a';

  const estimatedInitialHeight = useMemo(() => {
    const rawLen = (text || '').length;
    const lines = Math.max(1, Math.ceil(rawLen / 36));
    return Math.max(34, lines * Math.ceil(fontSize * 1.5) + 6);
  }, [text, fontSize]);

  const [mobileHeight, setMobileHeight] = useState(estimatedInitialHeight);

  useEffect(() => {
    setMobileHeight(estimatedInitialHeight);
  }, [estimatedInitialHeight]);

  // Case 1: Pure text with zero mathematical symbols
  if (!hasMath) {
    return <Text style={textStyle}>{cleanHtmlTags(text)}</Text>;
  }

  // Case 2: Web / Electron
  if (Platform.OS === 'web') {
    const children = segments.map((seg, idx) => {
      if (seg.type === 'text') {
        return seg.content;
      }
      try {
        const mathHtml = katex.renderToString(seg.content, {
          throwOnError: false,
          displayMode: false
        });
        return React.createElement('span', {
          key: idx,
          style: { display: 'inline-block', verticalAlign: 'baseline', margin: '0 1px' },
          dangerouslySetInnerHTML: { __html: mathHtml }
        });
      } catch (err) {
        return seg.content;
      }
    });

    return (
      <Text style={textStyle}>
        {children}
      </Text>
    );
  }

  // Case 3: Mobile (Android / iOS)
  const preRenderedHtml = segments.map(seg => {
    if (seg.type === 'text') {
      return escapeHtml(seg.content);
    }
    try {
      return katex.renderToString(seg.content, {
        throwOnError: false,
        displayMode: false
      });
    } catch (e) {
      return escapeHtml(seg.content);
    }
  }).join('');

  const html = buildMobileKatexHtml(preRenderedHtml, fontSize, color);

  return (
    <View
      pointerEvents="none"
      style={[{ width: '100%', height: mobileHeight }, containerStyle]}
    >
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onMessage={(e) => {
          const h = parseInt(e.nativeEvent.data, 10);
          if (!isNaN(h) && h > 0) {
            setMobileHeight(h + 4);
          }
        }}
        style={{ backgroundColor: 'transparent', flex: 1 }}
        androidLayerType="software"
      />
    </View>
  );
}
