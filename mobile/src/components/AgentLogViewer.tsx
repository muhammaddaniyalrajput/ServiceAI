/**
 * AgentLogViewer — Live AI agent reasoning trace component.
 *
 * X6 Phase 3: Converted all NativeWind `className` props to `StyleSheet`
 * to be consistent with the rest of the customer app, removing the
 * dependency on NativeWind being wired up in the customer build.
 */
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from 'react-native';
import { useNativeDriver } from '../utils/animation';
import { getAgentLogs } from '../services/api';
import { useBookingStore, AgentTraceStep } from '../store/bookingStore';

interface AgentLogViewerProps {
  bookingId: string;
}

const getAgentBadgeStyle = (agent: string): object => {
  const name = agent.toLowerCase();
  if (name.includes('intent'))       return logStyles.badgeCyan;
  if (name.includes('discovery'))    return logStyles.badgeEmerald;
  if (name.includes('ranking'))      return logStyles.badgeAmber;
  if (name.includes('booking'))      return logStyles.badgeFuchsia;
  if (name.includes('notification')) return logStyles.badgeOrange;
  if (name.includes('follow'))       return logStyles.badgePink;
  return logStyles.badgeSlate;
};

const getAgentBadgeTextStyle = (agent: string): object => {
  const name = agent.toLowerCase();
  if (name.includes('intent'))       return logStyles.badgeTextCyan;
  if (name.includes('discovery'))    return logStyles.badgeTextEmerald;
  if (name.includes('ranking'))      return logStyles.badgeTextAmber;
  if (name.includes('booking'))      return logStyles.badgeTextFuchsia;
  if (name.includes('notification')) return logStyles.badgeTextOrange;
  if (name.includes('follow'))       return logStyles.badgeTextPink;
  return logStyles.badgeTextSlate;
};

const SlideInRow = ({ step }: { step: AgentTraceStep }) => {
  const slideAnim   = useRef(new Animated.Value(-100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim,   { toValue: 0, duration: 400, useNativeDriver }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver }),
    ]).start();
  }, []);

  const getStatusIcon = (status: string) => {
    if (status === 'processing') {
      return <ActivityIndicator size="small" color="#38bdf8" style={logStyles.statusIcon} />;
    }
    if (status === 'success') {
      return <Text style={logStyles.statusSuccess}>✓</Text>;
    }
    if (status === 'error') {
      return <Text style={logStyles.statusError}>✗</Text>;
    }
    return <Text style={logStyles.statusPending}>○</Text>;
  };

  return (
    <Animated.View
      style={[
        logStyles.rowContainer,
        { transform: [{ translateX: slideAnim }], opacity: opacityAnim },
      ]}
    >
      {/* Timeline track node */}
      <View style={logStyles.timelineTrack}>
        <View style={logStyles.timelineNode}>
          {getStatusIcon(step.status)}
        </View>
        <View style={logStyles.timelineConnector} />
      </View>

      {/* Content Bubble */}
      <View style={logStyles.contentBubble}>
        <View style={logStyles.contentHeader}>
          <View style={[logStyles.agentBadge, getAgentBadgeStyle(step.agent)]}>
            <Text style={[logStyles.agentBadgeText, getAgentBadgeTextStyle(step.agent)]}>
              {step.agent}
            </Text>
          </View>
          <Text style={logStyles.timestamp}>
            {step.timestamp
              ? new Date(step.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : ''}
          </Text>
        </View>

        <Text style={logStyles.actionText}>{step.action}</Text>

        {step.reasoning ? (
          <TouchableOpacity
            onPress={() => setExpanded(!expanded)}
            activeOpacity={0.85}
          >
            <Text
              numberOfLines={expanded ? undefined : 2}
              style={logStyles.reasoningText}
            >
              {step.reasoning}
            </Text>
            {step.reasoning.length > 80 && (
              <Text style={logStyles.expandToggle}>
                {expanded ? 'Show less' : 'Tap to expand...'}
              </Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </Animated.View>
  );
};

export const AgentLogViewer: React.FC<AgentLogViewerProps> = ({ bookingId }) => {
  const { agentLogs, setAgentLogs, status } = useBookingStore();
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    if (!bookingId) return;
    try {
      const response = await getAgentLogs(bookingId);
      if (response && response.steps) {
        setAgentLogs(response.steps);
      }
    } catch (err) {
      console.warn('Error polling agent logs:', err);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchLogs().finally(() => setLoading(false));

    const shouldPoll = status !== 'confirmed' && status !== 'error';
    if (!shouldPoll) return;

    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, [bookingId, status]);

  if (loading && agentLogs.length === 0) {
    return (
      <View style={logStyles.loadingContainer}>
        <ActivityIndicator size="small" color="#0ea5e9" style={logStyles.loadingSpinner} />
        <Text style={logStyles.loadingText}>Connecting to AI agents...</Text>
      </View>
    );
  }

  if (agentLogs.length === 0) {
    return null;
  }

  return (
    <View style={logStyles.container}>
      <Text style={logStyles.sectionTitle}>Live Agent Trace</Text>
      <ScrollView
        scrollEnabled={false}
        contentContainerStyle={logStyles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {agentLogs.map((step, idx) => (
          <SlideInRow key={`${step.agent}-${step.action}-${idx}`} step={step} />
        ))}
      </ScrollView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const logStyles = StyleSheet.create({
  container: { marginTop: 16, paddingHorizontal: 4 },
  sectionTitle: {
    color: '#cbd5e1',
    fontWeight: '600',
    fontSize: 15,
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  listContent: { paddingBottom: 16 },

  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(2,6,23,0.4)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.6)',
    marginVertical: 16,
  },
  loadingSpinner: { marginRight: 12 },
  loadingText: { color: '#94a3b8', fontSize: 13, fontWeight: '500' },

  // Row
  rowContainer: {
    flexDirection: 'row',
    marginBottom: 24,
  },

  // Timeline
  timelineTrack: { alignItems: 'center', marginRight: 12, position: 'relative' },
  timelineNode: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  timelineConnector: {
    position: 'absolute',
    top: 32,
    bottom: -24,
    width: 2,
    backgroundColor: '#1e293b',
  },

  // Status icons
  statusIcon: { marginRight: 0 },
  statusSuccess: { color: '#10b981', fontWeight: '700', fontSize: 14 },
  statusError:   { color: '#ef4444', fontWeight: '700', fontSize: 14 },
  statusPending: { color: '#64748b', fontSize: 14 },

  // Content
  contentBubble: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(30,41,59,0.8)',
    borderRadius: 16,
    padding: 14,
  },
  contentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
  },
  agentBadge: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  agentBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timestamp: { color: '#64748b', fontSize: 10, fontFamily: 'monospace' },

  actionText: { color: '#e2e8f0', fontWeight: '600', fontSize: 13, marginBottom: 4 },
  reasoningText: { color: '#94a3b8', fontSize: 11, lineHeight: 17 },
  expandToggle: { color: '#38bdf8', fontWeight: '500', fontSize: 10, marginTop: 4 },

  // Badge variants
  badgeCyan:    { backgroundColor: 'rgba(6,182,212,0.1)',   borderColor: 'rgba(6,182,212,0.3)' },
  badgeEmerald: { backgroundColor: 'rgba(16,185,129,0.1)',  borderColor: 'rgba(16,185,129,0.3)' },
  badgeAmber:   { backgroundColor: 'rgba(245,158,11,0.1)',  borderColor: 'rgba(245,158,11,0.3)' },
  badgeFuchsia: { backgroundColor: 'rgba(217,70,239,0.1)',  borderColor: 'rgba(217,70,239,0.3)' },
  badgeOrange:  { backgroundColor: 'rgba(249,115,22,0.1)',  borderColor: 'rgba(249,115,22,0.3)' },
  badgePink:    { backgroundColor: 'rgba(236,72,153,0.1)',  borderColor: 'rgba(236,72,153,0.3)' },
  badgeSlate:   { backgroundColor: 'rgba(100,116,139,0.1)', borderColor: 'rgba(100,116,139,0.3)' },

  badgeTextCyan:    { color: '#22d3ee' },
  badgeTextEmerald: { color: '#34d399' },
  badgeTextAmber:   { color: '#fbbf24' },
  badgeTextFuchsia: { color: '#e879f9' },
  badgeTextOrange:  { color: '#fb923c' },
  badgeTextPink:    { color: '#f472b6' },
  badgeTextSlate:   { color: '#94a3b8' },
});
