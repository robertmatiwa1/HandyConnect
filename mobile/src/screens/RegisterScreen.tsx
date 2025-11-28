import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { registerUser } from '../api/auth';
import { useAuthStore } from '../store/auth';

const RegisterScreen = ({ navigation }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const setCredentials = useAuthStore((state) => state.setCredentials);

  const handleNext = () => {
    if (!name || !email || !phone || !password) {
      Alert.alert("Missing details", "Fill in all fields to continue.");
      return;
    }

    navigation.navigate("AccountType", {
      name,
      phone,
      email,
      password,
    });
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.select({ ios: "padding" })}>
      <View style={styles.card}>
        <Text style={styles.title}>Create your account</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput value={name} onChangeText={setName} placeholder="John Doe" style={styles.input} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Phone</Text>
          <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="0712345678" style={styles.input} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput value={email} onChangeText={setEmail} inputMode="email" autoCapitalize="none" placeholder="you@example.com" style={styles.input} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" style={styles.input} />
        </View>

        <TouchableOpacity style={styles.button} onPress={handleNext}>
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate("Login")}>
          <Text style={styles.loginLink}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center", backgroundColor: "#f5f7fb" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 24 },
  title: { fontSize: 22, fontWeight: "600", marginBottom: 20, color: "#111827" },
  field: { marginBottom: 16 },
  label: { fontWeight: "600", marginBottom: 6, color: "#1f2937" },
  input: {
    borderWidth: 1, borderColor: "#cbd5f5", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 12, backgroundColor: "#fff",
  },
  button: {
    backgroundColor: "#1f6feb", paddingVertical: 14,
    borderRadius: 12, alignItems: "center", marginTop: 8,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  loginLink: { marginTop: 16, color: "#1f6feb", textAlign: "center" },
});

export default RegisterScreen;
