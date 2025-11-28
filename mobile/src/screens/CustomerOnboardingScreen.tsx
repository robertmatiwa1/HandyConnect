import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import api from '../api/client';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerOnboarding'>;

const CustomerOnboardingScreen: React.FC<Props> = ({ navigation }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [suburb, setSuburb] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name || !phone || !suburb) {
      Alert.alert('Missing details', 'Please fill in all three fields.');
      return;
    }

    try {
      setSaving(true);
      await api.patch('/users/me', { name, phone, suburb });
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (error) {
      console.error('Customer onboarding failed', error);
      Alert.alert('Could not save profile', 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tell us a bit about you</Text>
      <Text style={styles.subtitle}>
        This helps providers know who they are working with.
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>Full name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="John Moyo"
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Phone number</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="071 234 5678"
          inputMode="tel"
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Suburb</Text>
        <TextInput
          value={suburb}
          onChangeText={setSuburb}
          placeholder="Thornton, Khayelitsha, Stellenbosch…"
          style={styles.input}
        />
      </View>

      <TouchableOpacity
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.buttonText}>
          {saving ? 'Saving…' : 'Finish setup'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#f5f7fb',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
    color: '#111827',
  },
  subtitle: {
    color: '#6b7280',
    marginBottom: 24,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontWeight: '600',
    marginBottom: 6,
    color: '#1f2937',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5f5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 14, android: 10 }),
    fontSize: 16,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#1f6feb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CustomerOnboardingScreen;
