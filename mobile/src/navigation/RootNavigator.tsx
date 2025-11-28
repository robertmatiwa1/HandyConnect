import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import ProviderProfile from '../screens/ProviderProfile';
import BookingScreen from '../screens/BookingScreen';
import Dashboard from '../screens/Dashboard';
import PaymentScreen from '../screens/PaymentScreen';
import ProviderSettings from '../screens/ProviderSettings';
import { Provider } from '../components/ProviderCard';
import { useAuthStore } from '../store/auth';
import AccountTypeScreen from '../screens/AccountTypeScreen';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  AccountType: undefined;
  Home: undefined;
  Search: { skill: string; suburb: string } | undefined;
  ProviderProfile: { provider: Provider };
  Booking: { provider: Provider };
  Dashboard: { bookingId: string } | undefined;
  Payment: { jobId: string; checkoutUrl: string };
  ProviderSettings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const RootNavigator = () => {
  const token = useAuthStore((state) => state.token) || null;
  const initialized = useAuthStore((state) => state.initialized);
  const hydrate = useAuthStore((state) => state.hydrate);

  // Run hydration + ensure no invalid token remains
  useEffect(() => {
    if (!initialized) {
      hydrate();
    } else if (!token) {
      useAuthStore.getState().clear();
    }
  }, [initialized, token, hydrate]);

  // while loading storage
  if (!initialized) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#1f6feb" />
      </View>
    );
  }

  return (
    <Stack.Navigator>
      {!token ? (
        // UNAUTHENTICATED FLOW
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create Account' }} />
          <Stack.Screen name="AccountType" component={AccountTypeScreen} options={{ title: 'Account Type' }} />
        </>
      ) : (
        // AUTHENTICATED FLOW
        <>
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'HandyConnect' }} />
          <Stack.Screen name="Search" component={SearchScreen} options={{ title: 'Find Providers' }} />
          <Stack.Screen name="ProviderProfile" component={ProviderProfile} options={{ title: 'Provider' }} />
          <Stack.Screen name="Booking" component={BookingScreen} options={{ title: 'Book Provider' }} />
          <Stack.Screen name="Dashboard" component={Dashboard} options={{ title: 'Dashboard' }} />
          <Stack.Screen name="ProviderSettings" component={ProviderSettings} options={{ title: 'Provider Profile' }} />
          <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: 'Secure Payment' }} />
        </>
      )}
    </Stack.Navigator>
  );
};

export default RootNavigator;
