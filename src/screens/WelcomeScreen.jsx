import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Animated,
  StatusBar,
  Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');

export default function WelcomeScreen({ onFinish }) {
  // Animation hooks for sleek production feel
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    // Run content entry animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]).start();

    // ── CONFIGURABLE WAIT TIME FOR USER READING ──
    // 8.5 seconds ensures ample time to read the mission statement fully
    const timer = setTimeout(() => {
      // Fade out completely before transitioning
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }).start(() => {
        if (typeof onFinish === 'function') {
          onFinish();
        }
      });
    }, 8500);

    return () => clearTimeout(timer);
  }, [fadeAnim, slideAnim]);

  return (
    <View style={styles.rootContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      
      <Animated.ScrollView 
        style={[styles.scrollView, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* BRAND IDENTITY HEADER BLOCK */}
        <View style={styles.brandHeroBlock}>
          <Text style={styles.mainTitle}>PrepStation Pro</Text>
          <Text style={styles.tagline}>
            YOUR BEST EXAMINATION COMPANION THAT BUILDS CONFIDENCE
          </Text>
          <View style={styles.brandDividerLine} />
          <Text style={styles.corporateCredit}>
            BUILT BY DELMA MATIA GROUPS (DMS GROUPS)
          </Text>
        </View>

        {/* CORE MISSION STATEMENT & TARGET DEMOGRAPHIC */}
        <View style={styles.missionCard}>
          <Text style={styles.sectionHeading}>Why We Built This App & Who It Is For</Text>
          
          <Text style={styles.missionBodyText}>
            The app is for those who after exposure to study & past questions, then want to genuinely know their strength and build examination confidence through exposure to both basic and premium questions that matches standard requirement for <Text style={styles.highlightText}>UTME (JAMB)</Text>, <Text style={styles.highlightText}>WAEC (SSCE)</Text> & <Text style={styles.highlightText}>NECO (NABTEB INCLUSIVE)</Text>.
          </Text>

          {/* CRITICAL WARNING BENCHMARK */}
          <View style={styles.warningCalloutContainer}>
            <Text style={styles.warningCalloutTxt}>
              IF YOU DON'T USE THIS APP, YOU ARE NOT ADVISED TO EXPECT TOO MUCH FROM THE COMING EXAM.
            </Text>
          </View>
        </View>
      </Animated.ScrollView>

      {/* FOOTER SYSTEM VERSION MARKER */}
      <Animated.View style={[styles.systemFooter, { opacity: fadeAnim }]}>
        <Text style={styles.footerLoadingIndicator}>Loading secure examination base...</Text>
        <View style={styles.loadingBarTrack}>
          <Animated.View style={styles.loadingBarFill} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#0f172a', // Deep corporate dark midnight theme matching your application colors
    justifyContent: 'space-between',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
    alignItems: 'center',
  },
  brandHeroBlock: {
    alignItems: 'center',
    marginBottom: 40,
    width: '100%',
  },
  mainTitle: {
    fontSize: 38,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -1,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  tagline: {
    fontSize: 16,
    fontWeight: '800',
    color: '#38bdf8', // Accent vibrant color pop
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 24,
    paddingHorizontal: 12,
    letterSpacing: 0.3,
  },
  brandDividerLine: {
    width: 80,
    height: 4,
    backgroundColor: '#10b981',
    borderRadius: 2,
    marginVertical: 20,
  },
  corporateCredit: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 1.5,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  missionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 14,
    textAlign: 'center',
  },
  missionBodyText: {
    fontSize: 15,
    color: '#cbd5e1',
    lineHeight: 25,
    textAlign: 'center',
    fontWeight: '500',
  },
  highlightText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  warningCalloutContainer: {
    marginTop: 24,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  warningCalloutTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fca5a5',
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  systemFooter: {
    paddingHorizontal: 32,
    paddingBottom: 40,
    alignItems: 'center',
    width: '100%',
  },
  footerLoadingIndicator: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 10,
  },
  loadingBarTrack: {
    width: width * 0.4,
    height: 3,
    backgroundColor: '#1e293b',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  loadingBarFill: {
    width: '100%',
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 1.5,
  },
});