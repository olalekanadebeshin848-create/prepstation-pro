import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDatabase } from './src/database/setup';
import { AppProvider, useApp } from './src/context/AppContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HomeScreen from './src/screens/HomeScreen';
import PracticeScreen from './src/screens/PracticeScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import ProfileScreen from './src/screens/ProfileScreen';

SplashScreen.preventAutoHideAsync();

function MainNavigationRouter() {
  const { isCheckingSecurity } = useApp();
  const [currentView, setCurrentView] = useState('WELCOME');
  const [activeSession, setActiveSession] = useState(null);
  const [homeReloadKey, setHomeReloadKey] = useState(0);

  if (isCheckingSecurity) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (currentView === 'WELCOME') {
    return (
      <WelcomeScreen
        onFinish={async () => {
          // After welcome, check if student has already filled their profile
          try {
            const profile = await AsyncStorage.getItem('studentProfile');
            if (profile) {
              setCurrentView('HOME');
            } else {
              setCurrentView('PROFILE');
            }
          } catch {
            setCurrentView('PROFILE');
          }
        }}
      />
    );
  }

  if (currentView === 'PROFILE') {
    return (
      <ProfileScreen
        onComplete={() => setCurrentView('HOME')}
      />
    );
  }

  if (currentView === 'ANALYTICS') {
    return <AnalyticsScreen onBack={() => setCurrentView('HOME')} />;
  }

  if (currentView === 'PRACTICE') {
    return (
      <PracticeScreen
        sessionPayload={activeSession}
        onExit={() => {
          setActiveSession(null);
          setHomeReloadKey(k => k + 1); // signal HomeScreen to reload
          setCurrentView('HOME');
        }}
      />
    );
  }

  return (
    <HomeScreen
      key={homeReloadKey}
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
