import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Alert } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { api } from '../api/client';

interface BookingResponse {
  job: {
    id: string;
    status: string;
    priceCents?: number;
  };
}

interface CheckoutResponse {
  checkoutUrl: string;
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Booking'>;
type BookingRouteProp = RouteProp<RootStackParamList, 'Booking'>;

const BookingScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { params } = useRoute<BookingRouteProp>();
  const { provider } = params;
  const [date, setDate] = useState<string>('2024-05-20');
  const [time, setTime] = useState<string>('10:00');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleConfirm = async () => {
    const scheduledAt = new Date(`${date}T${time}:00`).toISOString();

    try {
      setSubmitting(true);
      const response = await api.post<BookingResponse>('/jobs', {
        providerId: provider.id,
        scheduledAt,
        notes
      });
      const jobId = response.data.job.id;
      const hourlyRate = typeof provider.hourlyRate === 'number' ? provider.hourlyRate : 750;
      const amountCents = response.data.job.priceCents ?? Math.round(hourlyRate * 100);

      const checkout = await api.post<CheckoutResponse>('/payments/checkout', {
        jobId,
        amountCents
      });

      navigation.navigate('Payment', {
        jobId,
        checkoutUrl: checkout.data.checkoutUrl
      });
    } catch (error) {
      console.error('Booking failed', error);
      Alert.alert('Booking failed', 'Please try again later.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Book {provider.name}</Text>
      <TextInput
        style={styles.input}
        placeholder="Date (YYYY-MM-DD)"
        value={date}
        onChangeText={setDate}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Time (HH:mm)"
        value={time}
        onChangeText={setTime}
        autoCapitalize="none"
      />
      <TextInput
        style={[styles.input, styles.notes]}
        placeholder="Notes"
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={4}
      />
      <Pressable
        disabled={submitting}
        onPress={handleConfirm}
        style={({ pressed }) => [
          styles.button,
          (pressed || submitting) && styles.buttonPressed,
          submitting && styles.buttonDisabled
        ]}
      >
        <Text style={styles.buttonText}>{submitting ? 'Booking...' : 'Confirm booking'}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#f5f7fb'
  },
  heading: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 16,
    color: '#0f172a'
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  notes: {
    height: 120,
    textAlignVertical: 'top'
  },
  button: {
    backgroundColor: '#1f6feb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center'
  },
  buttonPressed: {
    opacity: 0.9
  },
  buttonDisabled: {
    backgroundColor: '#93c5fd'
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16
  }
});

export default BookingScreen;
