import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert,
  Clipboard
} from 'react-native';
import { useApp } from '../context/AppContext';
import { saveSuccessfulActivation } from '../utils/activation';

export default function ActivationScreen() {
  const { deviceId, setIsActivated } = useApp();
  const [activationKey, setActivationKey] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // Helper function to easily let students copy their Device ID to WhatsApp/SMS
  const copyToClipboard = () => {
    Clipboard.setString(deviceId);
    Alert.alert("Copied!", "Device ID has been copied to your clipboard. Send this to your vendor.");
  };

  const handleActivationSubmit = async () => {
    if (!activationKey.trim()) {
      Alert.alert("Empty Key", "Please enter the activation key provided by your vendor.");
      return;
    }

    setIsVerifying(true);

    // TEMPORARY DEVELOPMENT CHECK: 
    // For now, typing any key longer than 10 characters will unlock the app.
    // We will replace this with our strict RSA signature check in the next phase!
    if (activationKey.trim().length >= 10) {
      const result = await saveSuccessfulActivation(activationKey);
      if (result.success) {
        Alert.alert("Success!", "Scholar Practice has been permanently unlocked.");
        setIsActivated(true); // Triggers the screen transition automatically
      } else {
        Alert.alert("Storage Error", result.message);
      }
    } else {
      Alert.alert("Invalid Key", "The key you entered is incorrect or too short.");
    }

    setIsVerifying(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.appTitle}>Scholar Practice</Text>
        <Text style={styles.tagline}>Offline Exam Preparation Platform</Text>
        
        <View style={styles.divider} />
        
        <Text style={styles.instructionHeading}>App Activation Required</Text>
        <Text style={styles.instructionText}>
          To unlock your 40,000+ past questions and step-by-step solutions permanently offline, please send the Device ID below to your software vendor.
        </Text>

        {/* Device ID Display Box */}
        <Text style={styles.label}>Your Unique Device ID:</Text>
        <TouchableOpacity style={styles.idBox} onPress={copyToClipboard} activeOpacity={0.7}>
          <Text style={styles.deviceIdText} numberOfLines={1}>{deviceId}</Text>
          <Text style={styles.copyHint}>Tap to copy ID</Text>
        </TouchableOpacity>

        {/* Key Entry Input Area */}
        <Text style={styles.label}>Enter Activation Key:</Text>
        <TextInput
          style={styles.input}
          placeholder="Paste your activation key here"
          placeholderTextColor="#94a3b8"
          value={activationKey}
          onChangeText={setActivationKey}
          autoCapitalize="characters"
          autoCorrect={false}
          multiline={true}
        />

        {/* Action Activation Button */}
        <TouchableOpacity 
          style={styles.button} 
          onPress={handleActivationSubmit}
          disabled={isVerifying}
        >
          {isVerifying ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Activate Device</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a', // Deep elegant dark background
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  appTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#1e3a8a',
    textAlign: 'center',
  },
  tagline: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 2,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 16,
  },
  instructionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  instructionText: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  idBox: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  deviceIdText: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#0f172a',
    fontWeight: '600',
  },
  copyHint: {
    fontSize: 11,
    color: '#3b82f6',
    fontWeight: '600',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#fff',
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#1d4ed8',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});