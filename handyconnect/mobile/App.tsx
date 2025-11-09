import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import RootNavigator from './src/navigation/RootNavigator';

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#1f6feb',
    background: '#f5f7fb'
  }
};

export default function App() {
  return (
    <NavigationContainer theme={theme}>
      <StatusBar barStyle="dark-content" />
      <RootNavigator />
    </NavigationContainer>
  );
}
