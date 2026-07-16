import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Alert,
  Animated,
  Platform,
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMyTeacherCode, decodePGMapPayload, TEACHER_CODE_LENGTH } from '../services/PGMapService';
import {
  getRosterPupils,
  upsertRosterPupil,
  deleteRosterPupil,
} from '../database/queries';

// ─────────────────────────────────────────────────────────────────────────────
// Rate colour scale — one meaning per band, reused everywhere a rate appears.
// ─────────────────────────────────────────────────────────────────────────────
const rateColor = (r) =>
  r >= 75 ? '#10b981' : r >= 60 ? '#3b82f6' : r >= 40 ? '#f59e0b' : '#ef4444';
const rateLabel = (r) =>
  r >= 75 ? 'Strong' : r >= 60 ? 'Steady' : r >= 40 ? 'Needs work' : 'At risk';

// Headline rate for a pupil = average of their class rates, weighted by how many
// tests sit behind each (so a class with more evidence counts for more).
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

// Weakest subject across every class a pupil has tested in.
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
// A circular rate ring — the signature data element of teacher mode.
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
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </G>
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontSize: size * 0.30, fontWeight: '900', color: textColor }}>{clamped}</Text>
        {size >= 92 && (
          <Text style={{ fontSize: size * 0.11, fontWeight: '800', color: textColor, opacity: 0.55, letterSpacing: 1 }}>
            RATE
          </Text>
        )}
      </View>
    </View>
  );
}

export default function TeacherHomeScreen({ onSwitchToPupil }) {
  const insets = useSafeAreaInsets();
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [myCode, setMyCode] = useState(null);
  const [roster, setRoster] = useState([]);
  const [pasteValue, setPasteValue] = useState('');
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', msg }
  const [selectedClass, setSelectedClass] = useState(null);
  const [detailPupil, setDetailPupil] = useState(null);
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLock = useRef(false);

  const fade = useRef(new Animated.Value(0)).current;

  const t = {
    bg:        isDarkMode ? '#0f172a' : '#f8fafc',
    card:      isDarkMode ? '#1e293b' : '#ffffff',
    textMain:  isDarkMode ? '#f8fafc' : '#0f172a',
    textSub:   isDarkMode ? '#94a3b8' : '#64748b',
    border:    isDarkMode ? '#334155' : '#e2e8f0',
    innerPanel:isDarkMode ? '#0f172a' : '#f1f5f9',
  };
  const ACCENT = '#6366f1';
  const ACCENT_DEEP = '#4f46e5';

  const loadRoster = useCallback(async () => {
    const list = await getRosterPupils();
    setRoster(list);
  }, []);

  useEffect(() => {
    (async () => {
      setMyCode(await getMyTeacherCode());
      await loadRoster();
    })();
    Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [loadRoster, fade]);

  // ── derived views ──
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

  // ── actions ──
  // Shared pipeline for a pupil string, whether it was pasted or scanned.
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

  const openScanner = async () => {
    let perm = permission;
    if (!perm || !perm.granted) {
      perm = await requestPermission();
    }
    if (!perm || !perm.granted) {
      Alert.alert('Camera needed', 'Allow camera access to scan a pupil\u2019s QR code, or paste the string instead.');
      return;
    }
    scanLock.current = false;
    setStatus(null);
    setScanModalVisible(true);
  };

  const onBarcodeScanned = async ({ data }) => {
    if (scanLock.current) return; // the camera fires repeatedly — take the first hit only
    scanLock.current = true;
    const res = await processPupilString(data);
    setScanModalVisible(false);
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
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteRosterPupil(pupil.pupilDeviceCode);
          setDetailPupil(null);
          loadRoster();
        },
      },
    ]);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: t.bg, paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={[styles.eyebrow, { color: ACCENT }]}>PREPSTATION PRO</Text>
          <Text style={[styles.topTitle, { color: t.textMain }]}>Teacher</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={() => setIsDarkMode((v) => !v)}
            style={[styles.iconBtn, { backgroundColor: t.card, borderColor: t.border }]}
          >
            <Text style={{ fontSize: 16 }}>{isDarkMode ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onSwitchToPupil} style={[styles.roleSwitch, { borderColor: ACCENT }]}>
            <Text style={{ fontSize: 12 }}>🎓</Text>
            <Text style={[styles.roleSwitchText, { color: ACCENT }]}>Pupil mode</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Animated.View style={{ flex: 1, opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* CLASS KEY — the thing a teacher reads aloud to their pupils */}
          <View style={[styles.keyCard, { backgroundColor: ACCENT_DEEP }]}>
            <View style={styles.keyBlobA} />
            <View style={styles.keyBlobB} />
            <Text style={styles.keyEyebrow}>YOUR CLASS KEY</Text>
            <Text style={styles.keyDigits} selectable>{myCode || '•'.repeat(TEACHER_CODE_LENGTH)}</Text>
            <Text style={styles.keyHint}>
              Read this to your class. Each pupil enters it once, and their results come back to you.
            </Text>
            <TouchableOpacity style={styles.keyShareBtn} onPress={shareMyKey}>
              <Text style={styles.keyShareText}>🔗  Share key</Text>
            </TouchableOpacity>
          </View>

          {/* ADD A PUPIL */}
          <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
            <Text style={[styles.cardTitle, { color: t.textMain }]}>Add a pupil's results</Text>
            <Text style={[styles.cardSub, { color: t.textSub }]}>
              Paste a pupil's PG Map string, or scan their code.
            </Text>
            <TextInput
              style={[styles.paste, { backgroundColor: t.innerPanel, color: t.textMain, borderColor: t.border }]}
              placeholder="Paste PG Map string here"
              placeholderTextColor={isDarkMode ? '#475569' : '#94a3b8'}
              value={pasteValue}
              onChangeText={(v) => { setPasteValue(v); if (status) setStatus(null); }}
              multiline
              textAlignVertical="top"
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: ACCENT }]} onPress={handleAddFromString}>
                <Text style={styles.primaryBtnText}>Load results</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.ghostBtn, { borderColor: ACCENT }]} onPress={openScanner}>
                <Text style={[styles.ghostBtnText, { color: ACCENT }]}>📷  Scan code</Text>
              </TouchableOpacity>
            </View>
            {status && (
              <View style={[styles.statusRow, { backgroundColor: status.type === 'success' ? '#ecfdf5' : '#fef2f2' }]}>
                <Text style={{ color: status.type === 'success' ? '#047857' : '#b91c1c', fontSize: 12.5, fontWeight: '700' }}>
                  {status.type === 'success' ? '✓ ' : '⚠ '}{status.msg}
                </Text>
              </View>
            )}
          </View>

          {/* STATS STRIP */}
          <View style={styles.statsRow}>
            {[
              { k: 'Pupils', v: stats.pupils },
              { k: 'Classes', v: stats.classes },
              { k: 'Class average', v: roster.length ? `${stats.avg}%` : '—' },
            ].map((s) => (
              <View key={s.k} style={[styles.statCell, { backgroundColor: t.card, borderColor: t.border }]}>
                <Text style={[styles.statValue, { color: t.textMain }]}>{s.v}</Text>
                <Text style={[styles.statKey, { color: t.textSub }]}>{s.k}</Text>
              </View>
            ))}
          </View>

          {/* CLASSES */}
          {classes.length > 0 && (
            <>
              <View style={styles.sectionHead}>
                <Text style={[styles.sectionTitle, { color: t.textMain }]}>Classes</Text>
                {selectedClass && (
                  <TouchableOpacity onPress={() => setSelectedClass(null)}>
                    <Text style={[styles.clearFilter, { color: ACCENT }]}>Clear filter</Text>
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
                {classes.map((c) => {
                  const active = selectedClass === c.class;
                  return (
                    <TouchableOpacity
                      key={c.class}
                      activeOpacity={0.85}
                      onPress={() => setSelectedClass(active ? null : c.class)}
                      style={[
                        styles.classCard,
                        { backgroundColor: active ? ACCENT : t.card, borderColor: active ? ACCENT : t.border },
                      ]}
                    >
                      <Text style={[styles.className, { color: active ? '#fff' : t.textMain }]}>{c.class}</Text>
                      <Text style={[styles.classMeta, { color: active ? '#e0e7ff' : t.textSub }]}>
                        {c.count} {c.count === 1 ? 'pupil' : 'pupils'}
                      </Text>
                      <View style={[styles.classAvgPill, { backgroundColor: active ? 'rgba(255,255,255,0.18)' : t.innerPanel }]}>
                        <View style={[styles.dot, { backgroundColor: rateColor(c.avg) }]} />
                        <Text style={[styles.classAvgText, { color: active ? '#fff' : t.textMain }]}>{c.avg}% avg</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}

          {/* ROSTER */}
          <View style={[styles.sectionHead, { marginTop: 18 }]}>
            <Text style={[styles.sectionTitle, { color: t.textMain }]}>
              Pupils{selectedClass ? ` · ${selectedClass}` : ''}
            </Text>
            {roster.length > 0 && (
              <Text style={[styles.countBadge, { color: t.textSub }]}>{filteredRoster.length}</Text>
            )}
          </View>

          {filteredRoster.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: t.card, borderColor: t.border }]}>
              <Text style={{ fontSize: 34, marginBottom: 8 }}>👥</Text>
              <Text style={[styles.emptyTitle, { color: t.textMain }]}>
                {roster.length === 0 ? 'No pupils yet' : 'No pupils in this class'}
              </Text>
              <Text style={[styles.emptySub, { color: t.textSub }]}>
                {roster.length === 0
                  ? 'Share your class key, then load a pupil’s PG Map to see how they’re doing.'
                  : 'Clear the filter to see your whole roster.'}
              </Text>
            </View>
          ) : (
            filteredRoster.map((p) => {
              const weak = weakestSubject(p.performance);
              return (
                <TouchableOpacity
                  key={p.pupilDeviceCode}
                  activeOpacity={0.85}
                  onPress={() => setDetailPupil(p)}
                  style={[styles.pupilCard, { backgroundColor: t.card, borderColor: t.border }]}
                >
                  <RateRing rate={p.overallRate} size={56} stroke={6} track={t.innerPanel} textColor={t.textMain} />
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={[styles.pupilName, { color: t.textMain }]} numberOfLines={1}>{p.fullName}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
                      {(p.classLevels || []).map((cl) => (
                        <View key={cl} style={[styles.classTag, { backgroundColor: t.innerPanel }]}>
                          <Text style={[styles.classTagText, { color: t.textSub }]}>{cl}</Text>
                        </View>
                      ))}
                    </View>
                    {weak && (
                      <Text style={[styles.weakLine, { color: t.textSub }]} numberOfLines={1}>
                        Weakest: <Text style={{ color: rateColor(weak.rate), fontWeight: '800' }}>{weak.subject} {weak.rate}%</Text>
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.chev, { color: t.textSub }]}>›</Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </Animated.View>

      {/* SCAN A PUPIL'S QR */}
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
          <View
            pointerEvents="none"
            style={{
              position: 'absolute', top: '50%', left: '50%', width: 244, height: 244,
              marginLeft: -122, marginTop: -122, borderWidth: 3, borderColor: ACCENT, borderRadius: 22,
            }}
          />
          <TouchableOpacity
            onPress={() => setScanModalVisible(false)}
            style={{
              position: 'absolute', bottom: insets.bottom + 32, alignSelf: 'center',
              backgroundColor: 'rgba(255,255,255,0.16)', paddingVertical: 13, paddingHorizontal: 34, borderRadius: 12,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* PUPIL DETAIL */}
      <Modal visible={!!detailPupil} transparent animationType="slide" onRequestClose={() => setDetailPupil(null)}>
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { backgroundColor: t.bg, paddingBottom: insets.bottom + 16 }]}>
            {detailPupil && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.sheetHandle} />
                <View style={{ alignItems: 'center', marginTop: 6 }}>
                  <RateRing rate={detailPupil.overallRate} size={104} stroke={9} track={t.innerPanel} textColor={t.textMain} />
                  <Text style={[styles.sheetName, { color: t.textMain }]}>{detailPupil.fullName}</Text>
                  <View style={[styles.bandPill, { backgroundColor: rateColor(detailPupil.overallRate) }]}>
                    <Text style={styles.bandPillText}>{rateLabel(detailPupil.overallRate)} · {detailPupil.overallRate}%</Text>
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
                      <View key={s.subject} style={{ marginTop: 10 }}>
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

                <Text style={[styles.updatedLine, { color: t.textSub }]}>
                  Updated {detailPupil.updatedAt ? new Date(detailPupil.updatedAt).toLocaleDateString() : '—'}
                </Text>

                <TouchableOpacity style={styles.removeBtn} onPress={() => removePupil(detailPupil)}>
                  <Text style={styles.removeBtnText}>Remove pupil</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.closeSheetBtn, { borderColor: t.border }]} onPress={() => setDetailPupil(null)}>
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    paddingHorizontal: 16, paddingBottom: 10, paddingTop: 6,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  topTitle: { fontSize: 24, fontWeight: '900', marginTop: 1 },
  iconBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  roleSwitch: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12,
  },
  roleSwitchText: { fontSize: 12.5, fontWeight: '800' },

  // Class key
  keyCard: { borderRadius: 20, padding: 22, overflow: 'hidden', marginBottom: 16 },
  keyBlobA: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(139,92,246,0.35)', top: -70, right: -40 },
  keyBlobB: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.08)', bottom: -50, left: -20 },
  keyEyebrow: { color: '#c7d2fe', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  keyDigits: { color: '#ffffff', fontSize: 46, fontWeight: '900', letterSpacing: 10, marginTop: 8, ...Platform.select({ ios: { fontVariant: ['tabular-nums'] }, android: {} }) },
  keyHint: { color: '#e0e7ff', fontSize: 12.5, lineHeight: 18, marginTop: 10, maxWidth: '92%' },
  keyShareBtn: { alignSelf: 'flex-start', marginTop: 16, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  keyShareText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },

  // Generic card
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '900' },
  cardSub: { fontSize: 12.5, marginTop: 3, lineHeight: 18 },
  paste: { marginTop: 12, minHeight: 74, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 12.5, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  primaryBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  ghostBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1.5 },
  ghostBtnText: { fontWeight: '800', fontSize: 14 },
  statusRow: { marginTop: 12, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  statCell: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '900' },
  statKey: { fontSize: 11, fontWeight: '700', marginTop: 3, textAlign: 'center' },

  // Sections
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '900' },
  clearFilter: { fontSize: 12.5, fontWeight: '800' },
  countBadge: { fontSize: 14, fontWeight: '800' },

  // Class card
  classCard: { width: 130, borderRadius: 16, borderWidth: 1, padding: 14 },
  className: { fontSize: 16, fontWeight: '900' },
  classMeta: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  classAvgPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 10, marginTop: 12 },
  classAvgText: { fontSize: 12, fontWeight: '800' },
  dot: { width: 8, height: 8, borderRadius: 4 },

  // Pupil card
  pupilCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 10 },
  pupilName: { fontSize: 15.5, fontWeight: '800' },
  classTag: { borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 },
  classTagText: { fontSize: 10.5, fontWeight: '800' },
  weakLine: { fontSize: 12, marginTop: 6 },
  chev: { fontSize: 26, fontWeight: '300', marginLeft: 6 },

  // Empty
  empty: { borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', padding: 26, alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '900' },
  emptySub: { fontSize: 12.5, textAlign: 'center', marginTop: 6, lineHeight: 18, maxWidth: '90%' },

  // Detail sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10 },
  sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#cbd5e1', marginBottom: 10 },
  sheetName: { fontSize: 20, fontWeight: '900', marginTop: 12 },
  bandPill: { borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, marginTop: 8 },
  bandPillText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  classBlock: { borderRadius: 16, borderWidth: 1, padding: 14, marginTop: 16 },
  classBlockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  classBlockTitle: { fontSize: 15, fontWeight: '900' },
  classBlockMeta: { fontSize: 12, fontWeight: '700' },
  subjRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  subjName: { fontSize: 13, fontWeight: '700', flex: 1, marginRight: 10 },
  subjRate: { fontSize: 13, fontWeight: '900' },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  updatedLine: { fontSize: 11.5, textAlign: 'center', marginTop: 18 },
  removeBtn: { marginTop: 14, backgroundColor: '#fef2f2', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  removeBtnText: { color: '#dc2626', fontWeight: '800', fontSize: 14 },
  closeSheetBtn: { marginTop: 10, borderRadius: 12, borderWidth: 1, paddingVertical: 13, alignItems: 'center' },
  closeSheetText: { fontWeight: '800', fontSize: 14 },
});
