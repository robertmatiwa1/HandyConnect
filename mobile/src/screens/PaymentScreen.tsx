import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Alert } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { WebView, WebViewNavigation } from 'react-native-webview';

import { RootStackParamList } from '../navigation/RootNavigator';

type PaymentRouteProp = RouteProp<RootStackParamList, 'Payment'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const successMatchers = ['success', 'status=paid', 'status=success'];

const PaymentScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { params } = useRoute<PaymentRouteProp>();
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);

  const checkoutSource = useMemo(() => ({ uri: params.checkoutUrl }), [params.checkoutUrl]);

  const handleNavigationChange = useCallback(
    (event: WebViewNavigation) => {
      if (completed) {
        return;
      }

      const normalizedUrl = event.url.toLowerCase();
      const isSuccess = successMatchers.some((matcher) => normalizedUrl.includes(matcher));

      if (isSuccess) {
        setCompleted(true);
        Alert.alert('Payment confirmed', 'Your payment has been received.', [
          {
            text: 'OK',
            onPress: () =>
              navigation.reset({
                index: 0,
                routes: [
                  {
                    name: 'Dashboard',
                    params: { bookingId: params.jobId },
                  },
                ],
              }),
          },
        ]);
      }
    },
    [completed, navigation, params.jobId],
  );

  return (
    <View style={styles.container}>
      <WebView
        source={checkoutSource}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={handleNavigationChange}
        startInLoadingState
      />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#1f6feb" />
          <Text style={styles.loadingText}>Loading secure checkout…</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  loadingText: {
    marginTop: 12,
    color: '#1f2937',
  },
});

export default PaymentScreen;
