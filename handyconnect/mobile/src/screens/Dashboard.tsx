import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Dashboard'>;
type DashboardRouteProp = RouteProp<RootStackParamList, 'Dashboard'>;

const Dashboard: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<DashboardRouteProp>();
  const bookingId = route.params?.bookingId;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Your dashboard</Text>
      {bookingId ? (
        <Text style={styles.text}>Booking confirmed! Reference: {bookingId}</Text>
      ) : (
        <Text style={styles.text}>You have no recent bookings.</Text>
      )}
      <Pressable onPress={() => navigation.navigate('Home')} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
        <Text style={styles.buttonText}>Book another provider</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#f5f7fb',
    justifyContent: 'center'
  },
  heading: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 16,
    color: '#0f172a'
  },
  text: {
    color: '#374151',
    marginBottom: 24,
    fontSize: 16
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
