import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { api } from '../api/client';
import Rating from '../components/Rating';
import { Provider } from '../components/ProviderCard';
import { RootStackParamList } from '../navigation/RootNavigator';
import { formatCurrency } from '../utils/format';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ProviderProfile'>;
type ProfileRouteProp = RouteProp<RootStackParamList, 'ProviderProfile'>;

interface ProviderProfileResponse extends Provider {
  ratingCount: number;
  verified: boolean;
  portfolio: string[];
}

const ProviderProfile: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { params } = useRoute<ProfileRouteProp>();
  const { provider } = params;
  const [profile, setProfile] = useState<ProviderProfileResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<ProviderProfileResponse>(`/providers/${provider.id}`);
      setProfile(response.data);
    } catch (err) {
      setError('Unable to load provider details. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [provider.id]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const displayProvider = useMemo<Provider>(() => ({
    ...provider,
    ...profile,
  }), [profile, provider]);

  const handleBook = () => {
    navigation.navigate('Booking', { provider: displayProvider });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {loading && !profile ? (
        <ActivityIndicator size="large" color="#1f6feb" style={styles.loader} />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {displayProvider.photoUrl ? (
        <Image source={{ uri: displayProvider.photoUrl }} style={styles.avatar} />
      ) : null}
      <Text style={styles.name}>{displayProvider.name}</Text>
      <Text style={styles.meta}>{displayProvider.skill} • {displayProvider.suburb}</Text>
      {typeof displayProvider.rating === 'number' ? (
        <Rating value={displayProvider.rating} count={displayProvider.ratingCount} />
      ) : null}
      {typeof displayProvider.experienceYears === 'number' ? (
        <Text style={styles.metaDetail}>
          {displayProvider.experienceYears} {displayProvider.experienceYears === 1 ? 'year' : 'years'} experience
        </Text>
      ) : null}
      {displayProvider.hourlyRate ? (
        <Text style={styles.rate}>Hourly rate: {formatCurrency(displayProvider.hourlyRate)}</Text>
      ) : null}
      {displayProvider.bio ? <Text style={styles.bio}>{displayProvider.bio}</Text> : null}
      {displayProvider.portfolio && displayProvider.portfolio.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Portfolio</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.portfolioList}
          >
            {displayProvider.portfolio.map((url) => (
              <Image key={url} source={{ uri: url }} style={styles.portfolioImage} />
            ))}
          </ScrollView>
        </View>
      ) : null}
      <Pressable
        onPress={handleBook}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
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
  loader: {
    marginBottom: 24,
  },
  error: {
    color: '#dc2626',
    marginBottom: 12,
  },
  avatar: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    marginBottom: 16,
  },
  name: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8
  },
  meta: {
    color: '#4b5563',
    marginBottom: 8
  },
  metaDetail: {
    color: '#4b5563',
    marginBottom: 12,
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#0f172a',
  },
  portfolioList: {
    gap: 12,
  },
  portfolioImage: {
    width: 160,
    height: 110,
    borderRadius: 12,
    marginRight: 12,
    backgroundColor: '#e5e7eb',
  },
  button: {
    backgroundColor: '#1f6feb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
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
