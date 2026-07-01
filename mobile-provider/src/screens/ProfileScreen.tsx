/**
 * Provider Profile Screen
 *
 * Shows provider profile details and settings:
 * - Service information
 * - Earnings overview
 * - Account settings
 * - Profile editing
 * - Logout button
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { auth } from '@/firebase';
import { useProviderStore } from '@/store/providerStore';
import { useEarningsStats } from '@/hooks/useEarnings';
import { providerAPI } from '@/services/providerAPI';

const SERVICE_OPTIONS = [
  'AC Technician',
  'Plumber',
  'Electrician',
  'Painter',
  'Carpenter',
  'Home Cleaner',
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

export default function ProfileScreen() {
  const router = useRouter();
  const profile = useProviderStore((s) => s.profile);
  const providerId = useProviderStore((s) => s.providerId);
  const assignedJobs = useProviderStore((s) => s.assignedJobs);
  const logout = useProviderStore((s) => s.logout);
  
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Edit form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [experience, setExperience] = useState('1');
  const [selectedCity, setSelectedCity] = useState('');
  const [address, setAddress] = useState('');
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [error, setError] = useState('');

  const completedCount = assignedJobs.filter((j) => j.status === 'completed').length;
  const { stats } = useEarningsStats(providerId, completedCount, assignedJobs.length);

  const startEditing = () => {
    if (!profile) return;
    setName(profile.name);
    setPhone(profile.phone);
    setSelectedService(profile.service);
    setHourlyRate(profile.hourly_rate.toString());
    setExperience(profile.experience_yrs.toString());
    setSelectedCity(profile.city || '');
    setAddress(profile.address || '');
    setError('');
    setIsEditing(true);
  };

  const handleUpdateProfile = async () => {
    setError('');
    if (!name.trim() || !phone.trim() || !selectedService || !hourlyRate.trim() || !selectedCity.trim() || !address.trim()) {
      setError('All fields are required');
      return;
    }

    if (isNaN(parseInt(hourlyRate)) || parseInt(hourlyRate) <= 0) {
      setError('Hourly rate must be a positive number');
      return;
    }

    setLoading(true);
    try {
      const updatedProfile = await providerAPI.updateProfile({
        name,
        phone,
        service: selectedService,
        hourly_rate: parseInt(hourlyRate),
        experience_yrs: parseInt(experience),
        city: selectedCity,
        address: address.trim(),
        latitude: profile?.current_coordinates?.latitude || 33.6844,
        longitude: profile?.current_coordinates?.longitude || 73.0479,
      });

      // Update in store
      useProviderStore.setState({ profile: updatedProfile });
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
      Alert.alert('Error', err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            if (auth) {
              await signOut(auth);
            }
            logout();
            router.replace('/auth/login');
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to sign out');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  if (isEditing) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Edit Profile</Text>
          <Text style={styles.subtitle}>Update your professional details</Text>
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
              placeholder="e.g. +923001234567"
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
              style={styles.serviceSelector}
              onPress={() => setShowServicePicker(!showServicePicker)}
              disabled={loading}
            >
              <Text style={[styles.selectorText, !selectedService && styles.placeholderText]}>
                {selectedService || 'Select your trade / service'}
              </Text>
              <Text style={styles.selectorArrow}>{showServicePicker ? '▲' : '▼'}</Text>
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
              style={styles.serviceSelector}
              onPress={() => setShowCityPicker(!showCityPicker)}
              disabled={loading}
            >
              <Text style={[styles.selectorText, !selectedCity && styles.placeholderText]}>
                {selectedCity || 'Select your city'}
              </Text>
              <Text style={styles.selectorArrow}>{showCityPicker ? '▲' : '▼'}</Text>
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

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Hourly Rate (PKR)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 1500"
              placeholderTextColor="#888"
              value={hourlyRate}
              onChangeText={setHourlyRate}
              editable={!loading}
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Years of Experience</Text>
            <View style={styles.experienceContainer}>
              {['1', '2', '3', '5', '8', '10+'].map((exp) => (
                <TouchableOpacity
                  key={exp}
                  style={[
                    styles.expButton,
                    experience === exp && styles.expButtonSelected,
                  ]}
                  onPress={() => setExperience(exp)}
                  disabled={loading}
                >
                  <Text
                    style={[
                      styles.expButtonText,
                      experience === exp && styles.expButtonTextSelected,
                    ]}
                  >
                    {exp}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.editActions}>
            <TouchableOpacity
              style={[styles.saveButton, loading && styles.buttonDisabled]}
              onPress={handleUpdateProfile}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setIsEditing(false)}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Header */}
      <View style={styles.profileCard}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {profile?.name?.charAt(0).toUpperCase() || '?'}
          </Text>
        </View>

        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{profile?.name}</Text>
          <Text style={styles.profileService}>{profile?.service}</Text>
          <View style={styles.ratingContainer}>
            <Text style={styles.ratingText}>⭐ {profile?.rating.toFixed(1)}</Text>
            <View style={[styles.verificationBadge, profile?.is_verified && styles.verified]}>
              <Text style={styles.verificationText}>
                {profile?.is_verified ? '✓ Verified' : 'Not verified'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Contact Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact Information</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email:</Text>
            <Text style={styles.infoValue}>{auth?.currentUser?.email || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone:</Text>
            <Text style={styles.infoValue}>{profile?.phone}</Text>
          </View>
        </View>
      </View>

      {/* Service & Location Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Service & Location Details</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Service Type:</Text>
            <Text style={styles.infoValue}>{profile?.service}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Hourly Rate:</Text>
            <Text style={styles.infoValue}>PKR {profile?.hourly_rate}/hr</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Experience:</Text>
            <Text style={styles.infoValue}>{profile?.experience_yrs} years</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>City:</Text>
            <Text style={styles.infoValue}>{profile?.city || 'Not set'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Address:</Text>
            <Text style={styles.infoValue}>{profile?.address || 'Not set'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status:</Text>
            <Text style={[styles.infoValue, profile?.is_available && styles.statusOnline]}>
              {profile?.is_available ? '🟢 Online' : '🔴 Offline'}
            </Text>
          </View>
        </View>
      </View>

      {/* Earnings Overview */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Earnings This Month</Text>
          <TouchableOpacity onPress={() => router.push('/earnings')}>
            <Text style={styles.seeAllLink}>See All →</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity 
          style={styles.earningsCard}
          onPress={() => router.push('/earnings')}
        >
          <View style={styles.earningsRow}>
            <View>
              <Text style={styles.earningsLabel}>Total Earned</Text>
              <Text style={styles.earningsAmount}>PKR {stats.month_earnings.toLocaleString()}</Text>
            </View>
            <View style={styles.earningsStats}>
              <View style={styles.earningsStat}>
                <Text style={styles.earningsStatValue}>{stats.jobs_completed_month}</Text>
                <Text style={styles.earningsStatLabel}>Jobs</Text>
              </View>
              <View style={styles.earningsStat}>
                <Text style={styles.earningsStatValue}>{stats.average_job_value}</Text>
                <Text style={styles.earningsStatLabel}>Avg Value</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {/* Account Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        
        <TouchableOpacity 
          style={styles.settingButton}
          onPress={() => router.push('/job-history')}
          disabled={loading}
        >
          <Text style={styles.settingButtonText}>Job History</Text>
          <Text style={styles.settingButtonArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.settingButton} 
          onPress={startEditing}
          disabled={loading}
        >
          <Text style={styles.settingButtonText}>Edit Profile</Text>
          <Text style={styles.settingButtonArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.settingButton} 
          disabled={loading}
          onPress={() => {
            Linking.openURL('mailto:support@kaameasy.ai').catch(() =>
              Alert.alert('Support', 'Visit kaameasy.ai for help and support.')
            );
          }}
        >
          <Text style={styles.settingButtonText}>Support & Help</Text>
          <Text style={styles.settingButtonArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingButton, styles.logoutButton]}
          onPress={handleLogout}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ff4444" />
          ) : (
            <>
              <Text style={styles.logoutButtonText}>Sign Out</Text>
              <Text style={styles.settingButtonArrow}>→</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Version Info */}
      <View style={styles.footerContainer}>
        <Text style={styles.footerText}>KaamEasy Provider App v1.0.0</Text>
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
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  header: {
    marginBottom: 24,
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
  serviceSelector: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#404040',
  },
  selectorText: {
    color: '#fff',
    fontSize: 16,
  },
  placeholderText: {
    color: '#888',
  },
  selectorArrow: {
    color: '#00bfff',
    fontSize: 12,
  },
  servicePicker: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#404040',
    overflow: 'hidden',
  },
  serviceOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  serviceOptionSelected: {
    backgroundColor: '#00bfff22',
  },
  serviceOptionText: {
    color: '#ccc',
    fontSize: 16,
  },
  serviceOptionTextSelected: {
    color: '#00bfff',
    fontWeight: '600',
  },
  experienceContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  expButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#404040',
    minWidth: 60,
    alignItems: 'center',
  },
  expButtonSelected: {
    backgroundColor: '#00bfff',
    borderColor: '#00bfff',
  },
  expButtonText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
  },
  expButtonTextSelected: {
    color: '#fff',
  },
  error: {
    color: '#ff4444',
    fontSize: 14,
    marginBottom: 16,
  },
  editActions: {
    marginTop: 12,
    gap: 12,
  },
  saveButton: {
    backgroundColor: '#00bfff',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#404040',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  profileCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#00bfff',
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#00bfff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  profileService: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 8,
  },
  ratingContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00ff88',
  },
  verificationBadge: {
    backgroundColor: '#ff4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  verified: {
    backgroundColor: '#00ff88',
  },
  verificationText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  seeAllLink: {
    color: '#00bfff',
    fontSize: 12,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  infoLabel: {
    fontSize: 14,
    color: '#aaa',
  },
  infoValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  statusOnline: {
    color: '#00ff88',
  },
  earningsCard: {
    backgroundColor: '#003366',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#00bfff',
  },
  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  earningsLabel: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 6,
  },
  earningsAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#00ff88',
  },
  earningsStats: {
    flexDirection: 'row',
    gap: 12,
  },
  earningsStat: {
    alignItems: 'center',
  },
  earningsStatValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#00bfff',
  },
  earningsStatLabel: {
    fontSize: 10,
    color: '#aaa',
    marginTop: 2,
  },
  settingButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  settingButtonArrow: {
    fontSize: 18,
    color: '#00bfff',
  },
  logoutButton: {
    backgroundColor: '#4a2a2a',
    borderLeftWidth: 4,
    borderLeftColor: '#ff4444',
  },
  logoutButtonText: {
    fontSize: 16,
    color: '#ff4444',
    fontWeight: '500',
  },
  footerContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 12,
    color: '#666',
  },
});
