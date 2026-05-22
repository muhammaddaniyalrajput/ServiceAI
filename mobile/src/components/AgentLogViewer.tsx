import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Animated } from 'react-native';
import { getAgentLogs } from '../services/api';
import { useBookingStore, AgentTraceStep } from '../store/bookingStore';

interface AgentLogViewerProps {
  bookingId: string;
}

const SlideInRow = ({ step }: { step: AgentTraceStep }) => {
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const getAgentBadgeColor = (agent: string) => {
    const name = agent.toLowerCase();
    if (name.includes('intent')) return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30';
    if (name.includes('discovery')) return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
    if (name.includes('ranking')) return 'bg-amber-500/10 text-amber-400 border border-amber-500/30';
    if (name.includes('booking')) return 'bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/30';
    if (name.includes('notification')) return 'bg-orange-500/10 text-orange-400 border border-orange-500/30';
    if (name.includes('follow')) return 'bg-pink-500/10 text-pink-400 border border-pink-500/30';
    return 'bg-slate-500/10 text-slate-400 border border-slate-500/30';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'processing') {
      return <ActivityIndicator size="small" color="#38bdf8" className="mr-1" />;
    }
    if (status === 'success') {
      return <Text className="text-emerald-500 font-bold mr-1 text-base">✓</Text>;
    }
    if (status === 'error') {
      return <Text className="text-red-500 font-bold mr-1 text-base">✗</Text>;
    }
    return <Text className="text-slate-500 mr-1 text-base">○</Text>;
  };

  return (
    <Animated.View
      style={{
        transform: [{ translateX: slideAnim }],
        opacity: opacityAnim,
      }}
      className="flex-row mb-6 relative"
    >
      {/* Timeline track node */}
      <View className="items-center mr-3 relative">
        <View className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 items-center justify-center z-10 shadow-sm">
          {getStatusIcon(step.status)}
        </View>
        <View className="absolute top-8 bottom-0 w-[2px] bg-slate-800 -mb-6" />
      </View>

      {/* Content Bubble */}
      <View className="flex-1 bg-slate-900 border border-slate-800/80 rounded-2xl p-4 shadow-md">
        <View className="flex-row justify-between items-center mb-1.5 flex-wrap gap-1">
          <Text className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${getAgentBadgeColor(step.agent)}`}>
            {step.agent}
          </Text>
          <Text className="text-slate-500 text-[10px] font-mono">
            {step.timestamp ? new Date(step.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
          </Text>
        </View>

        <Text className="text-slate-200 font-semibold text-sm mb-1">{step.action}</Text>
        
        {step.reasoning ? (
          <TouchableOpacity onPress={() => setExpanded(!expanded)} activeOpacity={0.85}>
            <Text
              numberOfLines={expanded ? undefined : 2}
              className="text-slate-400 text-xs leading-relaxed"
            >
              {step.reasoning}
            </Text>
            {step.reasoning.length > 80 && (
              <Text className="text-sky-400 font-medium text-[10px] mt-1">
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
      console.warn("Error polling agent logs:", err);
    }
  };

  useEffect(() => {
    // Initial fetch
    setLoading(true);
    fetchLogs().finally(() => setLoading(false));

    // Check if we should poll
    const shouldPoll = status !== 'confirmed' && status !== 'error';
    if (!shouldPoll) return;

    const interval = setInterval(() => {
      fetchLogs();
    }, 2000);

    return () => clearInterval(interval);
  }, [bookingId, status]);

  if (loading && agentLogs.length === 0) {
    return (
      <View className="flex-row items-center justify-center p-6 bg-slate-950/40 rounded-3xl border border-slate-900/60 my-4">
        <ActivityIndicator size="small" color="#0ea5e9" className="mr-3" />
        <Text className="text-slate-400 text-sm font-medium">Connecting to AI agents...</Text>
      </View>
    );
  }

  if (agentLogs.length === 0) {
    return null;
  }

  return (
    <View className="mt-4 px-1">
      <Text className="text-slate-300 font-semibold text-base mb-4 tracking-wide">Live Agent Trace</Text>
      <ScrollView
        scrollEnabled={false}
        contentContainerStyle={{ paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {agentLogs.map((step, idx) => (
          <SlideInRow key={`${step.agent}-${step.action}-${idx}`} step={step} />
        ))}
      </ScrollView>
    </View>
  );
};
