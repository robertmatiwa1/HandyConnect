import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import Rating from '../components/Rating';

interface ProviderProfile {
  id: string;
  name: string;
  skill: string;
  suburb: string;
  hourlyRate: number | null;
  bio: string | null;
  experienceYears: number | null;
  photoUrl: string | null;
  portfolio: string[];
  rating: number | null;
  ratingCount: number;
  verified: boolean;
}

interface ProviderReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

const ProviderSettings: React.FC = () => {
  const role = useAuthStore((state) => state.role);
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [reviews, setReviews] = useState<ProviderReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [skill, setSkill] = useState('');
  const [suburb, setSuburb] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [portfolio, setPortfolio] = useState('');

  const syncForm = useCallback((data: ProviderProfile) => {
    setSkill(data.skill ?? '');
    setSuburb(data.suburb ?? '');
    setHourlyRate(data.hourlyRate ? String(data.hourlyRate) : '');
    setExperienceYears(data.experienceYears ? String(data.experienceYears) : '');
    setBio(data.bio ?? '');
    setPhotoUrl(data.photoUrl ?? '');
    setPortfolio(data.portfolio?.join(', ') ?? '');
  }, []);

  const loadProfile = useCallback(async () => {
    if (role !== 'PROVIDER') {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await api.get<ProviderProfile>('/providers/me');
      setProfile(response.data);
      syncForm(response.data);

      const reviewsResponse = await api.get<ProviderReview[]>(`/reviews/provider/${response.data.id}`);
      setReviews(reviewsResponse.data);
    } catch (err) {
      setError('Unable to load your provider profile.');
    } finally {
      setLoading(false);
    }
  }, [role, syncForm]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSave = useCallback(async () => {
    if (!skill || !suburb) {
      Alert.alert('Missing information', 'Skill and suburb are required.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const payload = {
        skill,
        suburb,
        hourlyRate: hourlyRate ? Number(hourlyRate) : undefined,
        experienceYears: experienceYears ? Number(experienceYears) : undefined,
        bio: bio || undefined,
        photoUrl: photoUrl || undefined,
        portfolio: portfolio
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      };

      const response = await api.patch<ProviderProfile>('/providers/me', payload);
      setProfile(response.data);
      syncForm(response.data);
      Alert.alert('Profile updated', 'Your provider profile has been saved.');
    } catch (err) {
      console.error('Unable to update provider profile', err);
      Alert.alert('Unable to update profile', 'Please check your details and try again.');
    } finally {
      setSaving(false);
    }
  }, [skill, suburb, hourlyRate, experienceYears, bio, photoUrl, portfolio, syncForm]);

  if (role !== 'PROVIDER') {
    return (
      <View style={styles.centered}>
        <Text style={styles.notice}>Provider tools are only available for provider accounts.</Text>
      </View>
    );
  }

  if (loading && !profile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1f6feb" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.heading}>Manage provider profile</Text>
      <Text style={styles.subheading}>Update your public details and keep your listing current.</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Skill *</Text>
        <TextInput value={skill} onChangeText={setSkill} style={styles.input} placeholder="e.g. Plumber" />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Suburb *</Text>
        <TextInput value={suburb} onChangeText={setSuburb} style={styles.input} placeholder="e.g. Bellville" />
      </View>
      <View style={styles.fieldRow}>
        <View style={styles.fieldHalf}>
          <Text style={styles.label}>Hourly rate</Text>
          <TextInput
            value={hourlyRate}
            onChangeText={setHourlyRate}
            keyboardType="numeric"
            style={styles.input}
            placeholder="450"
          />
        </View>
        <View style={styles.fieldHalf}>
          <Text style={styles.label}>Experience (years)</Text>
          <TextInput
            value={experienceYears}
            onChangeText={setExperienceYears}
            keyboardType="numeric"
            style={styles.input}
            placeholder="5"
          />
        </View>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Bio</Text>
        <TextInput
          value={bio}
          onChangeText={setBio}
          style={[styles.input, styles.textArea]}
          multiline
          placeholder="Share your experience and specialties"
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Photo URL</Text>
        <TextInput
          value={photoUrl}
          onChangeText={setPhotoUrl}
          style={styles.input}
          placeholder="https://"
          autoCapitalize="none"
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Portfolio URLs</Text>
        <TextInput
          value={portfolio}
          onChangeText={setPortfolio}
          style={styles.input}
          placeholder="https://example.com/project-a, https://example.com/project-b"
          autoCapitalize="none"
        />
      </View>

      <Text style={styles.sectionTitle}>Recent reviews</Text>
      {profile?.rating ? (
        <View style={styles.ratingSummary}>
          <Rating value={profile.rating} count={profile.ratingCount} />
          <Text style={styles.ratingSummaryText}>{profile.rating.toFixed(1)} average from {profile.ratingCount} reviews</Text>
        </View>
      ) : (
        <Text style={styles.emptyReviews}>No reviews yet.</Text>
      )}
      {reviews.length > 0
        ? reviews.map((review) => (
            <View key={review.id} style={styles.reviewCard}>
              <Rating value={review.rating} />
              {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
              <Text style={styles.reviewDate}>{new Date(review.createdAt).toLocaleDateString()}</Text>
            </View>
          ))
        : null}

      <View style={styles.actions}>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [styles.saveButtonWrapper, pressed && styles.saveButtonPressed]}
        >
          <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save changes'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#f5f7fb',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f5f7fb',
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    color: '#0f172a',
  },
  subheading: {
    color: '#475569',
    marginBottom: 24,
  },
  field: {
    marginBottom: 16,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  fieldHalf: {
    flex: 1,
  },
  label: {
    fontWeight: '600',
    marginBottom: 6,
    color: '#1f2937',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#0f172a',
  },
  ratingSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  ratingSummaryText: {
    color: '#475569',
  },
  emptyReviews: {
    color: '#64748b',
    marginBottom: 12,
  },
  reviewCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  reviewComment: {
    marginTop: 8,
    color: '#111827',
  },
  reviewDate: {
    marginTop: 4,
    color: '#6b7280',
    fontSize: 12,
  },
  actions: {
    marginTop: 16,
    alignItems: 'flex-start',
  },
  saveButtonWrapper: {
    backgroundColor: '#1f6feb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  saveButtonPressed: {
    opacity: 0.85,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  error: {
    color: '#dc2626',
    marginBottom: 16,
  },
  notice: {
    color: '#475569',
    textAlign: 'center',
  },
});

export default ProviderSettings;
