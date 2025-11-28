import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import api from '../api/client';

type Props = NativeStackScreenProps<RootStackParamList, 'ProviderOnboarding'>;

const ProviderOnboardingScreen: React.FC<Props> = ({ navigation }) => {
  const [suburb, setSuburb] = useState('');
  const [skillCategory, setSkillCategory] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [certificationsText, setCertificationsText] = useState('');
  const [portfolioText, setPortfolioText] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!suburb || !skillCategory || !hourlyRate) {
      Alert.alert('Missing details', 'Suburb, primary skill and rate are required.');
      return;
    }

    const rateNumber = Number(hourlyRate);
    if (Number.isNaN(rateNumber) || rateNumber <= 0) {
      Alert.alert('Invalid rate', 'Please enter a valid hourly rate.');
      return;
    }

    const certifications = certificationsText
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    const portfolioUrls = portfolioText
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);

    try {
      setSaving(true);
      await api.post('/providers/profile', {
        suburb,
        skillCategory,
        hourlyRate: rateNumber,
        certifications,
        portfolioUrls,
      });

      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (error) {
      console.error('Provider onboarding failed', error);
      Alert.alert('Could not save provider profile', 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Set up your provider profile</Text>
      <Text style={styles.subtitle}>
        Customers will see this information when deciding who to book.
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>Suburb</Text>
        <TextInput
          value={suburb}
          onChangeText={setSuburb}
          placeholder="Thornton, Khayelitsha, Stellenbosch…"
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Primary skill</Text>
        <TextInput
          value={skillCategory}
          onChangeText={setSkillCategory}
          placeholder="Plumber, electrician, handyman…"
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Hourly rate (R)</Text>
        <TextInput
          value={hourlyRate}
          onChangeText={setHourlyRate}
          placeholder="300"
          inputMode="numeric"
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Certifications (optional)</Text>
        <TextInput
          value={certificationsText}
          onChangeText={setCertificationsText}
          placeholder="PIRB registered, Wireman’s license… (comma separated)"
          multiline
          style={[styles.input, styles.multiline]}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Portfolio links (optional)</Text>
        <TextInput
          value={portfolioText}
          onChangeText={setPortfolioText}
          placeholder="https://instagram.com/..., https://drive.google.com/..."
          multiline
          style={[styles.input, styles.multiline]}
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
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingBottom: 40,
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
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
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

export default ProviderOnboardingScreen;
