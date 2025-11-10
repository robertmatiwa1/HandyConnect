import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ProviderCard, { Provider } from '../components/ProviderCard';
import { RootStackParamList } from '../navigation/RootNavigator';
import { api } from '../api/client';
import { useProvidersStore } from '../store/providers';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Search'>;
type SearchRouteProp = RouteProp<RootStackParamList, 'Search'>;

const SearchScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<SearchRouteProp>();
  const skill = route.params?.skill ?? 'plumber';
  const suburb = route.params?.suburb ?? 'Bellville';
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const upsertProviders = useProvidersStore((state) => state.upsertMany);

  const fetchProviders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<Provider[]>('/providers', {
        params: { skill, suburb }
      });
      setProviders(response.data);
      upsertProviders(response.data);
    } catch (err) {
      setError('Unable to load providers. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [skill, suburb, upsertProviders]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const handleSelectProvider = (provider: Provider) => {
    navigation.navigate('ProviderProfile', { provider });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Results for {skill} in {suburb}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && providers.length === 0 ? (
        <ActivityIndicator size="large" color="#1f6feb" style={styles.loader} />
      ) : (
        <FlatList
          data={providers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ProviderCard provider={item} onPress={handleSelectProvider} />}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchProviders} />}
          contentContainerStyle={providers.length === 0 ? styles.emptyContainer : undefined}
          ListEmptyComponent={!loading ? <Text style={styles.emptyText}>No providers found.</Text> : null}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f7fb'
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#0f172a'
  },
  loader: {
    marginTop: 32
  },
  error: {
    color: '#dc2626',
    marginBottom: 12
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyText: {
    color: '#6b7280'
  }
});

export default SearchScreen;
