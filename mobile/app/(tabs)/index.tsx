import React, { useState, useRef } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert as RNAlert,
} from 'react-native';
import { router } from 'expo-router';

import { apiErrorMessage } from '@/api/client';
import type { CommandAction, Device, Pump, PumpNotification } from '@/api/types';
import { useSession } from '@/auth/SessionContext';
import {
  useCommands,
  useCreateCommand,
  useCreatePump,
  useDeletePump,
  useDevices,
  useDeviceStatus,
  useEsp32Config,
  useNotifications,
  useMarkNotificationRead,
  useProfile,
  usePumps,
  useUpdatePump,
} from '@/data/queries';
import {
  clearCommandIdempotencyKey,
  getCommandIdempotencyKey,
} from '@/data/commandIdempotency';
import {
  AppButton,
  AppScreen,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  StateBadge,
  formatDate,
} from '@/ui/components';
import { motorLabel } from '@/utils/format';
import { displayMotorState } from '@/utils/motorState';

interface DashboardPumpCardProps {
  pump: Pump;
  dev: Device | undefined;
  commandStatusMsg: string | undefined;
  handleControlCommand: (pump: Pump, action: CommandAction) => void;
  openEditModal: (pump: Pump) => void;
  setHistoryPump: (pump: Pump) => void;
  setEsp32Pump: (pump: Pump) => void;
  setDeletingPump: (pump: Pump) => void;
}

function DashboardPumpCard({
  pump,
  dev,
  commandStatusMsg,
  handleControlCommand,
  openEditModal,
  setHistoryPump,
  setEsp32Pump,
  setDeletingPump,
}: DashboardPumpCardProps) {
  const statusQuery = useDeviceStatus(dev?.id ?? null);

  const motorState = pump.actual_motor_status
    ? pump.actual_motor_status.toLowerCase()
    : displayMotorState(statusQuery.data);

  const connStatus = pump.connection_status
    ? pump.connection_status
    : dev
    ? dev.is_online
      ? 'Online'
      : 'Offline'
    : 'Not Paired';

  const feedbackTone =
    motorState === 'running'
      ? 'success'
      : motorState === 'fault'
      ? 'danger'
      : motorState === 'stopped'
      ? 'neutral'
      : 'warning';

  return (
    <Card style={styles.pumpCardContainer}>
      {/* CARD HEADER */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pumpTitle}>{pump.name}</Text>
          <Text style={styles.pumpSubTitle}>📍 {pump.location || 'Location Not Set'}</Text>
        </View>
        <StateBadge label={motorLabel(motorState as 'unknown' | 'running' | 'stopped' | 'fault')} tone={feedbackTone} />
      </View>

      {/* SPECS ROW */}
      <View style={styles.specsGrid}>
        <View style={styles.specBox}>
          <Text style={styles.specLbl}>Capacity</Text>
          <Text style={styles.specVal}>{pump.motor_capacity_hp || pump.rated_power_kw || '5.0'} HP</Text>
        </View>
        <View style={styles.specBox}>
          <Text style={styles.specLbl}>Type / Phase</Text>
          <Text style={styles.specVal}>{pump.motor_type || 'Submersible'} ({pump.phase_configuration || '3-Phase'})</Text>
        </View>
        <View style={styles.specBox}>
          <Text style={styles.specLbl}>Controller ID</Text>
          <Text style={styles.specVal}>{dev ? dev.serial_number : pump.controller_id || 'Not Assigned'}</Text>
        </View>
        <View style={styles.specBox}>
          <Text style={styles.specLbl}>Connection</Text>
          <Text style={[styles.specVal, { color: connStatus === 'Online' ? '#00E676' : '#FFB300' }]}>
            {connStatus}
          </Text>
        </View>
      </View>

      {/* FAULT / STATUS MSG BANNER */}
      {pump.latest_fault ? (
        <View style={styles.faultBanner}>
          <Text style={styles.faultTxt}>⚠️ Fault Detected: {pump.latest_fault}</Text>
        </View>
      ) : null}

      {commandStatusMsg ? (
        <Text style={styles.cmdMsg}>{commandStatusMsg}</Text>
      ) : null}

      {/* PUMP CONTROLS */}
      <View style={styles.controlsRow}>
        <AppButton
          title="⚡ START PUMP"
          onPress={() => handleControlCommand(pump, 'start')}
          disabled={motorState === 'running' || connStatus === 'Offline'}
          style={{ flex: 1, backgroundColor: '#00E676' }}
        />
        <AppButton
          title="🛑 STOP PUMP"
          variant="danger"
          onPress={() => handleControlCommand(pump, 'stop')}
          disabled={motorState === 'stopped' || connStatus === 'Offline'}
          style={{ flex: 1 }}
        />
      </View>

      {/* CARD FOOTER ACTIONS */}
      <View style={styles.cardFooter}>
        <Text style={styles.lastSeenTxt}>
          Last Seen: {dev?.last_seen_at ? formatDate(dev.last_seen_at) : 'Never'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={() => setEsp32Pump(pump)}>
            <Text style={styles.actionBtnTxt}>💻 ESP32 Code</Text>
          </Pressable>
          <Pressable onPress={() => setHistoryPump(pump)}>
            <Text style={styles.actionBtnTxt}>📜 History</Text>
          </Pressable>
          <Pressable onPress={() => openEditModal(pump)}>
            <Text style={styles.actionBtnTxt}>✏️ Edit</Text>
          </Pressable>
          <Pressable onPress={() => setDeletingPump(pump)}>
            <Text style={[styles.actionBtnTxt, { color: '#FF5252' }]}>🗑️ Delete</Text>
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

export default function SinglePageDashboard() {
  const { signOut } = useSession();
  const profile = useProfile();
  const pumps = usePumps();
  const devices = useDevices();
  const commands = useCommands();
  const notifications = useNotifications();
  const createCommand = useCreateCommand();
  const createPump = useCreatePump();
  const updatePump = useUpdatePump();
  const deletePump = useDeletePump();
  const markNotificationRead = useMarkNotificationRead();

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'All' | 'Running' | 'Stopped' | 'Offline' | 'Fault'>('All');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPump, setEditingPump] = useState<Pump | null>(null);
  const [deletingPump, setDeletingPump] = useState<Pump | null>(null);
  const [historyPump, setHistoryPump] = useState<Pump | null>(null);
  const [esp32Pump, setEsp32Pump] = useState<Pump | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const esp32Config = useEsp32Config(esp32Pump?.id ?? null);

  // Add / Edit Form fields
  const [formName, setFormName] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formHp, setFormHp] = useState('');
  const [formType, setFormType] = useState('Submersible');
  const [formPhases, setFormPhases] = useState('3-Phase');
  const [formControllerId, setFormControllerId] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formError, setFormError] = useState('');

  // Command execution tracker
  const commandInFlight = useRef(false);
  const [commandStatusMsg, setCommandStatusMsg] = useState<Record<string, string>>({});

  if (pumps.isPending) {
    return (
      <AppScreen style={{ backgroundColor: '#0B192C' }}>
        <LoadingState label="Loading Pump Connector system..." />
      </AppScreen>
    );
  }

  if (pumps.isError) {
    return (
      <AppScreen style={{ backgroundColor: '#0B192C' }}>
        <ErrorState
          message={apiErrorMessage(pumps.error)}
          onRetry={() => void pumps.refetch()}
        />
      </AppScreen>
    );
  }

  const allPumps = pumps.data ?? [];
  const allDevices = devices.data ?? [];
  const allNotifications: PumpNotification[] = notifications.data ?? [];
  const unreadCount = allNotifications.filter((n) => !n.is_read).length;

  // Compute Statistics
  let runningCount = 0;
  let stoppedCount = 0;
  let offlineCount = 0;
  let faultCount = 0;

  allPumps.forEach((p) => {
    const dev = allDevices.find((d) => d.pump === p.id);
    const conn = p.connection_status || (dev ? (dev.is_online ? 'Online' : 'Offline') : 'Not Paired');
    const motor = p.actual_motor_status || (dev ? dev.motor_feedback : 'unknown');

    if (motor.toLowerCase() === 'running') runningCount++;
    else if (motor.toLowerCase() === 'stopped') stoppedCount++;

    if (conn === 'Offline') offlineCount++;
    if (conn === 'Fault' || motor.toLowerCase() === 'fault') faultCount++;
  });

  // Filter & Search Logic
  const filteredPumps = allPumps.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.controller_id || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    const dev = allDevices.find((d) => d.pump === p.id);
    const conn = p.connection_status || (dev ? (dev.is_online ? 'Online' : 'Offline') : 'Not Paired');
    const motor = (p.actual_motor_status || (dev ? dev.motor_feedback : 'unknown')).toLowerCase();

    if (activeFilter === 'Running') return motor === 'running';
    if (activeFilter === 'Stopped') return motor === 'stopped';
    if (activeFilter === 'Offline') return conn === 'Offline';
    if (activeFilter === 'Fault') return conn === 'Fault' || motor === 'fault';
    return true;
  });

  const openAddModal = () => {
    setFormName('');
    setFormLocation('');
    setFormHp('5.0');
    setFormType('Submersible');
    setFormPhases('3-Phase');
    setFormControllerId('');
    setFormDescription('');
    setFormError('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (pump: Pump) => {
    setEditingPump(pump);
    setFormName(pump.name);
    setFormLocation(pump.location || '');
    setFormHp(pump.motor_capacity_hp || '5.0');
    setFormType(pump.motor_type || 'Submersible');
    setFormPhases(pump.phase_configuration || '3-Phase');
    setFormControllerId(pump.controller_id || '');
    setFormDescription(pump.installation_description || '');
    setFormError('');
  };

  const handleSaveAdd = async () => {
    if (!formName.trim()) {
      setFormError('Pump name is required.');
      return;
    }
    setFormError('');
    try {
      await createPump.mutateAsync({
        name: formName.trim(),
        location: formLocation.trim(),
        motor_capacity_hp: formHp.trim() || '0.0',
        motor_type: formType,
        phase_configuration: formPhases,
        controller_id: formControllerId.trim(),
        installation_description: formDescription.trim(),
      });
      setIsAddModalOpen(false);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    }
  };

  const handleSaveEdit = async () => {
    if (!editingPump || !formName.trim()) {
      setFormError('Pump name is required.');
      return;
    }
    setFormError('');
    try {
      await updatePump.mutateAsync({
        id: editingPump.id,
        payload: {
          name: formName.trim(),
          location: formLocation.trim(),
          motor_capacity_hp: formHp.trim() || '0.0',
          motor_type: formType,
          phase_configuration: formPhases,
          controller_id: formControllerId.trim(),
          installation_description: formDescription.trim(),
        },
      });
      setEditingPump(null);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingPump) return;
    try {
      await deletePump.mutateAsync(deletingPump.id);
      setDeletingPump(null);
    } catch (err) {
      RNAlert.alert('Delete Error', apiErrorMessage(err));
    }
  };

  const handleControlCommand = (pump: Pump, action: CommandAction) => {
    RNAlert.alert(
      `Confirm ${action.toUpperCase()} Command`,
      `Are you sure you want to send ${action.toUpperCase()} command to "${pump.name}"? The system will wait for actual physical hardware feedback.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Send ${action.toUpperCase()}`,
          style: action === 'stop' ? 'destructive' : 'default',
          onPress: async () => {
            if (commandInFlight.current) return;
            commandInFlight.current = true;
            setCommandStatusMsg((prev) => ({ ...prev, [pump.id]: `Sending ${action.toUpperCase()}...` }));
            try {
              const idempotencyKey = await getCommandIdempotencyKey(pump.id, action);
              await createCommand.mutateAsync({
                pumpId: pump.id,
                action,
                idempotencyKey,
              });
              await clearCommandIdempotencyKey(pump.id, action);
              setCommandStatusMsg((prev) => ({ ...prev, [pump.id]: `${action.toUpperCase()} sent. Awaiting feedback...` }));
            } catch (err) {
              setCommandStatusMsg((prev) => ({ ...prev, [pump.id]: `Failed: ${apiErrorMessage(err)}` }));
            } finally {
              commandInFlight.current = false;
            }
          },
        },
      ]
    );
  };

  const userName = profile.data ? `${profile.data.first_name} ${profile.data.last_name}`.trim() || profile.data.email : 'Operator';

  return (
    <AppScreen style={styles.dashboardContainer} contentStyle={{ paddingHorizontal: 12, paddingBottom: 40 }}>
      {/* 1. HEADER */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>PC</Text>
          </View>
          <View>
            <Text style={styles.brandTitle}>PUMP CONNECTOR</Text>
            <Text style={styles.brandSubtitle}>Remote Water Pump Automation Platform</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => setIsNotificationsOpen(true)}
            accessibilityLabel="Notifications"
          >
            <Text style={styles.iconTxt}>🔔</Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadTxt}>{unreadCount}</Text>
              </View>
            )}
          </Pressable>
          <Pressable
            style={styles.iconBtn}
            onPress={() => setIsProfileOpen(true)}
            accessibilityLabel="Profile Settings"
          >
            <Text style={styles.iconTxt}>👤</Text>
          </Pressable>
        </View>
      </View>

      {/* 2. STATS SUMMARY DASHBOARD */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderLeftColor: '#00E676' }]}>
          <Text style={styles.statNumber}>{runningCount}</Text>
          <Text style={styles.statLabel}>Running</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#64748B' }]}>
          <Text style={styles.statNumber}>{stoppedCount}</Text>
          <Text style={styles.statLabel}>Stopped</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#FFB300' }]}>
          <Text style={styles.statNumber}>{offlineCount}</Text>
          <Text style={styles.statLabel}>Offline</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#FF5252' }]}>
          <Text style={styles.statNumber}>{faultCount}</Text>
          <Text style={styles.statLabel}>Faults</Text>
        </View>
      </View>

      {/* 3. SEARCH & FILTER TABS */}
      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by pump name, location, or serial..."
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <AppButton title="+ Add Pump" compact onPress={openAddModal} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
        {(['All', 'Running', 'Stopped', 'Offline', 'Fault'] as const).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveFilter(tab)}
            style={[styles.filterTab, activeFilter === tab && styles.filterTabActive]}
          >
            <Text style={[styles.filterTabTxt, activeFilter === tab && styles.filterTabTxtActive]}>
              {tab}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* 4. INDIVIDUAL PUMP CARDS */}
      {filteredPumps.length === 0 ? (
        <EmptyState
          title="No pumps found"
          message={searchQuery ? "No pump matches your search/filter query." : "You haven't added any pumps yet."}
          action={{ label: "Add Pump", onPress: openAddModal }}
        />
      ) : (
        <View style={{ gap: 14, marginTop: 10 }}>
          {filteredPumps.map((pump) => {
            const dev = allDevices.find((d) => d.pump === pump.id);
            return (
              <DashboardPumpCard
                key={pump.id}
                pump={pump}
                dev={dev}
                commandStatusMsg={commandStatusMsg[pump.id]}
                handleControlCommand={handleControlCommand}
                openEditModal={openEditModal}
                setHistoryPump={setHistoryPump}
                setEsp32Pump={setEsp32Pump}
                setDeletingPump={setDeletingPump}
              />
            );
          })}
        </View>
      )}

      {/* 5. RECENT SYSTEM ACTIVITY FEED */}
      <View style={{ marginTop: 24 }}>
        <Text style={styles.sectionHeading}>Recent Operation Logs</Text>
        <Card style={{ gap: 8 }}>
          {(commands.data ?? []).slice(0, 4).map((cmd) => (
            <View key={cmd.id} style={styles.logItem}>
              <Text style={{ color: '#E2E8F0', fontWeight: '700', fontSize: 13 }}>
                Command {cmd.action.toUpperCase()}
              </Text>
              <Text style={{ color: '#94A3B8', fontSize: 11 }}>
                Status: {cmd.status} · {formatDate(cmd.created_at)}
              </Text>
            </View>
          ))}
          {(commands.data ?? []).length === 0 && (
            <Text style={{ color: '#64748B', fontSize: 13 }}>No recent command activity.</Text>
          )}
        </Card>
      </View>

      {/* ==================== MODALS ==================== */}

      {/* ADD / EDIT PUMP MODAL */}
      <Modal visible={isAddModalOpen || Boolean(editingPump)} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingPump ? 'Edit Pump Details' : 'Add New Water Pump'}</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              <FormField label="Pump Name" value={formName} onChangeText={setFormName} placeholder="e.g. Borewell Pump 1" />
              <FormField label="Location / Field" value={formLocation} onChangeText={setFormLocation} placeholder="e.g. North Acre Sector A" />
              <FormField label="Motor Capacity (HP)" value={formHp} onChangeText={setFormHp} keyboardType="decimal-pad" placeholder="e.g. 5.0" />
              <FormField label="Motor Type" value={formType} onChangeText={setFormType} placeholder="Submersible / Centrifugal / Jet" />
              <FormField label="Phase Configuration" value={formPhases} onChangeText={setFormPhases} placeholder="1-Phase / 3-Phase" />
              <FormField label="Controller / ESP32 Serial ID" value={formControllerId} onChangeText={setFormControllerId} placeholder="e.g. ESP32-PUMP-001" />
              <FormField label="Installation Description" value={formDescription} onChangeText={setFormDescription} placeholder="Optional notes" />
              {formError ? <Text style={styles.errorTxt}>{formError}</Text> : null}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <AppButton title="Cancel" variant="secondary" onPress={() => { setIsAddModalOpen(false); setEditingPump(null); }} style={{ flex: 1 }} />
              <AppButton title={editingPump ? "Update" : "Save Pump"} onPress={editingPump ? handleSaveEdit : handleSaveAdd} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* DELETE CONFIRM MODAL */}
      <Modal visible={Boolean(deletingPump)} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Delete Pump</Text>
            <Text style={{ color: '#CBD5E1', marginVertical: 12 }}>
              {`Are you sure you want to delete "${deletingPump?.name ?? ''}"? This action cannot be undone.`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <AppButton title="Cancel" variant="secondary" onPress={() => setDeletingPump(null)} style={{ flex: 1 }} />
              <AppButton title="Delete" variant="danger" onPress={handleDeleteConfirm} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* HISTORY & TELEMETRY MODAL */}
      <Modal visible={Boolean(historyPump)} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>{historyPump?.name} - Operation History</Text>
            <ScrollView style={{ marginVertical: 12 }}>
              <Text style={{ color: '#94A3B8', fontWeight: '700', marginBottom: 8 }}>Past Commands & Events</Text>
              {(commands.data ?? [])
                .filter((c) => c.pump === historyPump?.id)
                .map((cmd) => (
                  <View key={cmd.id} style={styles.logItem}>
                    <Text style={{ color: '#00E676', fontWeight: '700' }}>Command: {cmd.action.toUpperCase()}</Text>
                    <Text style={{ color: '#CBD5E1', fontSize: 12 }}>Status: {cmd.status} | Requested: {formatDate(cmd.created_at)}</Text>
                  </View>
                ))}
              {(commands.data ?? []).filter((c) => c.pump === historyPump?.id).length === 0 && (
                <Text style={{ color: '#64748B' }}>No commands recorded for this pump.</Text>
              )}
            </ScrollView>
            <AppButton title="Close" variant="secondary" onPress={() => setHistoryPump(null)} />
          </View>
        </View>
      </Modal>

      {/* ESP32 CODE MODAL */}
      <Modal visible={Boolean(esp32Pump)} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <Text style={styles.modalTitle}>💻 ESP32 Code for {esp32Pump?.name}</Text>
            <ScrollView style={{ marginVertical: 10 }}>
              {esp32Config.isPending ? (
                <Text style={{ color: '#94A3B8' }}>Generating ESP32 C++ Code...</Text>
              ) : esp32Config.isError ? (
                <Text style={{ color: '#FF5252' }}>{apiErrorMessage(esp32Config.error)}</Text>
              ) : (
                <>
                  <Text style={{ color: '#00E676', fontWeight: '700', marginBottom: 6 }}>
                    Copy this config.h code into firmware/PumpConnector/config.h:
                  </Text>
                  <View style={{ backgroundColor: '#1E293B', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                    <Text selectable style={{ color: '#E2E8F0', fontFamily: 'monospace', fontSize: 11 }}>
                      {esp32Config.data?.config_h_code}
                    </Text>
                  </View>
                  <Text style={{ color: '#94A3B8', fontSize: 12, lineHeight: 18 }}>
                    {esp32Config.data?.instructions}
                  </Text>
                </>
              )}
            </ScrollView>
            <AppButton title="Close" variant="secondary" onPress={() => setEsp32Pump(null)} />
          </View>
        </View>
      </Modal>

      {/* NOTIFICATIONS MODAL */}
      <Modal visible={isNotificationsOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>System Notifications</Text>
            <ScrollView style={{ marginVertical: 12 }}>
              {allNotifications.length === 0 ? (
                <Text style={{ color: '#64748B' }}>No notifications received.</Text>
              ) : (
                allNotifications.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => void markNotificationRead.mutateAsync(item.id)}
                    style={[styles.notifCard, !item.is_read && styles.notifUnread]}
                  >
                    <Text style={styles.notifMsg}>{item.message}</Text>
                    <Text style={styles.notifTime}>{formatDate(item.created_at)}</Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
            <AppButton title="Close" variant="secondary" onPress={() => setIsNotificationsOpen(false)} />
          </View>
        </View>
      </Modal>

      {/* PROFILE & SETTINGS MODAL */}
      <Modal visible={isProfileOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>User Account & Settings</Text>
            <View style={{ marginVertical: 14, gap: 8 }}>
              <Text style={{ color: '#CBD5E1' }}>Full Name: {userName}</Text>
              <Text style={{ color: '#CBD5E1' }}>Email: {profile.data?.email}</Text>
              <Text style={{ color: '#CBD5E1' }}>Phone: {profile.data?.phone_number || 'Not set'}</Text>
              <Text style={{ color: '#CBD5E1' }}>Timezone: {profile.data?.timezone || 'UTC'}</Text>
            </View>
            <View style={{ gap: 10 }}>
              <AppButton title="Pair ESP32 Controller" onPress={() => { setIsProfileOpen(false); router.push('/pair-device'); }} />
              <AppButton title="Sign Out" variant="danger" onPress={() => { setIsProfileOpen(false); void signOut(); }} />
              <AppButton title="Close" variant="secondary" onPress={() => setIsProfileOpen(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  dashboardContainer: {
    flex: 1,
    backgroundColor: '#0B192C',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    marginBottom: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#00E676',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: '#0B192C',
    fontWeight: '900',
    fontSize: 16,
  },
  brandTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconTxt: {
    fontSize: 16,
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#FF5252',
    borderRadius: 10,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadTxt: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 4,
  },
  statNumber: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  searchBarContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1E293B',
    color: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
  },
  tabsScroll: {
    marginBottom: 10,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    marginRight: 8,
  },
  filterTabActive: {
    backgroundColor: '#00E676',
  },
  filterTabTxt: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  filterTabTxtActive: {
    color: '#0B192C',
    fontWeight: '800',
  },
  pumpCardContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  pumpTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
  },
  pumpSubTitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  specsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: '#0B192C',
    padding: 10,
    borderRadius: 8,
  },
  specBox: {
    width: '47%',
  },
  specLbl: {
    color: '#64748B',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  specVal: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  faultBanner: {
    backgroundColor: '#3B0764',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A855F7',
  },
  faultTxt: {
    color: '#F0ABFC',
    fontSize: 12,
    fontWeight: '600',
  },
  cmdMsg: {
    color: '#38BDF8',
    fontSize: 12,
    fontStyle: 'italic',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  lastSeenTxt: {
    color: '#64748B',
    fontSize: 11,
  },
  actionBtnTxt: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeading: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
  },
  logItem: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  errorTxt: {
    color: '#FF5252',
    fontSize: 12,
    marginTop: 6,
  },
  notifCard: {
    padding: 10,
    backgroundColor: '#0B192C',
    borderRadius: 8,
    marginBottom: 8,
  },
  notifUnread: {
    borderLeftWidth: 3,
    borderLeftColor: '#00E676',
  },
  notifMsg: {
    color: '#F8FAFC',
    fontSize: 13,
  },
  notifTime: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 4,
  },
});
