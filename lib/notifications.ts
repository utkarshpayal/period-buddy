import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { authApi } from './api';

// Configure notification behavior for when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Registers the device for push notifications, retrieves the native FCM/APNs token,
 * and updates it on the backend.
 */
export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    if (Platform.OS === 'android') {
      // The custom sound must be referenced by its bundled filename *with*
      // extension (expo-notifications copies ./lib/notification.wav into
      // res/raw/notification.wav at build time). Using 'notification' without
      // the extension makes Android silently fall back to no sound.
      //
      // We keep the channel id 'default' because the backend's FCM payloads
      // target it by id; changing the id could stop background notifications
      // from displaying. Android locks a channel's settings after first
      // creation, so on devices that already created the old silent 'default'
      // channel this corrected sound only applies after a reinstall (a fresh
      // build install recreates the channel correctly).
      await Notifications.setNotificationChannelAsync('default', {
        name: 'General',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: 'notification.wav',
        enableVibrate: true,
      });
    }

    if (!Device.isDevice) {
      console.log('Must use physical device for Push Notifications');
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notifications!');
      return null;
    }

    // Get the native device push token (FCM for Android, APNs for iOS)
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const token = tokenData.data;

    // Update the token on the backend
    await authApi.updateFcmToken(token);

    return token;
  } catch (error) {
    console.error('Failed to register for push notifications:', error);
    return null;
  }
}
