import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Rating from './Rating';
import { formatCurrency } from '../utils/format';

export interface Provider {
  id: string;
  name: string;
  skill: string;
  suburb: string;
  hourlyRate?: number | null;
  rating?: number | null;
  ratingCount?: number;
  bio?: string | null;
  experienceYears?: number | null;
  verified?: boolean;
  photoUrl?: string | null;
  portfolio?: string[];
}

interface ProviderCardProps {
  provider: Provider;
  onPress?: (provider: Provider) => void;
}

const ProviderCard: React.FC<ProviderCardProps> = ({ provider, onPress }) => {
  return (
    <Pressable onPress={() => onPress?.(provider)} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.header}>
        <Text style={styles.name}>{provider.name}</Text>
        {typeof provider.rating === 'number' && (
          <Rating value={provider.rating} count={provider.ratingCount} />
        )}
      </View>
      <Text style={styles.meta}>{provider.skill} • {provider.suburb}</Text>
      {provider.hourlyRate ? (
        <Text style={styles.rate}>From {formatCurrency(provider.hourlyRate)}/hr</Text>
      ) : null}
      {provider.bio ? <Text style={styles.bio}>{provider.bio}</Text> : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2
  },
  cardPressed: {
    opacity: 0.9
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827'
  },
  meta: {
    color: '#4b5563',
    marginBottom: 4
  },
  rate: {
    color: '#1f2937',
    fontWeight: '500'
  },
  bio: {
    marginTop: 8,
    color: '#6b7280',
    lineHeight: 18
  }
});

export default ProviderCard;
