/**
 * Provider Profile Setup Screen
 *
 * Third step of provider onboarding:
 * - Provider fills in professional details
 * - Service type selection
 * - Hourly rate
 * - Experience years
 * - Calls backend to register provider and get provider_id
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { auth } from '@/firebase';
import { providerAPI } from '@/services/providerAPI';
import { useProviderStore } from '@/store/providerStore';

const SERVICE_OPTIONS = [
  'AC Technician',
  'Plumber',
  'Electrician',
  'Carpenter',
  'Painter',
  'Cleaner',
  'Mechanic',
  'Handyman',
];

const CITIES = [
  'Nawabshah',
  'Karachi',
  'Lahore',
  'Islamabad',
  'Rawalpindi',
  'Peshawar',
  'Quetta',
  'Multan',
  'Faisalabad',
  'Sialkot',
  'Hyderabad',
];

const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'Nawabshah': { lat: 26.2483, lng: 68.4096 },
  'Karachi': { lat: 24.8607, lng: 67.0011 },
  'Lahore': { lat: 31.5204, lng: 74.3587 },
  'Islamabad': { lat: 33.6844, lng: 73.0479 },
  'Rawalpindi': { lat: 33.5651, lng: 73.0169 },
  'Peshawar': { lat: 34.0151, lng: 71.5249 },
  'Quetta': { lat: 30.1798, lng: 66.9750 },
  'Multan': { lat: 30.1575, lng: 71.5249 },
  'Faisalabad': { lat: 31.4504, lng: 73.1350 },
  'Sialkot': { lat: 32.4945, lng: 74.5229 },
  'Hyderabad': { lat: 25.3960, lng: 68.3578 },
};

export default function ProfileSetupScreen() {
  const router = useRouter();
  const setProfile = useProviderStore((s) => s.setProfile);
  const setProviderId = useProviderStore((s) => s.setProviderId);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [experience, setExperience] = useState('1');
  const [selectedCity, setSelectedCity] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);

  const validateForm = () => {
    if (!name.trim()) {
      setError('Name is required');
      return false;
    }
    if (!phone.trim() || phone.length < 10) {
      setError('Valid phone number is required');
      return false;
    }
    if (!selectedService) {
      setError('Please select a service');
      return false;
    }
    if (!hourlyRate || isNaN(parseInt(hourlyRate)) || parseInt(hourlyRate) <= 0) {
      setError('Hourly rate must be a positive number');
      return false;
    }
    if (!selectedCity) {
      setError('Please select a city');
      return false;
    }
    if (!address.trim()) {
      setError('Physical address is required');
      return false;
    }
    return true;
  };

  const handleCreateProfile = async () => {
    setError('');
    if (!validateForm()) return;

    setLoading(true);
    try {
      const user = auth?.currentUser;
      if (!user) throw new Error('User not authenticated');

      // Get FCM token (optional, can be added later)
      const fcmToken = '';

      // Call backend to register provider
      const response = await providerAPI.registerProvider({
        name,
        phone,
        service: selectedService,
        hourly_rate: parseInt(hourlyRate),
        experience_yrs: parseInt(experience),
        fcm_token: fcmToken,
        city: selectedCity,
        address: address.trim(),
        latitude: CITY_COORDINATES[selectedCity]?.lat || 33.6844,
        longitude: CITY_COORDINATES[selectedCity]?.lng || 73.0479,
      });

      // Store provider profile in Zustand
      setProfile(response.profile);
      setProviderId(response.provider_id);

      Alert.alert(
        'Success',
        `Welcome ${name}! Your provider profile is ready.`,
        [
          {
            text: 'Continue',
            onPress: () => router.push('/dashboard'),
          },
        ]
      );
    } catch (err: any) {
      const errMsg = err.message || 'Profile setup failed';
      setError(errMsg);
      Alert.alert('Error', errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Complete Your Profile</Text>
        <Text style={styles.subtitle}>Tell us about your services</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor="#888"
            value={name}
            onChangeText={setName}
            editable={!loading}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="+923001234567"
            placeholderTextColor="#888"
            value={phone}
            onChangeText={setPhone}
            editable={!loading}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Service Type</Text>
          <TouchableOpacity
            style={styles.serviceButton}
            onPress={() => setShowServicePicker(!showServicePicker)}
            disabled={loading}
          >
            <Text style={styles.serviceButtonText}>
              {selectedService || 'Select your service'}
            </Text>
          </TouchableOpacity>

          {showServicePicker && (
            <View style={styles.servicePicker}>
              {SERVICE_OPTIONS.map((service) => (
                <TouchableOpacity
                  key={service}
                  style={[
                    styles.serviceOption,
                    selectedService === service && styles.serviceOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedService(service);
                    setShowServicePicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.serviceOptionText,
                      selectedService === service && styles.serviceOptionTextSelected,
                    ]}
                  >
                    {service}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>City</Text>
          <TouchableOpacity
            style={styles.serviceButton}
            onPress={() => setShowCityPicker(!showCityPicker)}
            disabled={loading}
          >
            <Text style={styles.serviceButtonText}>
              {selectedCity || 'Select your city'}
            </Text>
          </TouchableOpacity>

          {showCityPicker && (
            <View style={styles.servicePicker}>
              {CITIES.map((city) => (
                <TouchableOpacity
                  key={city}
                  style={[
                    styles.serviceOption,
                    selectedCity === city && styles.serviceOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedCity(city);
                    setShowCityPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.serviceOptionText,
                      selectedCity === city && styles.serviceOptionTextSelected,
                    ]}
                  >
                    {city}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Physical Address</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Satellite Town, Street 3"
            placeholderTextColor="#888"
            value={address}
            onChangeText={setAddress}
            editable={!loading}
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, styles.halfWidth]}>
            <Text style={styles.label}>Hourly Rate (PKR)</Text>
            <TextInput
              style={styles.input}
              placeholder="1500"
              placeholderTextColor="#888"
              value={hourlyRate}
              onChangeText={setHourlyRate}
              editable={!loading}
              keyboardType="number-pad"
            />
          </View>

          <View style={[styles.inputGroup, styles.halfWidth]}>
            <Text style={styles.label}>Experience (years)</Text>
            <TextInput
              style={styles.input}
              placeholder="1"
              placeholderTextColor="#888"
              value={experience}
              onChangeText={setExperience}
              editable={!loading}
              keyboardType="number-pad"
            />
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.createButton, loading && styles.buttonDisabled]}
          onPress={handleCreateProfile}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createButtonText}>Create Profile</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#aaa',
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#404040',
  },
  row: {
    flexDirection: 'row',
    gap: 16,
  },
  halfWidth: {
    flex: 1,
  },
  serviceButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#404040',
  },
  serviceButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  servicePicker: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    marginTop: -16,
    marginHorizontal: 0,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#404040',
    marginBottom: 12,
    zIndex: 1000,
  },
  serviceOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  serviceOptionSelected: {
    backgroundColor: '#003366',
  },
  serviceOptionText: {
    color: '#aaa',
    fontSize: 16,
  },
  serviceOptionTextSelected: {
    color: '#00bfff',
    fontWeight: '600',
  },
  error: {
    color: '#ff4444',
    fontSize: 14,
    marginBottom: 16,
  },
  createButton: {
    backgroundColor: '#00bfff',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
