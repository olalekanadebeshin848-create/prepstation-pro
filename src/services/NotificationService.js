import Constants from 'expo-constants';
import { Platform } from 'react-native';

let Notifications = null;

console.log('🔍 Constants.appOwnership:', Constants.appOwnership);
console.log('🔍 Constants.executionEnvironment:', Constants.executionEnvironment);

// ── FIX: use executionEnvironment instead of the deprecated appOwnership check ──
// executionEnvironment is 'standalone' for EAS builds, 'storeClient' for Expo Go,
// and 'bare' for bare workflow. appOwnership is unreliable on SDK 49+.
if (Constants.executionEnvironment !== 'storeClient') {
  try {
    Notifications = require('expo-notifications');
    console.log('✅ expo-notifications module loaded successfully');

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    console.warn('❌ expo-notifications could not be loaded:', e.message);
  }
} else {
  console.log('⚠️ Running inside Expo Go (storeClient) — notifications disabled');
}

export async function registerForPushNotificationsAsync() {
  console.log('🔍 registerForPushNotificationsAsync called. Notifications module:', Notifications ? 'LOADED' : 'NULL');

  if (!Notifications) {
    console.warn('Notifications not available in this environment.');
    return false;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('🔍 Existing permission status:', existingStatus);
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      console.log('🔍 Requested permission, new status:', status);
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('❌ Permission not granted, final status:', finalStatus);
      return false;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#a855f7',
      });
      console.log('✅ Android notification channel created');
    }

    console.log('✅ registerForPushNotificationsAsync succeeded');
    return true;
  } catch (e) {
    console.error('❌ registerForPushNotificationsAsync error:', e);
    return false;
  }
}

export async function scheduleDailyReminder(hour, minute, note = 'Time to study!') {
  console.log('🔍 scheduleDailyReminder called:', hour, minute, note);

  if (!Notifications) {
    console.warn('Notifications not available — alarm not scheduled.');
    return false;
  }

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('🔍 Cleared old scheduled notifications');

    const result = await Notifications.scheduleNotificationAsync({
      content: {
        title: '📚 PrepStation Study Alarm',
        body: note,
        sound: true,
      },
      trigger: {
        hour,
        minute,
        repeats: true,
      },
    });

    console.log('✅ scheduleNotificationAsync result (notification id):', result);
    return true;
  } catch (e) {
    console.error('❌ scheduleDailyReminder error:', e);
    return false;
  }
}

export async function scheduleExamCountdown(dateString, examName) {
  if (!Notifications) {
    console.log(`[Mock] Exam countdown for ${examName} on ${dateString}`);
    return true;
  }

  try {
    const examDate = new Date(dateString);
    if (isNaN(examDate.getTime())) {
      console.warn('Invalid exam date provided.');
      return false;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `⏳ ${examName} is coming up!`,
        body: `Your exam is on ${dateString}. Keep studying with PrepStation!`,
        sound: true,
      },
      trigger: {
        date: examDate,
      },
    });

    return true;
  } catch (e) {
    console.error('scheduleExamCountdown error:', e);
    return false;
  }
}