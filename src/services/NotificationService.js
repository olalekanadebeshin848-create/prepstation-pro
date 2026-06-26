import Constants from 'expo-constants';
import { Platform } from 'react-native';

let Notifications = null;

if (Constants.appOwnership !== 'expo') {
  try {
    Notifications = require('expo-notifications');

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    console.warn('expo-notifications could not be loaded.');
  }
}

export async function registerForPushNotificationsAsync() {
  if (!Notifications) {
    console.warn('Notifications not available in this environment.');
    return false;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return false;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#a855f7',
      });
    }

    return true;
  } catch (e) {
    console.error('registerForPushNotificationsAsync error:', e);
    return false;
  }
}

export async function scheduleDailyReminder(hour, minute, note = 'Time to study!') {
  if (!Notifications) {
    console.warn('Notifications not available — alarm not scheduled.');
    return false;
  }

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();

    await Notifications.scheduleNotificationAsync({
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

    return true;
  } catch (e) {
    console.error('scheduleDailyReminder error:', e);
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