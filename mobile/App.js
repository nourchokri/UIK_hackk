import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Font from 'expo-font';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync().catch(() => {});

import HomeScreen from './screens/HomeScreen';
import ActivitiesScreen from './screens/ActivitiesScreen';
import AdvisorScreen from './screens/AdvisorScreen';
import LearnScreen from './screens/LearnScreen';
import QuizScreen from './screens/QuizScreen';
import ScoreScreen from './screens/ScoreScreen';
import ScannerScreen from './screens/ScannerScreen';
import FacturesScreen from './screens/FacturesScreen';
import { C } from './constants/colors';

const Tab = createBottomTabNavigator();
const HomeStack = createStackNavigator();
const ActivitiesStack = createStackNavigator();
const LearnStack = createStackNavigator();

function HomeStackNav() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="Score" component={ScoreScreen} />
    </HomeStack.Navigator>
  );
}

function ActivitiesStackNav() {
  return (
    <ActivitiesStack.Navigator screenOptions={{ headerShown: false }}>
      <ActivitiesStack.Screen name="Activities" component={ActivitiesScreen} />
      <ActivitiesStack.Screen name="Scanner" component={ScannerScreen} />
      <ActivitiesStack.Screen name="Factures" component={FacturesScreen} />
    </ActivitiesStack.Navigator>
  );
}

function LearnStackNav() {
  return (
    <LearnStack.Navigator screenOptions={{ headerShown: false }}>
      <LearnStack.Screen name="Learn" component={LearnScreen} />
      <LearnStack.Screen name="Quiz" component={QuizScreen} />
    </LearnStack.Navigator>
  );
}

export default function App() {
  const [fontsLoaded, setFontsLoaded] = React.useState(false);

  React.useEffect(() => {
    async function loadFonts() {
      try {
        await Font.loadAsync({
          material: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf'),
          PlusJakartaSans_400Regular,
          PlusJakartaSans_600SemiBold,
          PlusJakartaSans_700Bold,
          PlusJakartaSans_800ExtraBold,
          Manrope_400Regular,
          Manrope_500Medium,
          Manrope_600SemiBold,
          Manrope_700Bold,
        });
      } catch (e) {
        console.warn('[Fonts] load error:', e);
      } finally {
        setFontsLoaded(true);
        SplashScreen.hideAsync().catch(() => {});
      }
    }
    loadFonts();
  }, []);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: C.background }} />;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle: styles.tabBar,
            tabBarShowLabel: true,
            tabBarActiveTintColor: C.onPrimary,
            tabBarInactiveTintColor: '#78716c',
            tabBarLabelStyle: styles.tabLabel,
            tabBarIconStyle: { marginBottom: -2 },
            tabBarItemStyle: styles.tabItem,
            tabBarActiveBackgroundColor: C.primaryContainer,
            tabBarIcon: ({ focused, color, size }) => {
              const icons = {
                Accueil: 'account-balance-wallet',
                Activités: 'swap-horiz',
                Conseiller: 'auto-awesome',
                Apprendre: 'menu-book',
              };
              return (
                <MaterialIcons name={icons[route.name]} size={22} color={color} />
              );
            },
          })}
        >
          <Tab.Screen name="Accueil" component={HomeStackNav} options={{ tabBarLabel: 'الرئيسية' }} />
          <Tab.Screen name="Activités" component={ActivitiesStackNav} options={{ tabBarLabel: 'الأنشطة' }} />
          <Tab.Screen name="Conseiller" component={AdvisorScreen} options={{ tabBarLabel: 'المستشار' }} />
          <Tab.Screen name="Apprendre" component={LearnStackNav} options={{ tabBarLabel: 'التعلّم' }} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderTopWidth: 0,
    elevation: 0,
    shadowColor: '#1b1c19',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.06,
    shadowRadius: 32,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    marginTop: 2,
  },
  tabItem: {
    borderRadius: 16,
    marginHorizontal: 4,
    marginVertical: 6,
    paddingHorizontal: 8,
  },
});
