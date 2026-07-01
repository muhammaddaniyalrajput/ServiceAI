/**
 * LocationProfileScreen — Premium GPS onboarding experience.
 *
 * UX improvements over original:
 * - Animated pulsing ring on GPS button while fetching
 * - Smooth slide-up of coordinate chip after fetch
 * - FormInput with animated focus rings instead of plain TextInput
 * - Toast replaces Alert.alert() — non-blocking
 * - "Save & Continue" button locks with visual cue only when all data ready
 * - Editable address fields fade in after location fetch
 * - Progress step indicator (Step 3 of 3)
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Animated,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNativeDriver } from '../utils/animation';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { RootStackParamList } from '../types/navigation';
import { FormInput } from '../components/ui/FormInput';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { useToast } from '../components/ui/Toast';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'LocationProfile'>;

interface Coords { latitude: number; longitude: number }

// ─── Google Geocoding ──────────────────────────────────────────────────────────

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

function parseGeocoding(data: any): { province: string; city: string; formattedAddress: string } {
  const result = data?.results?.[0];
  if (!result) return { province: '', city: '', formattedAddress: '' };
  const comps: { types: string[]; long_name: string }[] = result.address_components ?? [];
  const find = (...types: string[]) =>
    comps.find((c) => types.some((t) => c.types.includes(t)))?.long_name ?? '';
  return {
    province:         find('administrative_area_level_1'),
    city:             find('locality', 'administrative_area_level_2'),
    formattedAddress: result.formatted_address ?? '',
  };
}

// ─── Pulsing GPS ring component ────────────────────────────────────────────────

const PulseRing: React.FC = () => {
  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;
  const op1    = useRef(new Animated.Value(0.5)).current;
  const op2    = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const ring1 = Animated.loop(
      Animated.parallel([
        Animated.timing(pulse1, { toValue: 2.2, duration: 1600, useNativeDriver }),
        Animated.timing(op1,    { toValue: 0,   duration: 1600, useNativeDriver }),
      ]),
    );
    const ring2 = Animated.loop(
      Animated.sequence([
        Animated.delay(600),
        Animated.parallel([
          Animated.timing(pulse2, { toValue: 2.2, duration: 1600, useNativeDriver }),
          Animated.timing(op2,    { toValue: 0,   duration: 1600, useNativeDriver }),
        ]),
      ]),
    );
    ring1.start();
    ring2.start();
    return () => { ring1.stop(); ring2.stop(); };
  }, []);

  return (
    <View style={[pulseStyles.container, { pointerEvents: 'none' }]}>
      <Animated.View style={[pulseStyles.ring, { transform: [{ scale: pulse1 }], opacity: op1 }]} />
      <Animated.View style={[pulseStyles.ring, { transform: [{ scale: pulse2 }], opacity: op2 }]} />
    </View>
  );
};

const pulseStyles = StyleSheet.create({
  container: { position: 'absolute', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  ring: {
    width: '100%', height: '100%',
    borderRadius: 14, borderWidth: 1.5, borderColor: '#10b981',
    position: 'absolute',
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LocationProfileScreen({ route, navigation }: Props) {
  const [uid, setUid]     = useState(route.params?.uid ?? auth.currentUser?.uid ?? '');
  const [name, setName]   = useState(route.params?.name ?? '');
  const [email, setEmail] = useState(route.params?.email ?? auth.currentUser?.email ?? '');
  const [phone, setPhone] = useState(route.params?.phone ?? '');
  const [isProfileLoading, setIsProfileLoading] = useState(!route.params);

  const [coords, setCoords]     = useState<Coords | null>(null);
  const [province, setProvince] = useState('');
  const [city, setCity]         = useState('');
  const [address, setAddress]   = useState('');

  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [isSaving, setIsSaving]                     = useState(false);

  const { showToast, ToastContainer } = useToast();

  // Animations
  const headerOpacity  = useRef(new Animated.Value(0)).current;
  const headerSlide    = useRef(new Animated.Value(-16)).current;
  const coordsScale    = useRef(new Animated.Value(0.8)).current;
  const coordsOpacity  = useRef(new Animated.Value(0)).current;
  const fieldsOpacity  = useRef(new Animated.Value(0)).current;
  const fieldsSlide    = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 400, useNativeDriver }),
      Animated.timing(headerSlide,   { toValue: 0, duration: 400, useNativeDriver }),
    ]).start();
  }, []);

  useEffect(() => {
    async function loadDraftProfile() {
      if (route.params) {
        setIsProfileLoading(false);
        return;
      }
      const currentUid = auth.currentUser?.uid;
      if (!currentUid) {
        setIsProfileLoading(false);
        return;
      }
      try {
        const { getDoc, doc } = require('firebase/firestore');
        const docSnap = await getDoc(doc(db, 'users', currentUid));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setName(data.name ?? '');
          setPhone(data.phone ?? '');
          setEmail(data.email ?? auth.currentUser?.email ?? '');
          setUid(currentUid);
        }
      } catch (err) {
        showToast('Failed to load profile details.', 'error');
      } finally {
        setIsProfileLoading(false);
      }
    }
    loadDraftProfile();
  }, []);

  // Animate fields in after first location fetch
  useEffect(() => {
    if (coords) {
      Animated.parallel([
        Animated.spring(coordsScale,   { toValue: 1, useNativeDriver, damping: 14, stiffness: 140 }),
        Animated.timing(coordsOpacity, { toValue: 1, duration: 300, useNativeDriver }),
        Animated.timing(fieldsOpacity, { toValue: 1, duration: 380, useNativeDriver }),
        Animated.timing(fieldsSlide,   { toValue: 0, duration: 380, useNativeDriver }),
      ]).start();
    }
  }, [coords]);

  const canSave =
    !isSaving && !isFetchingLocation &&
    !!coords && province.trim().length > 0 &&
    city.trim().length > 0 && address.trim().length > 0;

  // ── Fetch GPS + reverse-geocode ──
  const handleFetchLocation = async () => {
    if (isFetchingLocation || isSaving) return;
    setIsFetchingLocation(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showToast('Location access denied. Please enable it in Settings.', 'error', 4000);
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = position.coords;
      setCoords({ latitude, longitude });

      const res  = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`);
      const data = await res.json();

      if (data.status !== 'OK') {
        showToast(`Address lookup failed (${data.status}). Enter manually.`, 'warning', 4000);
        return;
      }

      const { province: p, city: c, formattedAddress } = parseGeocoding(data);
      setProvince(p);
      setCity(c);
      setAddress(formattedAddress);
      showToast('Location detected successfully!', 'success');
    } catch (error: any) {
      showToast(error?.message ?? 'Failed to fetch location. Try again.', 'error');
    } finally {
      setIsFetchingLocation(false);
    }
  };

  // ── Save profile ──
  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);

    try {
      await setDoc(doc(db, 'users', uid), {
        uid, name, email, phone,
        province:   province.trim(),
        city:       city.trim(),
        address:    address.trim(),
        coordinates: { latitude: coords!.latitude, longitude: coords!.longitude },
        profileCompleted: true,
        createdAt: serverTimestamp(),
      });
      // App.tsx onSnapshot listener will transition appState to 'app'
    } catch (error: any) {
      showToast(error?.message ?? 'Could not save profile. Check your connection.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isProfileLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <ToastContainer />

      <View style={styles.blobTop} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <Animated.View
          style={[styles.header, { opacity: headerOpacity, transform: [{ translateY: headerSlide }] }]}
        >
          <View style={styles.stepRow}>
            {[1, 2, 3].map((n) => (
              <View key={n} style={[styles.stepDot, n <= 3 ? styles.stepDotActive : styles.stepDotInactive]} />
            ))}
          </View>
          <Text style={styles.stepLabel}>Step 3 of 3</Text>
          <Text style={styles.title}>Complete Your Profile</Text>
          <Text style={styles.subtitle}>We'll match you with nearby service providers.</Text>
        </Animated.View>

        {/* ── User identity pill ── */}
        <View style={styles.identityPill}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.identityName}>{name}</Text>
            <Text style={styles.identityEmail}>{email}</Text>
          </View>
        </View>

        {/* ── Form card ── */}
        <View style={styles.card}>

          {/* GPS Button */}
          <View style={styles.gpsButtonWrapper}>
            <TouchableOpacity
              onPress={handleFetchLocation}
              disabled={isFetchingLocation || isSaving}
              style={[
                styles.gpsButton,
                coords ? styles.gpsButtonSuccess : styles.gpsButtonDefault,
                (isFetchingLocation || isSaving) && styles.gpsButtonDisabled,
              ]}
              activeOpacity={0.85}
            >
              {isFetchingLocation && <PulseRing />}
              <Text style={styles.gpsIcon}>
                {isFetchingLocation ? '⏳' : coords ? '✅' : '📍'}
              </Text>
              <Text style={styles.gpsLabel}>
                {isFetchingLocation
                  ? 'Fetching Location…'
                  : coords
                  ? 'Location Captured — Re-fetch?'
                  : 'Fetch Current Location'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Coordinates chip */}
          {coords && (
            <Animated.View
              style={[
                styles.coordChip,
                { opacity: coordsOpacity, transform: [{ scale: coordsScale }] },
              ]}
            >
              <View style={styles.coordDot} />
              <Text style={styles.coordLabel}>GPS</Text>
              <Text style={styles.coordText}>
                {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
              </Text>
            </Animated.View>
          )}

          {/* Hint banner — shown until location is fetched */}
          {!coords && (
            <View style={styles.hintBanner}>
              <Text style={styles.hintText}>
                📌 Tap above to auto-fill your location, or type your address manually below.
              </Text>
            </View>
          )}

          {/* Address fields — animate in after fetch */}
          <Animated.View style={{ opacity: coords ? fieldsOpacity : 1, transform: [{ translateY: coords ? fieldsSlide : 0 }] }}>
            <FormInput
              label="Province / State"
              leftIcon="🗺️"
              value={province}
              onChangeText={setProvince}
              placeholder="e.g. Punjab"
              editable={!isSaving}
            />
            <FormInput
              label="City"
              leftIcon="🏙️"
              value={city}
              onChangeText={setCity}
              placeholder="e.g. Islamabad"
              editable={!isSaving}
            />
            <FormInput
              label="Full Street Address"
              leftIcon="🏠"
              value={address}
              onChangeText={setAddress}
              placeholder="House 12, Street 5, G-13, Islamabad"
              multiline
              numberOfLines={3}
              editable={!isSaving}
            />
          </Animated.View>

          {/* Save button */}
          <PrimaryButton
            label="Save & Continue"
            loadingLabel="Saving Profile…"
            onPress={handleSave}
            isLoading={isSaving}
            disabled={!canSave}
            color="#6366f1"
            showArrow
          />

          {!canSave && !isSaving && (
            <Text style={styles.saveHint}>
              Fetch location and fill all fields to continue.
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0f172a' },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },

  blobTop: {
    position: 'absolute', top: -60, right: -60,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(99,102,241,0.07)',
  },

  header: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 64 : 44,
    paddingBottom: 20,
  },
  stepRow:  { flexDirection: 'row', gap: 6, marginBottom: 8 },
  stepDot:  { width: 24, height: 5, borderRadius: 3 },
  stepDotActive:   { backgroundColor: '#6366f1' },
  stepDotInactive: { backgroundColor: '#1e293b' },
  stepLabel: { color: '#818cf8', fontSize: 11, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
  title:     { color: '#f1f5f9', fontSize: 28, fontWeight: '800', marginBottom: 5 },
  subtitle:  { color: '#64748b', fontSize: 13 },

  identityPill: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 24, marginBottom: 16,
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: 'rgba(51,65,85,0.8)',
  },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#6366f1',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText:   { color: '#fff', fontSize: 18, fontWeight: '800' },
  identityName: { color: '#f1f5f9', fontWeight: '700', fontSize: 14 },
  identityEmail:{ color: '#64748b', fontSize: 12 },

  card: {
    backgroundColor: 'rgba(30,41,59,0.7)',
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingHorizontal: 24, paddingTop: 28, paddingBottom: 20,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: 'rgba(51,65,85,0.8)',
  },

  gpsButtonWrapper: { marginBottom: 16 },
  gpsButton: {
    borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  gpsButtonDefault: { backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.4)' },
  gpsButtonSuccess: { backgroundColor: 'rgba(16,185,129,0.1)',  borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.25)' },
  gpsButtonDisabled:{ opacity: 0.65 },
  gpsIcon:  { fontSize: 18 },
  gpsLabel: { color: '#34d399', fontSize: 14, fontWeight: '700' },

  coordChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(15,23,42,0.7)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(51,65,85,0.8)',
  },
  coordDot:  { width: 7, height: 7, borderRadius: 4, backgroundColor: '#10b981' },
  coordLabel:{ color: '#34d399', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  coordText: { color: '#64748b', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', flex: 1 },

  hintBanner: {
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
  },
  hintText: { color: '#fbbf24', fontSize: 12, lineHeight: 18 },

  saveHint: { color: '#475569', fontSize: 12, textAlign: 'center', marginTop: 10 },
});
