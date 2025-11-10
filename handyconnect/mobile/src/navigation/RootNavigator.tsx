import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import ProviderProfile from '../screens/ProviderProfile';
import BookingScreen from '../screens/BookingScreen';
import Dashboard from '../screens/Dashboard';
import PaymentScreen from '../screens/PaymentScreen';
import { Provider } from '../components/ProviderCard';

export type RootStackParamList = {
  Home: undefined;
  Search: { skill: string; suburb: string } | undefined;
  ProviderProfile: { provider: Provider };
  Booking: { provider: Provider };
  Dashboard: { bookingId: string } | undefined;
  Payment: { jobId: string; checkoutUrl: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const RootNavigator = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'HandyConnect' }} />
      <Stack.Screen name="Search" component={SearchScreen} options={{ title: 'Find Providers' }} />
      <Stack.Screen name="ProviderProfile" component={ProviderProfile} options={{ title: 'Provider' }} />
      <Stack.Screen name="Booking" component={BookingScreen} options={{ title: 'Book Provider' }} />
      <Stack.Screen name="Dashboard" component={Dashboard} options={{ title: 'Dashboard' }} />
      <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: 'Secure payment' }} />
    </Stack.Navigator>
  );
};

export default RootNavigator;
