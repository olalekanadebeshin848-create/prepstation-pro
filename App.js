import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState, useCallback } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDatabase } from './src/database/setup';
import { AppProvider, useApp } from './src/context/AppContext';
import HomeScreen from './src/screens/HomeScreen';
import PracticeScreen from './src/screens/PracticeScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';

SplashScreen.preventAutoHideAsync();

function MainNavigationRouter() {
  const { isCheckingSecurity } = useApp();
  const [currentView, setCurrentView] = useState('WELCOME');
  const [activeSession, setActiveSession] = useState(null);

  // ── Holds the completionMeta returned from ResultScreen via onSessionComplete.
  // HomeScreen reads this when it mounts/re-renders after PRACTICE ends.
  const [pendingCompletionMeta, setPendingCompletionMeta] = useState(null);

  if (isCheckingSecurity) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (currentView === 'WELCOME') {
    return <WelcomeScreen onFinish={() => setCurrentView('HOME')} />;
  }

  if (currentView === 'ANALYTICS') {
    return <AnalyticsScreen onBack={() => setCurrentView('HOME')} />;
  }

  if (currentView === 'PRACTICE') {
    return (
      <PracticeScreen
        sessionPayload={{
          ...activeSession,
          // ── onSessionComplete is called by ResultScreen just before onExit.
          // It receives completionMeta = { nextBundleId, nextStrataIdx, examCategory }
          // which was already written to AsyncStorage by applyBundleCompletionToStorage.
          // We store it here so HomeScreen can consume it on the next render.
          onSessionComplete: (completionMeta) => {
            setPendingCompletionMeta(completionMeta);
          },
        }}
        onExit={() => {
          setActiveSession(null);
          setCurrentView('HOME');
          // Note: pendingCompletionMeta is already set by onSessionComplete
          // which fires BEFORE onExit. HomeScreen will pick it up on render.
        }}
      />
    );
  }

  // HOME view — pass pendingCompletionMeta so HomeScreen can reload
  // strata from AsyncStorage and select the next unlocked bundle.
  return (
    <HomeScreen
      pendingCompletionMeta={pendingCompletionMeta}
      onCompletionMetaConsumed={() => setPendingCompletionMeta(null)}
      onStartPractice={(payload) => {
        setActiveSession(payload);
        setCurrentView('PRACTICE');
      }}
      onOpenAnalytics={() => {
        setActiveSession(null);
        setCurrentView('ANALYTICS');
      }}
    />
  );
}

export default function App() {
  const [isDbReady, setIsDbReady] = useState(false);

  useEffect(() => {
    initDatabase()
      .then(() => setIsDbReady(true))
      .catch((err) => console.error('Database boot failure:', err))
      .finally(() => SplashScreen.hideAsync());
  }, []);

  if (!isDbReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AppProvider>
        <MainNavigationRouter />
      </AppProvider>
    </SafeAreaProvider>
  );
}