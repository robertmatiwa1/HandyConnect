import React from 'react';
import { Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { formatCurrency } from '../utils/format';
import Rating from '../components/Rating';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ProviderProfile'>;
type ProfileRouteProp = RouteProp<RootStackParamList, 'ProviderProfile'>;

const ProviderProfile: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { params } = useRoute<ProfileRouteProp>();
  const { provider } = params;

  const handleBook = () => {
    navigation.navigate('Booking', { provider });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.name}>{provider.name}</Text>
      <Text style={styles.meta}>{provider.skill} • {provider.suburb}</Text>
      {typeof provider.rating === 'number' && (
        <Rating value={provider.rating} count={provider.ratingCount} />
      )}
      {provider.hourlyRate ? (
        <Text style={styles.rate}>Hourly rate: {formatCurrency(provider.hourlyRate)}</Text>
      ) : null}
      {provider.bio ? <Text style={styles.bio}>{provider.bio}</Text> : null}
      <Pressable onPress={handleBook} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
        <Text style={styles.buttonText}>Book</Text>
      </Pressable>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#f5f7fb'
  },
  name: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8
  },
  meta: {
    color: '#4b5563',
    marginBottom: 12
  },
  rate: {
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16
  },
  bio: {
    color: '#374151',
    lineHeight: 20,
    marginBottom: 24
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
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16
  }
});

export default ProviderProfile;
