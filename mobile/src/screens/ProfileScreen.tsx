/**
 * ProfileScreen — View & edit user profile, change location, and sign out.
 *
 * Features:
 * - Live profile loaded from Firestore
 * - Inline editable fields (name, phone, address, city, province)
 * - "Edit Mode" toggle with Save / Cancel
 * - GPS re-fetch to update location
 * - Sign out with confirmation toast
 * - Stats row (member since, bookings count)
 * - Avatar with initials + gradient ring
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNativeDriver } from '../utils/animation';
import { doc, getDoc, updateDoc, collection, query, where, getCountFromServer } from 'firebase/firestore';
import { signOut, updateEmail } from 'firebase/auth';
import * as Location from 'expo-location';
import { auth, db } from '../firebase';
import { useToast } from '../components/ui/Toast';
import { FormInput } from '../components/ui/FormInput';
import { PrimaryButton } from '../components/ui/PrimaryButton';

// ─── Profile field config ──────────────────────────────────────────────────────

interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone: string;
  province: string;
  city: string;
  address: string;
  coordinates?: { latitude: number; longitude: number };
  createdAt?: any;
  profileCompleted?: boolean;
}

// ─── Section card ──────────────────────────────────────────────────────────────

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={styles.sectionCard}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

// ─── Info row (read-only) ──────────────────────────────────────────────────────

const InfoRow: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoIcon}>{icon}</Text>
    <View style={styles.infoContent}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  </View>
);

// ─── GOOGLE_MAPS_API_KEY ───────────────────────────────────────────────────────

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { showToast, ToastContainer } = useToast();

  const [profile, setProfile]       = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading]   = useState(true);
  const [isEditing, setIsEditing]   = useState(false);
  const [isSaving, setIsSaving]     = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isFetchingGPS, setIsFetchingGPS] = useState(false);
  const [bookingCount, setBookingCount]   = useState<number | null>(null);

  // Edit form state (mirrors profile fields)
  const [editName,     setEditName]     = useState('');
  const [editPhone,    setEditPhone]    = useState('');
  const [editProvince, setEditProvince] = useState('');
  const [editCity,     setEditCity]     = useState('');
  const [editAddress,  setEditAddress]  = useState('');
  const [editCoords,   setEditCoords]   = useState<{ latitude: number; longitude: number } | null>(null);

  // Entrance animation
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 420, useNativeDriver }),
        Animated.timing(slideAnim, { toValue: 0, duration: 420, useNativeDriver }),
      ]).start();
    }
  }, [isLoading]);

  const loadProfile = useCallback(async () => {
    const uid = auth?.currentUser?.uid;
    if (!uid) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const docSnap = await getDoc(doc(db, 'users', uid));
      if (docSnap.exists()) {
        const data = { uid, ...(docSnap.data() as Omit<UserProfile, 'uid'>) };
        setProfile(data);
      }
      // Fetch booking count
      try {
        const q   = query(collection(db, 'bookings'), where('user_id', '==', uid));
        const agg = await getCountFromServer(q);
        setBookingCount(agg.data().count);
      } catch { /* non-critical */ }
    } catch (err: any) {
      showToast('Failed to load profile.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startEditing = () => {
    if (!profile) return;
    setEditName(profile.name || '');
    setEditPhone(profile.phone || '');
    setEditProvince(profile.province || '');
    setEditCity(profile.city || '');
    setEditAddress(profile.address || '');
    setEditCoords(profile.coordinates || null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  // ── GPS re-fetch ──
  const handleRefetchGPS = async () => {
    setIsFetchingGPS(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showToast('Location permission denied.', 'error');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = position.coords;
      setEditCoords({ latitude, longitude });

      const res  = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`);
      const data = await res.json();
      if (data.status === 'OK') {
        const comps = data.results[0]?.address_components ?? [];
        const find  = (...types: string[]) =>
          comps.find((c: any) => types.some((t: string) => c.types.includes(t)))?.long_name ?? '';
        setEditProvince(find('administrative_area_level_1'));
        setEditCity(find('locality', 'administrative_area_level_2'));
        setEditAddress(data.results[0]?.formatted_address ?? '');
        showToast('Location updated!', 'success');
      } else {
        showToast('Could not reverse-geocode. Fill address manually.', 'warning');
      }
    } catch (err: any) {
      showToast(err?.message ?? 'GPS fetch failed.', 'error');
    } finally {
      setIsFetchingGPS(false);
    }
  };

  // ── Save edits ──
  const handleSave = async () => {
    if (!profile) return;
    if (!editName.trim()) { showToast('Name cannot be empty.', 'warning'); return; }
    if (!editPhone.trim()) { showToast('Phone cannot be empty.', 'warning'); return; }

    setIsSaving(true);
    try {
      const updates: Partial<UserProfile> = {
        name:     editName.trim(),
        phone:    editPhone.trim(),
        province: editProvince.trim(),
        city:     editCity.trim(),
        address:  editAddress.trim(),
      };
      if (editCoords) updates.coordinates = editCoords;

      await updateDoc(doc(db, 'users', profile.uid), updates as Record<string, any>);
      setProfile((p) => p ? { ...p, ...updates } : p);
      setIsEditing(false);
      showToast('Profile updated successfully!', 'success');
    } catch (err: any) {
      showToast(err?.message ?? 'Update failed.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Sign out ──
  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setIsSigningOut(true);
            try {
              await signOut(auth);
              // App.tsx onAuthStateChanged will automatically redirect to Login
            } catch (err: any) {
              showToast('Sign out failed. Try again.', 'error');
              setIsSigningOut(false);
            }
          },
        },
      ],
    );
  };

  // ── Format join date ──
  function formatJoinDate(ts: any): string {
    if (!ts) return 'Unknown';
    try {
      const d = ts?.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return 'Unknown'; }
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#6366f1" size="large" />
        <Text style={styles.loadingText}>Loading profile…</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.emptyIcon}>😕</Text>
        <Text style={styles.loadingText}>Profile not found.</Text>
        <TouchableOpacity onPress={loadProfile} style={styles.retryBtn}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const initials = (profile.name || 'U').slice(0, 2).toUpperCase();

  return (
    <View style={styles.container}>
      <ToastContainer />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Avatar + Stats ── */}
        <Animated.View
          style={[styles.heroSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        >
          {/* Avatar */}
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarRing}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            </View>
            {!isEditing && (
              <TouchableOpacity style={styles.editBadge} onPress={startEditing}>
                <Text style={styles.editBadgeText}>✏️</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.heroName}>{profile.name}</Text>
          <Text style={styles.heroEmail}>{profile.email}</Text>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{bookingCount ?? '—'}</Text>
              <Text style={styles.statLabel}>Bookings</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{profile.city || '—'}</Text>
              <Text style={styles.statLabel}>City</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue} numberOfLines={1}>
                {formatJoinDate(profile.createdAt).split(' ')[2] ?? '—'}
              </Text>
              <Text style={styles.statLabel}>Member Since</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* ── View Mode ── */}
          {!isEditing ? (
            <>
              <SectionCard title="Personal Info">
                <InfoRow icon="👤" label="Full Name"    value={profile.name} />
                <View style={styles.infoSep} />
                <InfoRow icon="✉️" label="Email"        value={profile.email} />
                <View style={styles.infoSep} />
                <InfoRow icon="📱" label="Phone"        value={profile.phone} />
              </SectionCard>

              <SectionCard title="Location">
                <InfoRow icon="🗺️" label="Province"     value={profile.province} />
                <View style={styles.infoSep} />
                <InfoRow icon="🏙️" label="City"         value={profile.city} />
                <View style={styles.infoSep} />
                <InfoRow icon="🏠" label="Address"      value={profile.address} />
                {profile.coordinates && (
                  <>
                    <View style={styles.infoSep} />
                    <View style={styles.coordChip}>
                      <View style={styles.coordDot} />
                      <Text style={styles.coordText}>
                        {profile.coordinates.latitude.toFixed(5)}, {profile.coordinates.longitude.toFixed(5)}
                      </Text>
                    </View>
                  </>
                )}
              </SectionCard>

              <TouchableOpacity style={styles.editFullBtn} onPress={startEditing}>
                <Text style={styles.editFullBtnText}>✏️  Edit Profile</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* ── Edit Mode ── */
            <>
              <SectionCard title="Edit Personal Info">
                <FormInput
                  label="Full Name"
                  leftIcon="👤"
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Your full name"
                  editable={!isSaving}
                />
                <FormInput
                  label="Phone Number"
                  leftIcon="📱"
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="03001234567"
                  keyboardType="phone-pad"
                  editable={!isSaving}
                />
              </SectionCard>

              <SectionCard title="Edit Location">
                {/* GPS refetch */}
                <TouchableOpacity
                  style={[styles.gpsBtn, isFetchingGPS && { opacity: 0.6 }]}
                  onPress={handleRefetchGPS}
                  disabled={isFetchingGPS || isSaving}
                >
                  {isFetchingGPS ? (
                    <ActivityIndicator color="#34d399" size="small" />
                  ) : (
                    <Text style={styles.gpsIcon}>📍</Text>
                  )}
                  <Text style={styles.gpsBtnText}>
                    {isFetchingGPS ? 'Fetching GPS…' : 'Re-fetch Current Location'}
                  </Text>
                </TouchableOpacity>

                {editCoords && (
                  <View style={styles.coordChip}>
                    <View style={styles.coordDot} />
                    <Text style={styles.coordText}>
                      {editCoords.latitude.toFixed(5)}, {editCoords.longitude.toFixed(5)}
                    </Text>
                  </View>
                )}

                <FormInput
                  label="Province"
                  leftIcon="🗺️"
                  value={editProvince}
                  onChangeText={setEditProvince}
                  placeholder="e.g. Punjab"
                  editable={!isSaving}
                />
                <FormInput
                  label="City"
                  leftIcon="🏙️"
                  value={editCity}
                  onChangeText={setEditCity}
                  placeholder="e.g. Islamabad"
                  editable={!isSaving}
                />
                <FormInput
                  label="Street Address"
                  leftIcon="🏠"
                  value={editAddress}
                  onChangeText={setEditAddress}
                  placeholder="House, Street, Sector…"
                  multiline
                  editable={!isSaving}
                />
              </SectionCard>

              {/* Save / Cancel */}
              <View style={styles.editActions}>
                <PrimaryButton
                  label="Save Changes"
                  loadingLabel="Saving…"
                  onPress={handleSave}
                  isLoading={isSaving}
                  showArrow
                />
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={cancelEditing}
                  disabled={isSaving}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Danger Zone ── */}
          {!isEditing && (
            <View style={styles.dangerZone}>
              <TouchableOpacity
                style={[styles.signOutBtn, isSigningOut && { opacity: 0.6 }]}
                onPress={handleSignOut}
                disabled={isSigningOut}
              >
                {isSigningOut ? (
                  <ActivityIndicator color="#f87171" size="small" />
                ) : (
                  <Text style={styles.signOutIcon}>🚪</Text>
                )}
                <Text style={styles.signOutText}>
                  {isSigningOut ? 'Signing Out…' : 'Sign Out'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex:      { flex: 1 },
  container: { flex: 1, backgroundColor: '#0f172a' },
  scrollContent: { paddingBottom: 40 },

  loadingContainer: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#64748b', fontSize: 14 },
  emptyIcon:   { fontSize: 40 },
  retryBtn:    { backgroundColor: '#6366f1', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10, marginTop: 8 },
  retryBtnText:{ color: '#fff', fontWeight: '700', fontSize: 14 },

  heroSection: {
    alignItems: 'center',
    paddingTop: 32, paddingBottom: 24, paddingHorizontal: 24,
    borderBottomWidth: 1, borderBottomColor: 'rgba(51,65,85,0.5)',
    marginBottom: 20,
  },
  avatarWrapper: { position: 'relative', marginBottom: 16 },
  avatarRing: {
    width: 90, height: 90, borderRadius: 45,
    borderWidth: 2.5, borderColor: '#6366f1',
    padding: 3, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 0 16px rgba(99,102,241,0.4)', elevation: 8,
  },
  avatarCircle: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: '#1e293b',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#818cf8', fontSize: 30, fontWeight: '900' },
  editBadge: {
    position: 'absolute', bottom: 0, right: -4,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#1e293b', borderWidth: 2, borderColor: '#0f172a',
    alignItems: 'center', justifyContent: 'center',
  },
  editBadgeText: { fontSize: 13 },

  heroName:    { color: '#f1f5f9', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  heroEmail:   { color: '#64748b', fontSize: 13, marginBottom: 20 },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(30,41,59,0.7)',
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20,
    borderWidth: 1, borderColor: 'rgba(51,65,85,0.6)',
    width: '100%',
  },
  statItem:    { flex: 1, alignItems: 'center' },
  statValue:   { color: '#f1f5f9', fontSize: 16, fontWeight: '800', marginBottom: 3 },
  statLabel:   { color: '#475569', fontSize: 11, fontWeight: '600' },
  statDivider: { width: 1, height: 32, backgroundColor: 'rgba(51,65,85,0.8)' },

  sectionCard: {
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderRadius: 18, marginHorizontal: 16, marginBottom: 14,
    padding: 18,
    borderWidth: 1, borderColor: 'rgba(51,65,85,0.7)',
  },
  sectionTitle: {
    color: '#475569', fontSize: 10, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase',
    marginBottom: 14,
  },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  infoIcon: { fontSize: 16, width: 22, textAlign: 'center' },
  infoContent: { flex: 1 },
  infoLabel: { color: '#475569', fontSize: 11, fontWeight: '600', marginBottom: 2 },
  infoValue: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },
  infoSep:   { height: 1, backgroundColor: 'rgba(51,65,85,0.4)', marginVertical: 2 },

  coordChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
    marginTop: 8, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(51,65,85,0.6)',
  },
  coordDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981', flexShrink: 0 },
  coordText: { color: '#64748b', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', flex: 1 },

  editFullBtn: {
    marginHorizontal: 16, marginBottom: 8,
    borderRadius: 14, paddingVertical: 14,
    backgroundColor: 'rgba(99,102,241,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)',
  },
  editFullBtnText: { color: '#818cf8', fontSize: 14, fontWeight: '700' },

  gpsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, paddingVertical: 12, marginBottom: 12,
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)',
  },
  gpsIcon:    { fontSize: 16 },
  gpsBtnText: { color: '#34d399', fontSize: 13, fontWeight: '700' },

  editActions: { paddingHorizontal: 16, marginBottom: 8, gap: 10 },
  cancelBtn: {
    alignItems: 'center', paddingVertical: 13,
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(51,65,85,0.7)',
    backgroundColor: 'rgba(30,41,59,0.5)',
  },
  cancelBtnText: { color: '#64748b', fontSize: 14, fontWeight: '700' },

  dangerZone: { marginHorizontal: 16, marginTop: 8 },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderRadius: 14, paddingVertical: 14,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
  },
  signOutIcon: { fontSize: 18 },
  signOutText: { color: '#f87171', fontSize: 14, fontWeight: '700' },
});
