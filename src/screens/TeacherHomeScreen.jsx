import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Animated,
  Platform,
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsDesktop, DESKTOP_CONTENT_MAX_WIDTH } from '../hooks/useResponsive';
import { Alert } from '../components/AlertProvider';
import { getMyTeacherCode, decodePGMapPayload, TEACHER_CODE_LENGTH } from '../services/PGMapService';
import { readAnswerBreakdownFile, pickAndReadAnswerBreakdownFile } from '../services/ReportService';
import MathText from '../components/MathText';
import * as DocumentPicker from 'expo-document-picker';
import {
  getRosterPupils,
  upsertRosterPupil,
  deleteRosterPupil,
  saveImportedReport,
  getReportForPupil,
  getReportPupilCodes,
} from '../database/queries';

// ─────────────────────────────────────────────────────────────────────────────
// Rate colour scale — one meaning per band, reused everywhere a rate appears.
// ─────────────────────────────────────────────────────────────────────────────
const rateColor = (r) =>
  r >= 75 ? '#059669' : r >= 60 ? '#2563eb' : r >= 40 ? '#d97706' : '#dc2626';
const rateSoft = (r) =>
  r >= 75 ? '#d1fae5' : r >= 60 ? '#dbeafe' : r >= 40 ? '#fef3c7' : '#fee2e2';
const rateLabel = (r) =>
  r >= 75 ? 'Strong' : r >= 60 ? 'Steady' : r >= 40 ? 'Needs work' : 'At risk';

function computeHeadlineRate(performance) {
  const entries = Object.values(performance || {});
  if (!entries.length) return 0;
  let sum = 0, weight = 0;
  for (const e of entries) {
    const w = e.testsTaken || 1;
    sum += (e.overallRate || 0) * w;
    weight += w;
  }
  return weight ? Math.round(sum / weight) : 0;
}

function weakestSubject(performance) {
  let weakest = null;
  for (const e of Object.values(performance || {})) {
    for (const s of e.subjects || []) {
      if (!weakest || s.rate < weakest.rate) weakest = s;
    }
  }
  return weakest;
}

// ─────────────────────────────────────────────────────────────────────────────
// Circular rate ring — the signature data element of teacher mode.
// ─────────────────────────────────────────────────────────────────────────────
function RateRing({ rate = 0, size = 56, stroke = 6, track = '#e2e8f0', textColor = '#0f172a' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, Math.round(rate)));
  const offset = c * (1 - clamped / 100);
  const color = rateColor(clamped);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
            strokeDasharray={`${c} ${c}`} strokeDashoffset={offset} strokeLinecap="round"
          />
        </G>
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontSize: size * 0.30, fontWeight: '800', color: textColor }}>{clamped}</Text>
        {size >= 92 && (
          <Text style={{ fontSize: size * 0.11, fontWeight: '700', color: textColor, opacity: 0.5, letterSpacing: 1 }}>RATE</Text>
        )}
      </View>
    </View>
  );
}

// See HomeScreen.jsx for why this is needed — flex:1 ScrollViews on web
// need minHeight: 0 or they grow instead of scrolling.
const webScrollFix = { flex: 1, minHeight: 0 };

export default function TeacherHomeScreen({ onSwitchToPupil }) {
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [myCode, setMyCode] = useState(null);
  const [roster, setRoster] = useState([]);
  const [pasteValue, setPasteValue] = useState('');
  const [status, setStatus] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);
  const [detailPupil, setDetailPupil] = useState(null);
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLock = useRef(false);
  const fade = useRef(new Animated.Value(0)).current;

  // Answer-breakdown state: which pupils have an imported breakdown, a file-pick
  // in-progress flag, and the currently-open pupil's decoded breakdown.
  const [reportCodes, setReportCodes] = useState([]);       // device codes with a breakdown
  const [importing, setImporting] = useState(false);        // file pick in progress
  const [detailReport, setDetailReport] = useState(null);   // report for the open pupil
  const [breakdownVisible, setBreakdownVisible] = useState(false);
  const [openTestId, setOpenTestId] = useState(null);       // which test is expanded

  // Palette — indigo identity for teacher mode, on the app's slate base.
  const t = {
    bg:         isDarkMode ? '#0b1120' : '#f1f5f9',
    card:       isDarkMode ? '#111c33' : '#ffffff',
    textMain:   isDarkMode ? '#f8fafc' : '#0f172a',
    textSub:    isDarkMode ? '#94a3b8' : '#64748b',
    textFaint:  isDarkMode ? '#64748b' : '#94a3b8',
    border:     isDarkMode ? '#1e293b' : '#e9edf3',
    innerPanel: isDarkMode ? '#0b1120' : '#f4f6fb',
  };
  const ACCENT = '#4f46e5';
  const ACCENT_SOFT = isDarkMode ? '#1e1b4b' : '#eef2ff';

  const loadRoster = useCallback(async () => {
    const list = await getRosterPupils();
    setRoster(list);
  }, []);

  const loadReports = useCallback(async () => {
    setReportCodes(await getReportPupilCodes());
  }, []);

  useEffect(() => {
    (async () => {
      setMyCode(await getMyTeacherCode());
      await loadRoster();
      await loadReports();
    })();
    Animated.timing(fade, { toValue: 1, duration: 380, useNativeDriver: true }).start();
  }, [loadRoster, loadReports, fade]);

  // When a pupil's detail sheet opens, pull their imported answer breakdown (if
  // any) so the "View answer breakdown" button knows whether to show.
  useEffect(() => {
    let alive = true;
    if (!detailPupil) { setDetailReport(null); return; }
    (async () => {
      const rep = await getReportForPupil(detailPupil.pupilDeviceCode);
      if (alive) setDetailReport(rep);
    })();
    return () => { alive = false; };
  }, [detailPupil]);

  const classes = useMemo(() => {
    const map = {};
    for (const p of roster) {
      for (const cl of p.classLevels || []) {
        if (!map[cl]) map[cl] = { class: cl, pupils: [], sum: 0 };
        map[cl].pupils.push(p);
        map[cl].sum += p.overallRate || 0;
      }
    }
    return Object.values(map)
      .map((c) => ({ class: c.class, count: c.pupils.length, avg: Math.round(c.sum / c.pupils.length) }))
      .sort((a, b) => a.class.localeCompare(b.class));
  }, [roster]);

  const stats = useMemo(() => ({
    pupils: roster.length,
    classes: classes.length,
    avg: roster.length ? Math.round(roster.reduce((s, p) => s + (p.overallRate || 0), 0) / roster.length) : 0,
  }), [roster, classes]);

  const filteredRoster = useMemo(
    () => (selectedClass ? roster.filter((p) => (p.classLevels || []).includes(selectedClass)) : roster),
    [roster, selectedClass]
  );

  // ── actions (unchanged logic) ──
  const processPupilString = async (raw) => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return { type: 'error', msg: 'Paste a pupil PG Map string first.' };
    const snap = decodePGMapPayload(trimmed);
    if (!snap) return { type: 'error', msg: "Couldn't read that code. Use the full string or a clearer scan." };
    if (!snap.teacherCode) return { type: 'error', msg: "This pupil hasn't linked a teacher yet." };
    if (String(snap.teacherCode) !== String(myCode)) {
      return { type: 'error', msg: `This pupil is linked to teacher ${snap.teacherCode}, not your key (${myCode}).` };
    }
    const perf = snap.classPerformance || {};
    const classLevels = Object.keys(perf);
    if (classLevels.length === 0) return { type: 'error', msg: "No class-test results in this pupil's code yet." };
    const record = {
      pupilDeviceCode: snap.deviceCode || `pupil_${Date.now()}`,
      fullName: (snap.student && snap.student.fullName) || 'Unnamed pupil',
      classLevels,
      overallRate: computeHeadlineRate(perf),
      performance: perf,
      teacherCode: snap.teacherCode,
      snapshot: snap,
    };
    const ok = await upsertRosterPupil(record);
    if (!ok) return { type: 'error', msg: 'Could not save this pupil. Try again.' };
    await loadRoster();
    return { type: 'success', msg: `${record.fullName} saved to your roster.` };
  };

  const handleAddFromString = async () => {
    const res = await processPupilString(pasteValue);
    if (res.type === 'success') setPasteValue('');
    setStatus(res);
  };

  // Import a pupil's shared .psr breakdown FILE. Picks the file, decompresses +
  // decodes it, verifies it's linked to this teacher, makes sure the pupil
  // appears in the roster (without clobbering any PG Map performance already
  // there), then stores the breakdown.
const handlePickAndImport = async () => {
    if (importing) return;
    setImporting(true);
    try {
      let report = null;

      // DESKTOP (Electron): expo-document-picker and expo-file-system have no
      // web implementation, so use the native dialog + Node fs read instead.
      if (typeof window !== 'undefined' && window.electronFile) {
        report = await pickAndReadAnswerBreakdownFile();
        if (report === null) { setImporting(false); return; } // user cancelled the dialog, or genuinely unreadable — both look the same here
      } else {
        // NATIVE / plain web: original expo-document-picker path.
        const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
        if (res.canceled || !res.assets || !res.assets[0]) { setImporting(false); return; }
        report = await readAnswerBreakdownFile(res.assets[0].uri);
      }

      if (!report) {
        Alert.alert('Couldn\u2019t read that file', 'Make sure you picked the .psr answer-breakdown file your pupil shared with you.');
        setImporting(false); return;
      }
      if (!report.teacherCode) {
        Alert.alert('Not linked', "This pupil hasn't linked a teacher yet.");
        setImporting(false); return;
      }
      if (String(report.teacherCode) !== String(myCode)) {
        Alert.alert('Different teacher', `This breakdown is linked to teacher ${report.teacherCode}, not your key (${myCode}).`);
        setImporting(false); return;
      }

      const deviceCode = report.deviceCode || `pupil_${Date.now()}`;
      const existing = roster.find((p) => p.pupilDeviceCode === deviceCode);
      if (!existing) {
        const classLevels = [...new Set((report.tests || []).map((tt) => tt.classLevel).filter(Boolean))];
        const pcts = (report.tests || []).map((tt) => tt.percentage || 0);
        const avg = pcts.length ? Math.round(pcts.reduce((s, n) => s + n, 0) / pcts.length) : 0;
        await upsertRosterPupil({
          pupilDeviceCode: deviceCode,
          fullName: report.pupilName || 'Unnamed pupil',
          classLevels,
          overallRate: avg,
          performance: {},
          teacherCode: report.teacherCode,
          snapshot: {},
        });
      }
      const ok = await saveImportedReport({
        pupilDeviceCode: deviceCode,
        fullName: report.pupilName || 'Unnamed pupil',
        teacherCode: report.teacherCode,
        report,
      });
      if (!ok) { Alert.alert('Save failed', 'Could not save the breakdown. Try again.'); setImporting(false); return; }

      await loadRoster();
      await loadReports();
      const misses = (report.tests || []).reduce((s, tt) => s + ((tt.misses || []).length), 0);
      Alert.alert('Breakdown imported', `${report.pupilName || 'Pupil'}: ${(report.tests || []).length} test(s), ${misses} missed question(s). Open the pupil to view.`);
    } catch (e) {
      Alert.alert('Import error', 'Something went wrong reading that file. Try again.');
    }
    setImporting(false);
  };

  const openScanner = async () => {
    let perm = permission;
    if (!perm || !perm.granted) perm = await requestPermission();
    if (!perm || !perm.granted) {
      Alert.alert('Camera needed', 'Allow camera access to scan a pupil\u2019s QR code, or paste the string instead.');
      return;
    }
    scanLock.current = false;
    setStatus(null);
    setScanModalVisible(true);
  };

  const onBarcodeScanned = async ({ data }) => {
    if (scanLock.current) return;
    scanLock.current = true;
    const res = await processPupilString(data);
    setScanModalVisible(false);
    setAddOpen(true);
    setStatus(res);
  };

  const shareMyKey = () => {
    if (!myCode) return;
    import('react-native').then(({ Share }) => {
      Share.share({ message: `My PrepStation Pro teacher key is ${myCode}. Enter it once in the app to link your results to me.` });
    });
  };

  const removePupil = async (pupil) => {
    Alert.alert('Remove pupil', `Remove ${pupil.fullName} from your roster?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => { await deleteRosterPupil(pupil.pupilDeviceCode); setDetailPupil(null); loadRoster(); },
      },
    ]);
  };

  const keyGrouped = myCode ? myCode.replace(/(\d{4})(?=\d)/g, '$1 ') : '\u2022'.repeat(TEACHER_CODE_LENGTH);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      {/* Header band — indigo, spans the status bar for a clean edge-to-edge top */}
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: ACCENT }, isDesktop && styles.headerDesktop]}>
        <View style={[styles.headerRow, isDesktop && styles.headerRowDesktop]}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><Text style={{ fontSize: 18 }}>🏫</Text></View>
            <View>
              <Text style={styles.headerEyebrow}>PREPSTATION PRO</Text>
              <Text style={[styles.headerTitle, isDesktop && { fontSize: 24 }]}>Teacher Studio</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => setIsDarkMode((v) => !v)} style={styles.headerIconBtn} activeOpacity={0.8}>
              <Text style={{ fontSize: 15 }}>{isDarkMode ? '☀️' : '🌙'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSwitchToPupil} style={styles.pupilBtn} activeOpacity={0.85}>
              <Text style={{ fontSize: 12 }}>🎓</Text>
              <Text style={styles.pupilBtnText}>Pupil</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Animated.View style={{ flex: 1, minHeight: 0, opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
        <ScrollView
          style={webScrollFix}
          contentContainerStyle={[
            { padding: 16, paddingTop: 18, paddingBottom: insets.bottom + 36 },
            isDesktop && {
              width: '100%',
              maxWidth: DESKTOP_CONTENT_MAX_WIDTH,
              alignSelf: 'center',
              paddingHorizontal: 40,
              paddingTop: 28,
            },
          ]}
          showsVerticalScrollIndicator={isDesktop}
          keyboardShouldPersistTaps="handled"
        >
          {/* CLASS KEY — presented like an access card the teacher reads aloud */}
          <View style={styles.keyCard}>
            <View style={styles.keyBlobA} />
            <View style={styles.keyBlobB} />
            <View style={styles.keyTopRow}>
              <Text style={styles.keyEyebrow}>YOUR CLASS KEY</Text>
              <View style={styles.keyChip}><Text style={styles.keyChipText}>{TEACHER_CODE_LENGTH}-DIGIT</Text></View>
            </View>
            <Text style={styles.keyDigits} selectable>{keyGrouped}</Text>
            <Text style={styles.keyHint}>
              Read this to your class. Each pupil enters it once, and their results flow back to you.
            </Text>
            <TouchableOpacity style={styles.keyShareBtn} onPress={shareMyKey} activeOpacity={0.85}>
              <Text style={styles.keyShareText}>Share key</Text>
              <Text style={{ fontSize: 13, color: '#fff' }}>↗</Text>
            </TouchableOpacity>
          </View>

          {/* OVERVIEW STATS */}
          <View style={styles.statsRow}>
            {[
              { k: 'Pupils', v: `${stats.pupils}`, tint: ACCENT },
              { k: 'Classes', v: `${stats.classes}`, tint: '#0891b2' },
              { k: 'Avg rate', v: roster.length ? `${stats.avg}%` : '\u2014', tint: roster.length ? rateColor(stats.avg) : t.textFaint },
            ].map((s) => (
              <View key={s.k} style={[styles.statCell, { backgroundColor: t.card, borderColor: t.border }]}>
                <Text style={[styles.statValue, { color: s.tint }]}>{s.v}</Text>
                <Text style={[styles.statKey, { color: t.textSub }]}>{s.k}</Text>
              </View>
            ))}
          </View>

          {/* ADD A PUPIL — collapsible so the roster stays the focus */}
          <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => { setAddOpen((v) => !v); if (status) setStatus(null); }}
              style={styles.addHead}
            >
              <View style={[styles.addIcon, { backgroundColor: ACCENT_SOFT }]}>
                <Text style={{ fontSize: 17 }}>➕</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: t.textMain }]}>Add a pupil</Text>
                <Text style={[styles.cardSub, { color: t.textSub }]}>Scan their QR or paste their PG Map string</Text>
              </View>
              <Text style={[styles.addChevron, { color: t.textFaint }]}>{addOpen ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {addOpen && (
              <View style={{ marginTop: 14 }}>
                <TouchableOpacity style={[styles.scanCta, { backgroundColor: ACCENT }]} onPress={openScanner} activeOpacity={0.9}>
                  <Text style={{ fontSize: 16 }}>📷</Text>
                  <Text style={styles.scanCtaText}>Scan pupil QR</Text>
                </TouchableOpacity>

                <View style={styles.orRow}>
                  <View style={[styles.orLine, { backgroundColor: t.border }]} />
                  <Text style={[styles.orText, { color: t.textFaint }]}>or paste string</Text>
                  <View style={[styles.orLine, { backgroundColor: t.border }]} />
                </View>

                <TextInput
                  style={[styles.paste, { backgroundColor: t.innerPanel, color: t.textMain, borderColor: t.border }]}
                  placeholder="Paste PG Map string here"
                  placeholderTextColor={t.textFaint}
                  value={pasteValue}
                  onChangeText={(v) => { setPasteValue(v); if (status) setStatus(null); }}
                  multiline
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  style={[styles.loadBtn, { backgroundColor: pasteValue.trim() ? ACCENT : (isDarkMode ? '#1e293b' : '#e2e8f0') }]}
                  onPress={handleAddFromString}
                  disabled={!pasteValue.trim()}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.loadBtnText, { color: pasteValue.trim() ? '#fff' : t.textFaint }]}>Load results</Text>
                </TouchableOpacity>
              </View>
            )}

            {status && (
              <View style={[styles.statusRow, { backgroundColor: status.type === 'success' ? (isDarkMode ? '#052e2b' : '#ecfdf5') : (isDarkMode ? '#3b1113' : '#fef2f2') }]}>
                <Text style={{ fontSize: 13 }}>{status.type === 'success' ? '✅' : '⚠️'}</Text>
                <Text style={{ flex: 1, color: status.type === 'success' ? '#059669' : '#dc2626', fontSize: 12.5, fontWeight: '700', lineHeight: 17 }}>
                  {status.msg}
                </Text>
              </View>
            )}
          </View>

          {/* IMPORT ANSWER BREAKDOWN */}
          <TouchableOpacity
            style={[styles.card, styles.importCard, { backgroundColor: t.card, borderColor: t.border, opacity: importing ? 0.6 : 1 }]}
            onPress={handlePickAndImport}
            disabled={importing}
            activeOpacity={0.85}
          >
            <View style={[styles.addIcon, { backgroundColor: ACCENT_SOFT }]}>
              <Text style={{ fontSize: 17 }}>📄</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: t.textMain }]}>Import answer breakdown</Text>
              <Text style={[styles.cardSub, { color: t.textSub }]}>{importing ? 'Opening…' : 'Open the file a pupil shared to see their missed questions'}</Text>
            </View>
            <Text style={[styles.chev, { color: t.textFaint }]}>›</Text>
          </TouchableOpacity>

          {/* CLASSES */}
          {classes.length > 0 && (
            <View style={{ marginTop: 4 }}>
              <View style={styles.sectionHead}>
                <Text style={[styles.sectionTitle, { color: t.textMain }]}>Classes</Text>
                {selectedClass
                  ? <TouchableOpacity onPress={() => setSelectedClass(null)}><Text style={[styles.clearFilter, { color: ACCENT }]}>Clear filter</Text></TouchableOpacity>
                  : <Text style={[styles.countBadge, { color: t.textFaint }]}>{classes.length}</Text>}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 2, paddingRight: 4 }}>
                {classes.map((c) => {
                  const active = selectedClass === c.class;
                  return (
                    <TouchableOpacity
                      key={c.class} activeOpacity={0.85}
                      onPress={() => setSelectedClass(active ? null : c.class)}
                      style={[styles.classCard, { backgroundColor: active ? ACCENT : t.card, borderColor: active ? ACCENT : t.border }]}
                    >
                      <View style={styles.classCardTop}>
                        <Text style={[styles.className, { color: active ? '#fff' : t.textMain }]}>{c.class}</Text>
                        <View style={[styles.classRateDot, { backgroundColor: active ? 'rgba(255,255,255,0.9)' : rateColor(c.avg) }]} />
                      </View>
                      <Text style={[styles.classAvgBig, { color: active ? '#fff' : rateColor(c.avg) }]}>{c.avg}%</Text>
                      <Text style={[styles.classMeta, { color: active ? '#dbeafe' : t.textSub }]}>
                        {c.count} {c.count === 1 ? 'pupil' : 'pupils'} · avg
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* ROSTER */}
          <View style={[styles.sectionHead, { marginTop: 22 }]}>
            <Text style={[styles.sectionTitle, { color: t.textMain }]}>
              Pupils{selectedClass ? <Text style={{ color: ACCENT }}>{`  ·  ${selectedClass}`}</Text> : ''}
            </Text>
            {roster.length > 0 && <Text style={[styles.countBadge, { color: t.textFaint }]}>{filteredRoster.length}</Text>}
          </View>

          {filteredRoster.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: t.card, borderColor: t.border }]}>
              <View style={[styles.emptyIcon, { backgroundColor: ACCENT_SOFT }]}><Text style={{ fontSize: 26 }}>👥</Text></View>
              <Text style={[styles.emptyTitle, { color: t.textMain }]}>
                {roster.length === 0 ? 'No pupils yet' : 'None in this class'}
              </Text>
              <Text style={[styles.emptySub, { color: t.textSub }]}>
                {roster.length === 0
                  ? 'Share your class key, then scan or paste a pupil\u2019s PG Map to see how they\u2019re doing.'
                  : 'Clear the filter to see your whole roster.'}
              </Text>
            </View>
          ) : (
            filteredRoster.map((p) => {
              const weak = weakestSubject(p.performance);
              return (
                <TouchableOpacity
                  key={p.pupilDeviceCode} activeOpacity={0.85}
                  onPress={() => setDetailPupil(p)}
                  style={[styles.pupilCard, { backgroundColor: t.card, borderColor: t.border }]}
                >
                  <RateRing rate={p.overallRate} size={54} stroke={6} track={t.innerPanel} textColor={t.textMain} />
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.pupilName, { color: t.textMain, flexShrink: 1 }]} numberOfLines={1}>{p.fullName}</Text>
                      {reportCodes.includes(p.pupilDeviceCode) && (
                        <View style={[styles.breakdownTag, { backgroundColor: ACCENT_SOFT }]}>
                          <Text style={[styles.breakdownTagText, { color: ACCENT }]}>📄 breakdown</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {(p.classLevels || []).map((cl) => (
                        <View key={cl} style={[styles.classTag, { backgroundColor: ACCENT_SOFT }]}>
                          <Text style={[styles.classTagText, { color: ACCENT }]}>{cl}</Text>
                        </View>
                      ))}
                    </View>
                    {weak && (
                      <View style={[styles.weakPill, { backgroundColor: rateSoft(weak.rate) }]}>
                        <Text style={{ fontSize: 10.5, fontWeight: '800', color: rateColor(weak.rate) }} numberOfLines={1}>
                          ↓ {weak.subject} {weak.rate}%
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.chev, { color: t.textFaint }]}>›</Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </Animated.View>

      {/* SCAN MODAL */}
      <Modal visible={scanModalVisible} animationType="slide" onRequestClose={() => setScanModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onBarcodeScanned}
          />
          <View style={{ position: 'absolute', top: insets.top + 24, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>Scan a pupil's PG Map QR</Text>
            <Text style={{ color: '#e2e8f0', fontSize: 12.5, marginTop: 4 }}>Hold their code inside the frame</Text>
          </View>
          <View pointerEvents="none" style={styles.scanFrame} />
          <TouchableOpacity onPress={() => setScanModalVisible(false)} style={[styles.scanCancel, { bottom: insets.bottom + 32 }]} activeOpacity={0.85}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* PUPIL DETAIL */}
      <Modal visible={!!detailPupil} transparent animationType="slide" onRequestClose={() => setDetailPupil(null)}>
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { backgroundColor: t.bg, paddingBottom: insets.bottom + 16 }]}>
            {detailPupil && (
              <ScrollView showsVerticalScrollIndicator={isDesktop}>
                <View style={styles.sheetHandle} />
                <View style={{ alignItems: 'center', marginTop: 6 }}>
                  <RateRing rate={detailPupil.overallRate} size={110} stroke={10} track={t.innerPanel} textColor={t.textMain} />
                  <Text style={[styles.sheetName, { color: t.textMain }]}>{detailPupil.fullName}</Text>
                  <View style={[styles.bandPill, { backgroundColor: rateSoft(detailPupil.overallRate) }]}>
                    <View style={[styles.dot, { backgroundColor: rateColor(detailPupil.overallRate) }]} />
                    <Text style={[styles.bandPillText, { color: rateColor(detailPupil.overallRate) }]}>
                      {rateLabel(detailPupil.overallRate)} · {detailPupil.overallRate}%
                    </Text>
                  </View>
                </View>

                {Object.entries(detailPupil.performance || {}).map(([cls, data]) => (
                  <View key={cls} style={[styles.classBlock, { backgroundColor: t.card, borderColor: t.border }]}>
                    <View style={styles.classBlockHead}>
                      <Text style={[styles.classBlockTitle, { color: t.textMain }]}>{cls}</Text>
                      <Text style={[styles.classBlockMeta, { color: t.textSub }]}>
                        {data.overallRate}% · {data.testsTaken} {data.testsTaken === 1 ? 'test' : 'tests'}
                      </Text>
                    </View>
                    {(data.subjects || []).map((s) => (
                      <View key={s.subject} style={{ marginTop: 12 }}>
                        <View style={styles.subjRow}>
                          <Text style={[styles.subjName, { color: t.textMain }]} numberOfLines={1}>{s.subject}</Text>
                          <Text style={[styles.subjRate, { color: rateColor(s.rate) }]}>{s.rate}%</Text>
                        </View>
                        <View style={[styles.barTrack, { backgroundColor: t.innerPanel }]}>
                          <View style={[styles.barFill, { width: `${Math.max(3, Math.min(100, s.rate))}%`, backgroundColor: rateColor(s.rate) }]} />
                        </View>
                      </View>
                    ))}
                  </View>
                ))}

                <Text style={[styles.updatedLine, { color: t.textFaint }]}>
                  Updated {detailPupil.updatedAt ? new Date(detailPupil.updatedAt).toLocaleDateString() : '\u2014'}
                </Text>

                {detailReport && (detailReport.tests || []).length > 0 && (
                  <TouchableOpacity
                    style={[styles.viewBreakdownBtn, { backgroundColor: ACCENT }]}
                    onPress={() => { setOpenTestId(null); setBreakdownVisible(true); }}
                    activeOpacity={0.9}
                  >
                    <Text style={{ fontSize: 15 }}>📄</Text>
                    <Text style={styles.viewBreakdownText}>
                      View answer breakdown ({detailReport.tests.length} {detailReport.tests.length === 1 ? 'test' : 'tests'})
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={[styles.removeBtn, { backgroundColor: isDarkMode ? '#3b1113' : '#fef2f2' }]} onPress={() => removePupil(detailPupil)} activeOpacity={0.85}>
                  <Text style={styles.removeBtnText}>Remove pupil</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.closeSheetBtn, { borderColor: t.border }]} onPress={() => setDetailPupil(null)} activeOpacity={0.85}>
                  <Text style={[styles.closeSheetText, { color: t.textSub }]}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ANSWER BREAKDOWN VIEW MODAL */}
      <Modal visible={breakdownVisible} transparent animationType="slide" onRequestClose={() => setBreakdownVisible(false)}>
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { backgroundColor: t.bg, paddingBottom: insets.bottom + 16 }]}>
            {detailReport && (
              <ScrollView showsVerticalScrollIndicator={isDesktop}>
                <View style={styles.sheetHandle} />
                <Text style={[styles.importTitle, { color: t.textMain }]}>{detailReport.pupilName || 'Pupil'} · misses</Text>
                <Text style={[styles.importSub, { color: t.textSub }]}>
                  Each question shows the option the pupil picked. The correct answer is deliberately hidden — teach it out together until they reach it.
                </Text>

                {(detailReport.tests || []).map((tst) => {
                  const open = openTestId === tst.id;
                  const bySubject = {};
                  for (const m of (tst.misses || [])) {
                    const key = m.subject || 'General';
                    (bySubject[key] = bySubject[key] || []).push(m);
                  }
                  return (
                    <View key={tst.id} style={[styles.testBlock, { backgroundColor: t.card, borderColor: t.border }]}>
                      <TouchableOpacity activeOpacity={0.7} onPress={() => setOpenTestId(open ? null : tst.id)} style={styles.testHead}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.testTitle, { color: t.textMain }]} numberOfLines={1}>
                            {tst.bundleName || tst.subjectName || tst.classLevel || 'Test'}
                          </Text>
                          <Text style={[styles.testMeta, { color: t.textSub }]}>
                            {tst.classLevel ? tst.classLevel + ' · ' : ''}{tst.date ? new Date(tst.date).toLocaleDateString() : ''} · {(tst.misses || []).length} missed
                          </Text>
                        </View>
                        <Text style={[styles.testPct, { color: rateColor(tst.percentage || 0) }]}>{tst.percentage || 0}%</Text>
                        <Text style={[styles.addChevron, { color: t.textFaint, marginLeft: 10 }]}>{open ? '▲' : '▼'}</Text>
                      </TouchableOpacity>

                      {open && (
                        (tst.misses || []).length === 0 ? (
                          <Text style={[styles.testMeta, { color: t.textFaint, marginTop: 10 }]}>No missed questions in this test. 🎉</Text>
                        ) : (
                          Object.entries(bySubject).map(([subj, list]) => (
                            <View key={subj} style={{ marginTop: 14 }}>
                              <Text style={[styles.missSubj, { color: ACCENT }]}>{subj}</Text>
                              {list.map((m, i) => (
                                <View key={i} style={[styles.missCard, { backgroundColor: t.innerPanel, borderColor: t.border }]}>
                                  <View style={{ flexDirection: 'row' }}>
                                    <Text style={[styles.missQ, { color: t.textMain }]}>{i + 1}. </Text>
                                    <View style={{ flex: 1 }}>
                                      <MathText text={m.q || 'Question'} textStyle={[styles.missQ, { color: t.textMain }]} />
                                    </View>
                                  </View>
                                  <View style={styles.missPickRow}>
                                    <Text style={[styles.missPickLabel, { color: t.textFaint }]}>PICKED</Text>
                                    <View style={{ flex: 1 }}>
                                      <MathText
                                        text={`${m.pickedKey ? m.pickedKey + '.  ' : ''}${m.pickedText || 'Not answered'}`}
                                        textStyle={[styles.missPickVal, { color: '#dc2626' }]}
                                      />
                                    </View>
                                  </View>
                                </View>
                              ))}
                            </View>
                          ))
                        )
                      )}
                    </View>
                  );
                })}

                <TouchableOpacity style={[styles.closeSheetBtn, { borderColor: t.border, marginTop: 16 }]} onPress={() => setBreakdownVisible(false)} activeOpacity={0.85}>
                  <Text style={[styles.closeSheetText, { color: t.textSub }]}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const shadow = (e) => Platform.select({
  android: { elevation: e },
  ios: { shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: e * 1.6, shadowOffset: { width: 0, height: e * 0.5 } },
});

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header band
  header: { paddingHorizontal: 16, paddingBottom: 20, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, ...shadow(6) },
  headerDesktop: { paddingHorizontal: 40, paddingBottom: 26 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerRowDesktop: { width: '100%', maxWidth: DESKTOP_CONTENT_MAX_WIDTH, alignSelf: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandMark: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  headerEyebrow: { color: '#c7d2fe', fontSize: 9.5, fontWeight: '900', letterSpacing: 1.6 },
  headerTitle: { color: '#ffffff', fontSize: 20, fontWeight: '900', marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIconBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  pupilBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 11, paddingVertical: 9, paddingHorizontal: 13 },
  pupilBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },

  // Class key card
  keyCard: { borderRadius: 22, padding: 22, overflow: 'hidden', marginBottom: 16, backgroundColor: '#312e81', ...shadow(8) },
  keyBlobA: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(99,102,241,0.45)', top: -80, right: -50 },
  keyBlobB: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.06)', bottom: -55, left: -25 },
  keyTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  keyEyebrow: { color: '#c7d2fe', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  keyChip: { backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10 },
  keyChipText: { color: '#e0e7ff', fontSize: 9.5, fontWeight: '900', letterSpacing: 1 },
  keyDigits: { color: '#ffffff', fontSize: 40, fontWeight: '900', letterSpacing: 6, marginTop: 12, ...Platform.select({ ios: { fontVariant: ['tabular-nums'] }, android: {} }) },
  keyHint: { color: '#c7d2fe', fontSize: 12.5, lineHeight: 18, marginTop: 12, maxWidth: '94%' },
  keyShareBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', marginTop: 18, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 18 },
  keyShareText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 11, marginBottom: 16 },
  statCell: { flex: 1, borderRadius: 16, borderWidth: 1, paddingVertical: 15, alignItems: 'center', ...shadow(2) },
  statValue: { fontSize: 24, fontWeight: '900' },
  statKey: { fontSize: 11, fontWeight: '700', marginTop: 3, textAlign: 'center' },

  // Card + add-pupil
  card: { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 18, ...shadow(2) },
  addHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  addIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15.5, fontWeight: '900' },
  cardSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  addChevron: { fontSize: 12, fontWeight: '900' },
  scanCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 13, paddingVertical: 14, ...shadow(3) },
  scanCtaText: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
  orLine: { flex: 1, height: 1 },
  orText: { fontSize: 11, fontWeight: '700' },
  paste: { minHeight: 70, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 12.5, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  loadBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  loadBtnText: { fontWeight: '800', fontSize: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12 },

  // Sections
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  clearFilter: { fontSize: 12.5, fontWeight: '800' },
  countBadge: { fontSize: 14, fontWeight: '800' },

  // Class card
  classCard: { width: 138, borderRadius: 18, borderWidth: 1, padding: 15, ...shadow(2) },
  classCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  className: { fontSize: 15, fontWeight: '900' },
  classRateDot: { width: 9, height: 9, borderRadius: 5 },
  classAvgBig: { fontSize: 26, fontWeight: '900', marginTop: 8 },
  classMeta: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },

  // Pupil card
  pupilCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 11, ...shadow(2) },
  pupilName: { fontSize: 15.5, fontWeight: '800' },
  classTag: { borderRadius: 7, paddingVertical: 3, paddingHorizontal: 9 },
  classTagText: { fontSize: 10.5, fontWeight: '800' },
  weakPill: { alignSelf: 'flex-start', borderRadius: 7, paddingVertical: 4, paddingHorizontal: 9, marginTop: 8 },
  chev: { fontSize: 26, fontWeight: '300', marginLeft: 6 },

  // Empty
  empty: { borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', padding: 28, alignItems: 'center' },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '900' },
  emptySub: { fontSize: 12.5, textAlign: 'center', marginTop: 6, lineHeight: 18, maxWidth: '88%' },

  // Scan overlay
  scanFrame: { position: 'absolute', top: '50%', left: '50%', width: 244, height: 244, marginLeft: -122, marginTop: -122, borderWidth: 3, borderColor: '#818cf8', borderRadius: 24 },
  scanCancel: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.18)', paddingVertical: 13, paddingHorizontal: 36, borderRadius: 13 },

  // Detail sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 10 },
  sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#cbd5e1', marginBottom: 12 },
  sheetName: { fontSize: 21, fontWeight: '900', marginTop: 14 },
  bandPill: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, marginTop: 9 },
  bandPillText: { fontWeight: '800', fontSize: 12.5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  classBlock: { borderRadius: 18, borderWidth: 1, padding: 16, marginTop: 16 },
  classBlockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  classBlockTitle: { fontSize: 15, fontWeight: '900' },
  classBlockMeta: { fontSize: 12, fontWeight: '700' },
  subjRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  subjName: { fontSize: 13, fontWeight: '700', flex: 1, marginRight: 10 },
  subjRate: { fontSize: 13, fontWeight: '900' },
  barTrack: { height: 9, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: 9, borderRadius: 5 },
  updatedLine: { fontSize: 11.5, textAlign: 'center', marginTop: 20 },
  removeBtn: { marginTop: 14, borderRadius: 13, paddingVertical: 14, alignItems: 'center' },
  removeBtnText: { color: '#dc2626', fontWeight: '800', fontSize: 14 },
  closeSheetBtn: { marginTop: 10, borderRadius: 13, borderWidth: 1, paddingVertical: 14, alignItems: 'center' },
  closeSheetText: { fontWeight: '800', fontSize: 14 },

  // Import + answer-breakdown
  importCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  viewBreakdownBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 13, paddingVertical: 14, marginTop: 16, ...shadow(3) },
  viewBreakdownText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  importTitle: { fontSize: 20, fontWeight: '900', marginTop: 6 },
  importSub: { fontSize: 12.5, lineHeight: 18, marginTop: 8, marginBottom: 16 },
  importInput: { minHeight: 90, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 12.5, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  testBlock: { borderRadius: 16, borderWidth: 1, padding: 14, marginTop: 12 },
  testHead: { flexDirection: 'row', alignItems: 'center' },
  testTitle: { fontSize: 14.5, fontWeight: '800' },
  testMeta: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  testPct: { fontSize: 16, fontWeight: '900' },
  missSubj: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5, marginBottom: 8 },
  missCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  missQ: { fontSize: 13.5, fontWeight: '700', lineHeight: 19 },
  missPickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  missPickLabel: { fontSize: 9.5, fontWeight: '900', letterSpacing: 0.8 },
  missPickVal: { flex: 1, fontSize: 13, fontWeight: '800' },
  breakdownTag: { borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 },
  breakdownTagText: { fontSize: 9.5, fontWeight: '900' },
});
