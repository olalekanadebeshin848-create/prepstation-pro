import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Animated,
  StatusBar,
  Dimensions,
  ImageBackground,
} from 'react-native';

const { width } = Dimensions.get('window');

export default function WelcomeScreen({ onFinish }) {
  const heroFade = useRef(new Animated.Value(0)).current;
  const heroSlide = useRef(new Animated.Value(28)).current;
  const cardFade = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(22)).current;
  const loaderWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(heroFade, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(heroSlide, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]),
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(cardFade, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(cardSlide, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    ]).start();

    Animated.timing(loaderWidth, {
      toValue: width * 0.5,
      duration: 7800,
      useNativeDriver: false,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(heroFade, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }).start(() => {
        if (typeof onFinish === 'function') onFinish();
      });
    }, 8500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <ImageBackground
      source={require('../../assets/images/welcome-bg.png')}
      style={styles.root}
      resizeMode="cover"
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Top fade — darkens status bar area only */}
      <View style={styles.overlayTop} />

      {/* Bottom panel dark base */}
      <View style={styles.overlayBottom} />

      {/* ── HERO — sits over the photo ── */}
      <Animated.View
        style={[
          styles.heroSection,
          { opacity: heroFade, transform: [{ translateY: heroSlide }] },
        ]}
      >
        {/* Live badge */}
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveBadgeText}>EXAM SEASON IS HERE</Text>
        </View>

        {/* App name — the hero element */}
        <Text style={styles.brandPrep}>Prep</Text>
        <View style={styles.brandStationRow}>
          <Text style={styles.brandStation}>Station</Text>
          <View style={styles.proPill}>
            <Text style={styles.proText}>PRO</Text>
          </View>
        </View>

        <Text style={styles.heroTagline}>
          Your edge into the{'\n'}examination hall.
        </Text>
      </Animated.View>

      {/* ── BOTTOM INFO CARD ── */}
      <Animated.View
        style={[
          styles.bottomCard,
          { opacity: cardFade, transform: [{ translateY: cardSlide }] },
        ]}
      >
        {/* Exam bodies */}
        <View style={styles.examRow}>
          {['JAMB', 'WAEC', 'NECO', 'NABTEB'].map((body, i) => (
            <React.Fragment key={body}>
              <Text style={styles.examBody}>{body}</Text>
              {i < 3 && <View style={styles.examDot} />}
            </React.Fragment>
          ))}
        </View>

        <View style={styles.divider} />

        {/* Core message */}
        <Text style={styles.coreMessage}>
          Official syllabus. Rigorous questions.{'\n'}Built for candidates who mean business.
        </Text>

        {/* Advisory */}
        <View style={styles.advisory}>
          <Text style={styles.advisoryIcon}>⚠</Text>
          <Text style={styles.advisoryText}>
            Brace yourself — these questions are not for the faint-hearted.
          </Text>
        </View>

        {/* Loader */}
        <View style={styles.loaderBlock}>
          <View style={styles.loaderTrack}>
            <Animated.View style={[styles.loaderFill, { width: loaderWidth }]} />
          </View>
          <Text style={styles.loaderLabel}>Preparing your environment…</Text>
        </View>

        {/* Credit */}
        <Text style={styles.credit}>PrepStation Pro · Delma Matia Groups</Text>
      </Animated.View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'space-between',
  },

  overlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    backgroundColor: 'rgba(8, 2, 5, 0.75)',
  },
  overlayBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '48%',
    backgroundColor: 'rgba(8, 2, 5, 0.88)',
  },

  /* ── HERO ── */
  heroSection: {
    paddingTop: 62,
    paddingHorizontal: 28,
  },

  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    backgroundColor: 'rgba(245, 200, 66, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 200, 66, 0.35)',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 12,
    marginBottom: 22,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f5c842',
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#f5c842',
    letterSpacing: 2,
  },

  /* Brand name treatment */
  brandPrep: {
    fontSize: 64,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -2,
    lineHeight: 64,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  brandStationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  brandStation: {
    fontSize: 64,
    fontWeight: '900',
    color: '#f5c842',
    letterSpacing: -2,
    lineHeight: 68,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  proPill: {
    backgroundColor: '#f5c842',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    alignSelf: 'center',
    marginBottom: 4,
  },
  proText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1a0a00',
    letterSpacing: 1.5,
  },

  heroTagline: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.72)',
    lineHeight: 24,
    letterSpacing: 0.2,
  },

  /* ── BOTTOM CARD ── */
  bottomCard: {
    marginHorizontal: 16,
    marginBottom: 40,
    backgroundColor: 'rgba(14, 4, 9, 0.75)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 22,
  },

  /* Exam body row */
  examRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16,
  },
  examBody: {
    fontSize: 12,
    fontWeight: '800',
    color: '#f5c842',
    letterSpacing: 1.2,
  },
  examDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(245,200,66,0.4)',
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginBottom: 16,
  },

  coreMessage: {
    fontSize: 13.5,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 16,
  },

  /* Advisory */
  advisory: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(239,68,68,0.09)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.22)',
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  advisoryIcon: {
    fontSize: 13,
    color: '#ef4444',
    marginTop: 1,
  },
  advisoryText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#fca5a5',
    lineHeight: 19,
    flex: 1,
  },

  /* Loader */
  loaderBlock: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  loaderTrack: {
    width: width * 0.5,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  loaderFill: {
    height: '100%',
    backgroundColor: '#f5c842',
    borderRadius: 1,
  },
  loaderLabel: {
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.32)',
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  credit: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.22)',
    textAlign: 'center',
    fontWeight: '500',
    letterSpacing: 0.4,
  },
});