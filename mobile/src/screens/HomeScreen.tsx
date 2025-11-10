import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useAuthStore } from '../store/auth';

const DEFAULT_SKILL = 'plumber';
const DEFAULT_SUBURB = 'Bellville';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [skill, setSkill] = useState(DEFAULT_SKILL);
  const [suburb, setSuburb] = useState(DEFAULT_SUBURB);
  const role = useAuthStore((state) => state.role);

  const handleSearch = () => {
    navigation.navigate('Search', { skill, suburb });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Find trusted tradespeople near you</Text>
      <TextInput
        placeholder="Skill (e.g. plumber)"
        value={skill}
        onChangeText={setSkill}
        style={styles.input}
        autoCapitalize="none"
      />
      <TextInput
        placeholder="Suburb"
        value={suburb}
        onChangeText={setSuburb}
        style={styles.input}
      />
      <Pressable onPress={handleSearch} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
        <Text style={styles.buttonText}>Search providers</Text>
      </Pressable>
      {role === 'PROVIDER' ? (
        <Pressable
          onPress={() => navigation.navigate('ProviderSettings')}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
        >
          <Text style={styles.secondaryButtonText}>Manage provider profile</Text>
        </Pressable>
      ) : null}
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
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 24,
    color: '#0f172a'
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb'
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
  },
  secondaryButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f6feb',
    alignItems: 'center',
    backgroundColor: '#e0ecff'
  },
  secondaryButtonPressed: {
    opacity: 0.9
  },
  secondaryButtonText: {
    color: '#1f6feb',
    fontWeight: '600'
  }
});

export default HomeScreen;
