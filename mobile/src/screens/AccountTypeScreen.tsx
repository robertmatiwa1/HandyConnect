import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { registerUser } from '../api/auth';
import { useAuthStore } from '../store/auth';

const AccountTypeScreen = ({ route, navigation }) => {
  const { name, phone, email, password } = route.params;
  const setCredentials = useAuthStore((s) => s.setCredentials);

  async function completeRegistration(role) {
    try {
      const res = await registerUser({ name, phone, email, password, role });

      await setCredentials(res.accessToken, res.user.id, res.user.role);

      if (role === "PROVIDER") {
        navigation.reset({ index: 0, routes: [{ name: "ProviderSettings" }] });
      } else {
        navigation.reset({ index: 0, routes: [{ name: "Home" }] });
      }
    } catch (e) {
      console.log("Registration failed", e);
      Alert.alert("Error", "Unable to register. Please try again.");
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose Account Type</Text>

      <TouchableOpacity style={styles.box} onPress={() => completeRegistration("CUSTOMER")}>
        <Text style={styles.boxText}>I am a Customer</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.box} onPress={() => completeRegistration("PROVIDER")}>
        <Text style={styles.boxText}>I am a Service Provider</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center", backgroundColor: "#f5f7fb" },
  title: { fontSize: 24, fontWeight: "600", marginBottom: 30, textAlign: "center", color: "#111827" },
  box: {
    backgroundColor: "#1f6feb", padding: 20, borderRadius: 16,
    marginBottom: 20, alignItems: "center",
  },
  boxText: { color: "#fff", fontSize: 18, fontWeight: "600" },
});

export default AccountTypeScreen;
