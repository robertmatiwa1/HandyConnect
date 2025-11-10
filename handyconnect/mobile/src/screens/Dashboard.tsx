import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { api } from '../api/client';
import RateProviderModal from '../components/RateProviderModal';
import { useProvidersStore } from '../store/providers';

type JobStatus = 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED';

interface Job {
  id: string;
  providerId: string;
  title: string;
  providerName: string;
  status: JobStatus;
  scheduledAt: string;
  suburb: string;
  priceCents: number;
  notes: string | null;
  hasReview: boolean;
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Dashboard'>;
type DashboardRouteProp = RouteProp<RootStackParamList, 'Dashboard'>;

const Dashboard: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<DashboardRouteProp>();
  const bookingId = route.params?.bookingId;
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);
  const [dismissedJobIds, setDismissedJobIds] = useState<string[]>([]);
  const updateProvider = useProvidersStore((state) => state.updateProvider);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ jobs: Job[] }>('/jobs');
      setJobs(response.data.jobs);
    } catch (err) {
      setError('Unable to load your bookings right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await api.get<{ jobs: Job[] }>('/jobs');
      setJobs(response.data.jobs);
    } catch (err) {
      setError('Unable to refresh your bookings.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchJobs();
    }, [fetchJobs]),
  );

  useEffect(() => {
    if (!jobs.length) {
      setSelectedJob(null);
      return;
    }

    const dismissedSet = new Set(dismissedJobIds);
    const pendingReview = jobs.find(
      (job) => job.status === 'COMPLETED' && !job.hasReview && !dismissedSet.has(job.id),
    );

    if (!pendingReview) {
      setSelectedJob(null);
      return;
    }

    if (!selectedJob || selectedJob.id !== pendingReview.id) {
      setSelectedJob(pendingReview);
    }
  }, [jobs, dismissedJobIds, selectedJob]);

  const handleDismissReview = useCallback(() => {
    if (selectedJob) {
      setDismissedJobIds((prev) => (prev.includes(selectedJob.id) ? prev : [...prev, selectedJob.id]));
    }
    setSelectedJob(null);
  }, [selectedJob]);

  const handleSubmitReview = useCallback(
    async ({ rating, comment }: { rating: number; comment: string }) => {
      if (!selectedJob) {
        return;
      }

      try {
        setSubmittingReview(true);
        setError(null);
        const response = await api.post<{
          providerRating: { providerId: string; rating: number | null; ratingCount: number };
        }>('/reviews', {
          jobId: selectedJob.id,
          rating,
          comment,
        });

        const providerRating = response.data.providerRating;
        setJobs((prev) =>
          prev.map((job) =>
            job.id === selectedJob.id
              ? {
                  ...job,
                  hasReview: true,
                }
              : job,
          ),
        );
        updateProvider({
          id: providerRating.providerId,
          rating: providerRating.rating ?? null,
          ratingCount: providerRating.ratingCount,
        });
        setDismissedJobIds((prev) => (prev.includes(selectedJob.id) ? prev : [...prev, selectedJob.id]));
        setSelectedJob(null);
      } catch (err) {
        setError('Unable to submit review right now.');
      } finally {
        setSubmittingReview(false);
      }
    },
    [selectedJob, updateProvider],
  );

  const activeJobs = useMemo(() => {
    const activeStatuses: JobStatus[] = ['PENDING', 'ACCEPTED', 'IN_PROGRESS'];
    return jobs.filter((job) => activeStatuses.includes(job.status));
  }, [jobs]);

  const pastJobs = useMemo(() => {
    const completedStatuses: JobStatus[] = ['COMPLETED'];
    return jobs.filter((job) => completedStatuses.includes(job.status));
  }, [jobs]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Your bookings</Text>
      {bookingId && <Text style={styles.bookingNotice}>Booking confirmed! Reference: {bookingId}</Text>}
      {error && <Text style={styles.errorText}>{error}</Text>}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1f6feb" />
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshJobs} tintColor="#1f6feb" />}
          contentContainerStyle={styles.scrollContent}
        >
          <Section title="Active jobs" emptyMessage="No active jobs yet." jobs={activeJobs} />
          <Section title="Past jobs" emptyMessage="No completed jobs." jobs={pastJobs} />
        </ScrollView>
      )}
      <Pressable onPress={() => navigation.navigate('Home')} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
        <Text style={styles.buttonText}>Book another provider</Text>
      </Pressable>
      <RateProviderModal
        visible={Boolean(selectedJob)}
        providerName={selectedJob?.providerName ?? ''}
        onClose={handleDismissReview}
        onSubmit={handleSubmitReview}
        submitting={submittingReview}
      />
    </View>
  );
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'To be scheduled';
  }

  const day = date.toDateString();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${day} at ${hours}:${minutes}`;
};

const formatPrice = (priceCents: number) => `$${(priceCents / 100).toFixed(2)}`;

const STATUS_STYLES: Record<JobStatus, { label: string; background: string; color: string }> = {
  PENDING: { label: 'Pending', background: '#fef3c7', color: '#b45309' },
  ACCEPTED: { label: 'Accepted', background: '#d1fae5', color: '#047857' },
  IN_PROGRESS: { label: 'In progress', background: '#e0f2fe', color: '#0369a1' },
  COMPLETED: { label: 'Completed', background: '#e0e7ff', color: '#3730a3' },
};

const StatusBadge: React.FC<{ status: JobStatus }> = ({ status }) => {
  const style = STATUS_STYLES[status];
  return (
    <View style={[styles.statusBadge, { backgroundColor: style.background }]}>
      <Text style={[styles.statusBadgeText, { color: style.color }]}>{style.label}</Text>
    </View>
  );
};

const Section: React.FC<{ title: string; jobs: Job[]; emptyMessage: string }> = ({ title, jobs, emptyMessage }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {jobs.length === 0 ? (
      <Text style={styles.emptyMessage}>{emptyMessage}</Text>
    ) : (
      jobs.map((job) => (
        <View key={job.id} style={styles.jobCard}>
          <View style={styles.jobHeader}>
            <Text style={styles.jobTitle}>{job.title}</Text>
            <StatusBadge status={job.status} />
          </View>
          <Text style={styles.jobProvider}>with {job.providerName}</Text>
          <Text style={styles.jobDetail}>{formatDateTime(job.scheduledAt)}</Text>
          <Text style={styles.jobDetail}>{job.suburb}</Text>
          <Text style={styles.jobPrice}>{formatPrice(job.priceCents)}</Text>
          {job.notes ? <Text style={styles.jobNotes}>Notes: {job.notes}</Text> : null}
        </View>
      ))
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#f5f7fb',
  },
  heading: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
    color: '#0f172a'
  },
  bookingNotice: {
    color: '#1f2937',
    marginBottom: 16,
    fontSize: 16
  },
  errorText: {
    color: '#dc2626',
    marginBottom: 16,
    fontSize: 14
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  scrollContent: {
    paddingBottom: 24
  },
  section: {
    marginBottom: 24
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#0f172a'
  },
  emptyMessage: {
    color: '#6b7280',
    fontSize: 15
  },
  jobCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  jobTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8
  },
  jobProvider: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 4
  },
  jobDetail: {
    fontSize: 14,
    color: '#6b7280'
  },
  jobPrice: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 8
  },
  jobNotes: {
    marginTop: 8,
    fontSize: 13,
    color: '#374151'
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600'
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

export default Dashboard;
