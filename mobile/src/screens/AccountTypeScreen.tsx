import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'AccountType'>;

const AccountTypeScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>How do you want to use HandyConnect?</Text>
      <Text style={styles.subtitle}>
        Choose your account type to continue.
      </Text>

      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('Register', { role: 'CUSTOMER' })}
      >
        <Text style={styles.cardTitle}>I need a tradesman</Text>
        <Text style={styles.cardText}>
          Book vetted providers to fix things at your home or business.
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('Register', { role: 'PROVIDER' })}
      >
        <Text style={styles.cardTitle}>I am a tradesman</Text>
        <Text style={styles.cardText}>
          Get jobs, manage your bookings and grow your business.
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#f5f7fb',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
    color: '#111827',
  },
  subtitle: {
    color: '#4b5563',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
    color: '#111827',
  },
  cardText: {
    color: '#6b7280',
  },
});

export default AccountTypeScreen;