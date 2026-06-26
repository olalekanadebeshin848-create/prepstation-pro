import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context'; 
import { initDatabase } from './src/database/setup';
import { AppProvider, useApp } from './src/context/AppContext';

// Import your core application screens
import HomeScreen from './src/screens/HomeScreen';
import PracticeScreen from './src/screens/PracticeScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';

function MainNavigationRouter() {
  const { isCheckingSecurity } = useApp(); // Removed 'isActivated' check
  
  const [currentView, setCurrentView] = useState('WELCOME'); 
  const [activeSession, setActiveSession] = useState(null);

  // Security/loading state check
  if (isCheckingSecurity) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  // --- EXPLICIT COMPONENT MOUNT ROUTER SWITCH ---
  // The app will now flow: WELCOME -> HOME
  
  if (currentView === 'WELCOME') {
    return (
      <WelcomeScreen 
        onFinish={() => {
          setCurrentView('HOME');
        }} 
      />
    );
  }
  
  if (currentView === 'ANALYTICS') {
    return (
      <AnalyticsScreen 
        onBack={() => {
          setCurrentView('HOME');
        }} 
      />
    );
  }

  if (currentView === 'PRACTICE') {
    return (
      <PracticeScreen 
        sessionPayload={activeSession} 
        onExit={() => {
          setActiveSession(null);
          setCurrentView('HOME');
        }} 
      />
    );
  }

  return (
    <HomeScreen 
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
      .catch((err) => console.error("Database boot failure in App.js:", err));
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