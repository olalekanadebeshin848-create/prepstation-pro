// src/screens/StrataSyncCenterScreen.jsx
// ─────────────────────────────────────────────────────────────────────────────
// PREPSTATION PRO — CLOUD STRATA SYNC & DOWNLOAD HUB
// ─────────────────────────────────────────────────────────────────────────────
// Premium, gamified interface with:
// 1. Easy navigation: category tabs, tier filter pills (All / Basic / Premium).
// 2. Premium filtering: all users see all new releases, but only Premium users
//    can download Premium packages. Basic packages are free for all.
// 3. In-place activation modal with hardware Device ID copy & WhatsApp vendor help.
// 4. One-tap instant download & direct database import (no document pickers!).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  Animated,
  Linking,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsDesktop, DESKTOP_CONTENT_MAX_WIDTH } from '../hooks/useResponsive';
import { Alert } from '../components/AlertProvider';
import {
  fetchStrataCatalog,
  evaluateCatalogStatus,
  downloadAndInstallStrata,
  syncAllPendingStrata,
  checkUserPremiumStatus,
  getActiveCatalogUrl,
  setActiveCatalogUrl,
  DEFAULT_CATALOG_URL,
} from '../services/StrataSyncService';
import { getOrCreateDeviceLicense } from '../services/LicenseService';
import { getUniqueDeviceId, saveSuccessfulActivation } from '../utils/activation';
import { ALL_CATEGORY_IDS } from '../config/categories';

export default function StrataSyncCenterScreen({
  onBack,
  onSyncCompleted,
  initialCategory = 'ALL',
}) {
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [evaluatedItems, setEvaluatedItems] = useState([]);
  const [summary, setSummary] = useState({ total: 0, newCount: 0, updateCount: 0, installedCount: 0 });

  // Navigation & Filtering
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState(initialCategory || 'ALL');
  const [tierFilter, setTierFilter] = useState('ALL'); // 'ALL' | 'BASIC' | 'PREMIUM'
  const [searchQuery, setSearchQuery] = useState('');

  // Licensing & Hardware Identity
  const [isUserPremium, setIsUserPremium] = useState(false);
  const [deviceLicenseCode, setDeviceLicenseCode] = useState(null);
  const [hardwareDeviceId, setHardwareDeviceId] = useState('');

  // Active download state tracking
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadPhase, setDownloadPhase] = useState('');
  const [batchSyncing, setBatchSyncing] = useState(false);
  const [batchStatus, setBatchStatus] = useState('');

  // Settings Modal State
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [catalogUrlInput, setCatalogUrlInput] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Premium Unlock Modal State
  const [premiumModalVisible, setPremiumModalVisible] = useState(false);
  const [targetPremiumItem, setTargetPremiumItem] = useState(null);
  const [activationInputKey, setActivationInputKey] = useState('');
  const [isActivatingKey, setIsActivatingKey] = useState(false);

  // Pulse animation for "NEW" indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  // Initial load
  useEffect(() => {
    loadData();
    checkUserPremiumStatus().then(active => setIsUserPremium(active));
    getOrCreateDeviceLicense().then(code => setDeviceLicenseCode(code));
    getUniqueDeviceId().then(id => setHardwareDeviceId(id));
    getActiveCatalogUrl().then(url => setCatalogUrlInput(url));
  }, []);

  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { catalog: fetchedCatalog, error } = await fetchStrataCatalog();
      if (fetchedCatalog) {
        setCatalog(fetchedCatalog);
        const { items, summary: newSummary } = await evaluateCatalogStatus(fetchedCatalog);
        setEvaluatedItems(items);
        setSummary(newSummary);
      } else {
        Alert.alert('Connection Notice', `Could not reach catalog: ${error || 'Unknown network error'}`);
      }
    } catch (err) {
      console.error('Error loading strata sync center:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Category counts
  const categoryNewCounts = useMemo(() => {
    const counts = {};
    evaluatedItems.forEach(item => {
      if (item.syncStatus === 'NEW' || item.syncStatus === 'UPDATE_AVAILABLE') {
        counts[item.examCategory] = (counts[item.examCategory] || 0) + 1;
      }
    });
    return counts;
  }, [evaluatedItems]);

  // Tier counts
  const tierCounts = useMemo(() => {
    let basicCount = 0;
    let premiumCount = 0;
    evaluatedItems.forEach(item => {
      if (item.tier === 'premium') premiumCount++;
      else basicCount++;
    });
    return { basic: basicCount, premium: premiumCount, total: evaluatedItems.length };
  }, [evaluatedItems]);

  // Filtered Items (by Category, Tier, and Search query)
  const filteredItems = useMemo(() => {
    return evaluatedItems.filter(item => {
      // 1. Category Filter
      const matchesCat =
        selectedCategoryFilter === 'ALL' || item.examCategory === selectedCategoryFilter;

      // 2. Tier Filter
      const matchesTier =
        tierFilter === 'ALL' ||
        (tierFilter === 'BASIC' && item.tier !== 'premium') ||
        (tierFilter === 'PREMIUM' && item.tier === 'premium');

      // 3. Search Query
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        item.displayName?.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query) ||
        item.examCategory?.toLowerCase().includes(query) ||
        item.strataId?.toLowerCase().includes(query);

      return matchesCat && matchesTier && matchesSearch;
    });
  }, [evaluatedItems, selectedCategoryFilter, tierFilter, searchQuery]);

  // Safe Clipboard Copy helper
  const handleCopyHardwareDetails = () => {
    const details = `Device ID: ${hardwareDeviceId}\nDevice Code: ${deviceLicenseCode || '------'}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(details);
    }
    Alert.alert('📋 Copied to Clipboard', `Your device credentials have been copied:\n\n${details}`);
  };

  // WhatsApp Vendor Contact
  const handleContactWhatsAppVendor = (strataName = '') => {
    const message = `Hello PrepStation Support,\n\nI want to unlock Premium Strata for my device.\nDevice ID: ${hardwareDeviceId}\nDevice Code: ${deviceLicenseCode}\nTarget Strata: ${strataName || 'All Premium Strata'}`;
    const url = `whatsapp://send?phone=+2349135912668&text=${encodeURIComponent(message)}`;
    Linking.canOpenURL(url)
      .then(supported =>
        supported
          ? Linking.openURL(url)
          : Linking.openURL(`https://wa.me/2349135912668?text=${encodeURIComponent(message)}`)
      )
      .catch(() => Alert.alert('Error', 'Could not open WhatsApp support.'));
  };

  // In-Place Premium Activation Submit
  const handleActivateSubmit = async () => {
    const key = (activationInputKey || '').trim();
    if (!key) {
      Alert.alert('Key Required', 'Please enter your license activation PIN or key.');
      return;
    }

    setIsActivatingKey(true);
    try {
      // Desktop bridge if on Electron
      if (typeof window !== 'undefined' && window.desktopLicense) {
        await window.desktopLicense.activate(key);
      }

      // Universal activation write
      const result = await saveSuccessfulActivation(key);
      if (result.success) {
        setIsUserPremium(true);
        Alert.alert('👑 Premium Unlocked!', 'Your device is now activated for all Premium Strata packages.');
        setPremiumModalVisible(false);

        // If user tapped a specific strata, download it immediately!
        if (targetPremiumItem) {
          handleDownloadSingle(targetPremiumItem, true);
        }
      } else {
        Alert.alert('Activation Failed', result.message || 'Invalid key.');
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Activation error.');
    } finally {
      setIsActivatingKey(false);
      setActivationInputKey('');
    }
  };

  // Download single item with Premium Gate
  const handleDownloadSingle = async (item, skipPremiumCheck = false) => {
    if (downloadingId || batchSyncing) return;

    // ── PREMIUM PERMISSION GATE ──
    if (item.tier === 'premium' && !isUserPremium && !skipPremiumCheck) {
      setTargetPremiumItem(item);
      setPremiumModalVisible(true);
      return;
    }

    setDownloadingId(item.id || item.strataId);
    setDownloadProgress(10);
    setDownloadPhase('Connecting to cloud...');

    try {
      const result = await downloadAndInstallStrata(item, {
        isUserActivated: isUserPremium || skipPremiumCheck,
        onProgress: ({ phase, percent }) => {
          setDownloadProgress(percent);
          if (phase === 'downloading') setDownloadPhase('Downloading package...');
          if (phase === 'unpacking') setDownloadPhase('Decrypting & validating...');
          if (phase === 'installing') setDownloadPhase('Installing into app...');
        },
      });

      // Refresh local evaluation
      const { items, summary: newSummary } = await evaluateCatalogStatus(catalog);
      setEvaluatedItems(items);
      setSummary(newSummary);

      Alert.alert(
        '🎉 Strata Synced Successfully!',
        `${result.displayName} is installed and ready for study!\n\nCategory: ${result.examCategory}\nBundles: ${result.bundleCount} loaded.`
      );

      if (onSyncCompleted) onSyncCompleted();
    } catch (err) {
      console.error('Download failure:', err);
      if (err.code === 'PREMIUM_REQUIRED') {
        setTargetPremiumItem(item);
        setPremiumModalVisible(true);
      } else {
        Alert.alert('Download Error', err.message || 'Failed to download or install strata.');
      }
    } finally {
      setDownloadingId(null);
      setDownloadProgress(0);
      setDownloadPhase('');
    }
  };

  // Batch sync all pending
  const handleSyncAllNew = async () => {
    const pendingItems = evaluatedItems.filter(
      item => item.syncStatus === 'NEW' || item.syncStatus === 'UPDATE_AVAILABLE'
    );

    if (pendingItems.length === 0) {
      Alert.alert('Everything Up to Date 🌟', 'All strata files in this catalog are already installed.');
      return;
    }

    setBatchSyncing(true);
    setBatchStatus(`Preparing ${pendingItems.length} strata files...`);

    try {
      const results = await syncAllPendingStrata(
        pendingItems,
        ({ currentIndex, total, currentItem }) => {
          setBatchStatus(`Syncing (${currentIndex}/${total}): ${currentItem.displayName}...`);
        },
        { isUserActivated: isUserPremium }
      );

      // Refresh list
      const { items, summary: newSummary } = await evaluateCatalogStatus(catalog);
      setEvaluatedItems(items);
      setSummary(newSummary);

      let msg = `Successfully synced ${results.successCount} strata packages.`;
      if (results.skippedPremiumCount > 0) {
        msg += `\n\n🔒 ${results.skippedPremiumCount} Premium packages skipped (Activation required). Tap on any Premium card to unlock!`;
      }
      if (results.failedCount > 0) {
        msg += `\n(${results.failedCount} failed — check connection)`;
      }

      Alert.alert('⚡ Batch Sync Finished', msg);
      if (onSyncCompleted) onSyncCompleted();
    } catch (err) {
      Alert.alert('Sync Error', err.message);
    } finally {
      setBatchSyncing(false);
      setBatchStatus('');
    }
  };

  // Save custom catalog settings
  const handleSaveCatalogSettings = async () => {
    setSavingSettings(true);
    const success = await setActiveCatalogUrl(catalogUrlInput);
    setSavingSettings(false);
    if (success) {
      setSettingsModalOpen(false);
      loadData(true);
      Alert.alert('Settings Saved', 'Strata cloud source updated.');
    } else {
      Alert.alert('Save Failed', 'Could not save the custom catalog URL.');
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* ── Top Header Navigation ────────────────────────────────────────── */}
      <View style={[styles.headerContainer, isDesktop && styles.headerDesktop]}>
        <View style={styles.headerLeftGroup}>
          <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
            <Text style={styles.backButtonIcon}>←</Text>
            <Text style={styles.backButtonText}>Home</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>☁️ Strata Cloud Hub</Text>
            <Text style={styles.headerSubtitle}>Discover & Auto-Sync Examination Strata</Text>
          </View>
        </View>

        <View style={styles.headerRightGroup}>
          {/* Member Status Badge */}
          {isUserPremium ? (
            <View style={styles.premiumActivePill}>
              <Text style={styles.premiumActivePillText}>👑 PREMIUM</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.basicTierPill}
              onPress={() => {
                setTargetPremiumItem(null);
                setPremiumModalVisible(true);
              }}
            >
              <Text style={styles.basicTierPillText}>⭐ BASIC • UPGRADE</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => loadData(true)}
            disabled={refreshing || loading}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#38bdf8" />
            ) : (
              <Text style={styles.headerIconEmoji}>🔄</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => setSettingsModalOpen(true)}
          >
            <Text style={styles.headerIconEmoji}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, isDesktop && styles.scrollContentDesktop]}
        showsVerticalScrollIndicator={isDesktop}
      >
        {/* ── Telemetry Dashboard Banner ─────────────────────────────────── */}
        <View style={styles.telemetryBanner}>
          <View style={styles.telemetryRow}>
            <View style={styles.telemetryStat}>
              <Text style={styles.telemetryLabel}>AVAILABLE</Text>
              <Text style={[styles.telemetryValue, { color: '#38bdf8' }]}>{summary.total}</Text>
            </View>

            <View style={styles.telemetryStat}>
              <Text style={styles.telemetryLabel}>NEW RELEASES</Text>
              <View style={styles.telemetryBadgeRow}>
                <Text style={[styles.telemetryValue, { color: '#10b981' }]}>{summary.newCount}</Text>
                {summary.newCount > 0 && (
                  <Animated.View style={[styles.pulseDot, { transform: [{ scale: pulseAnim }] }]} />
                )}
              </View>
            </View>

            <View style={styles.telemetryStat}>
              <Text style={styles.telemetryLabel}>UPDATES</Text>
              <Text style={[styles.telemetryValue, { color: '#f59e0b' }]}>{summary.updateCount}</Text>
            </View>

            <View style={styles.telemetryStat}>
              <Text style={styles.telemetryLabel}>INSTALLED</Text>
              <Text style={[styles.telemetryValue, { color: '#a78bfa' }]}>{summary.installedCount}</Text>
            </View>
          </View>

          {/* Master One-Tap Sync Action */}
          <TouchableOpacity
            style={[
              styles.masterSyncBtn,
              summary.newCount === 0 && summary.updateCount === 0 && styles.masterSyncBtnDimmed,
            ]}
            onPress={handleSyncAllNew}
            disabled={batchSyncing || (summary.newCount === 0 && summary.updateCount === 0)}
            activeOpacity={0.85}
          >
            {batchSyncing ? (
              <View style={styles.syncBtnContentRow}>
                <ActivityIndicator size="small" color="#022c22" />
                <Text style={styles.masterSyncBtnText}>{batchStatus || 'Syncing In Progress...'}</Text>
              </View>
            ) : (
              <View style={styles.syncBtnContentRow}>
                <Text style={styles.masterSyncBtnEmoji}>⚡</Text>
                <Text style={styles.masterSyncBtnText}>
                  {summary.newCount + summary.updateCount > 0
                    ? isUserPremium
                      ? `Sync All New Strata (${summary.newCount + summary.updateCount})`
                      : `Sync All Basic Strata (${summary.newCount + summary.updateCount} Available)`
                    : 'All Strata Up To Date'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Member Status Banner ──────────────────────────────────────── */}
        {!isUserPremium ? (
          <View style={styles.memberNoticeBanner}>
            <View style={styles.memberNoticeTextGroup}>
              <Text style={styles.memberNoticeHeading}>⭐ You are on the BASIC (Free) Tier</Text>
              <Text style={styles.memberNoticeSub}>
                All basic curriculum strata can be downloaded for free. Premium strata require device activation.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.memberNoticeUpgradeBtn}
              onPress={() => {
                setTargetPremiumItem(null);
                setPremiumModalVisible(true);
              }}
            >
              <Text style={styles.memberNoticeUpgradeBtnText}>Activate 👑</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.premiumActiveBanner}>
            <Text style={styles.premiumActiveBannerText}>
              👑 <Text style={{ fontWeight: '900' }}>PREMIUM ACTIVATED</Text> • Unlimited access to all Basic & Premium Strata files.
            </Text>
          </View>
        )}

        {/* ── Search Input ──────────────────────────────────────────────── */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by topic, novel, subject or exam..."
            placeholderTextColor="#64748b"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Easy Navigation Filter Bar: Tier Selector (All / Basic / Premium) ── */}
        <View style={styles.tierFilterRow}>
          <TouchableOpacity
            style={[styles.tierFilterBtn, tierFilter === 'ALL' && styles.tierFilterBtnActive]}
            onPress={() => setTierFilter('ALL')}
          >
            <Text style={[styles.tierFilterText, tierFilter === 'ALL' && styles.tierFilterTextActive]}>
              ALL TIERS ({tierCounts.total})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tierFilterBtn, tierFilter === 'BASIC' && styles.tierFilterBtnActive]}
            onPress={() => setTierFilter('BASIC')}
          >
            <Text style={[styles.tierFilterText, tierFilter === 'BASIC' && styles.tierFilterTextActive]}>
              ⭐ BASIC FREE ({tierCounts.basic})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tierFilterBtn, tierFilter === 'PREMIUM' && styles.tierFilterBtnActiveGold]}
            onPress={() => setTierFilter('PREMIUM')}
          >
            <Text style={[styles.tierFilterText, tierFilter === 'PREMIUM' && styles.tierFilterTextActiveGold]}>
              👑 PREMIUM ({tierCounts.premium})
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Category Filter Chips Horizontal Bar ──────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          <TouchableOpacity
            style={[
              styles.categoryChip,
              selectedCategoryFilter === 'ALL' && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategoryFilter('ALL')}
          >
            <Text
              style={[
                styles.categoryChipText,
                selectedCategoryFilter === 'ALL' && styles.categoryChipTextActive,
              ]}
            >
              ALL CATEGORIES
            </Text>
            {summary.newCount > 0 && (
              <View style={styles.chipCounterBadge}>
                <Text style={styles.chipCounterBadgeText}>{summary.newCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          {ALL_CATEGORY_IDS.map(catId => {
            const newCountForCat = categoryNewCounts[catId] || 0;
            const isSelected = selectedCategoryFilter === catId;
            return (
              <TouchableOpacity
                key={catId}
                style={[styles.categoryChip, isSelected && styles.categoryChipActive]}
                onPress={() => setSelectedCategoryFilter(catId)}
              >
                <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextActive]}>
                  {catId}
                </Text>
                {newCountForCat > 0 && (
                  <View style={styles.chipCounterBadge}>
                    <Text style={styles.chipCounterBadgeText}>{newCountForCat}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Strata Items List ─────────────────────────────────────────── */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#10b981" />
            <Text style={styles.loadingText}>Fetching available strata releases...</Text>
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>📦</Text>
            <Text style={styles.emptyTitle}>No Strata Found</Text>
            <Text style={styles.emptySub}>
              {searchQuery
                ? `No results match "${searchQuery}". Try a different keyword.`
                : 'No strata match your selected category/tier filter. Try selecting "ALL".'}
            </Text>
          </View>
        ) : (
          <View style={styles.itemsGrid}>
            {filteredItems.map(item => {
              const isItemDownloading = downloadingId === (item.id || item.strataId);
              const isNew = item.syncStatus === 'NEW';
              const isUpdate = item.syncStatus === 'UPDATE_AVAILABLE';
              const isInstalled = item.syncStatus === 'INSTALLED';
              const isPremium = item.tier === 'premium';
              const canDownload = !isPremium || isUserPremium;

              return (
                <View
                  key={item.id || item.strataId}
                  style={[
                    styles.strataCard,
                    isNew && styles.strataCardNew,
                    isPremium && styles.strataCardPremium,
                  ]}
                >
                  {/* Card Header Row */}
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.categoryBadge}>
                      <Text style={styles.categoryBadgeText}>{item.examCategory}</Text>
                    </View>

                    <View style={styles.badgesGroup}>
                      {isPremium ? (
                        <View style={styles.premiumBadge}>
                          <Text style={styles.premiumBadgeText}>👑 PREMIUM</Text>
                        </View>
                      ) : (
                        <View style={styles.basicBadge}>
                          <Text style={styles.basicBadgeText}>⭐ BASIC FREE</Text>
                        </View>
                      )}

                      {isNew && (
                        <View style={styles.statusBadgeNew}>
                          <Text style={styles.statusBadgeNewText}>✨ NEW</Text>
                        </View>
                      )}

                      {isUpdate && (
                        <View style={styles.statusBadgeUpdate}>
                          <Text style={styles.statusBadgeUpdateText}>🔄 UPDATE</Text>
                        </View>
                      )}

                      {isInstalled && (
                        <View style={styles.statusBadgeInstalled}>
                          <Text style={styles.statusBadgeInstalledText}>✓ INSTALLED</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Card Title & Description */}
                  <Text style={styles.cardTitle}>{item.displayName}</Text>
                  {item.description ? (
                    <Text style={styles.cardDesc} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}

                  {/* Card Telemetry Chips */}
                  <View style={styles.cardMetaRow}>
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipLabel}>
                        📚 {item.totalBundles || item.bundleCount || 5} Bundles
                      </Text>
                    </View>

                    {item.totalQuestions && (
                      <View style={styles.metaChip}>
                        <Text style={styles.metaChipLabel}>
                          📝 {item.totalQuestions} Questions
                        </Text>
                      </View>
                    )}

                    {item.size && (
                      <View style={styles.metaChip}>
                        <Text style={styles.metaChipLabel}>💾 {item.size}</Text>
                      </View>
                    )}

                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipLabel}>
                        🏷️ {item.fileType?.toUpperCase() || 'STRATA'}
                      </Text>
                    </View>
                  </View>

                  {/* Progress bar when downloading */}
                  {isItemDownloading && (
                    <View style={styles.downloadProgressContainer}>
                      <View style={styles.progressLabelRow}>
                        <Text style={styles.progressPhaseText}>{downloadPhase}</Text>
                        <Text style={styles.progressPercentText}>{downloadProgress}%</Text>
                      </View>
                      <View style={styles.progressBarTrack}>
                        <View style={[styles.progressBarFill, { width: `${downloadProgress}%` }]} />
                      </View>
                    </View>
                  )}

                  {/* Action Button */}
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      isInstalled && styles.actionBtnInstalled,
                      !isInstalled && canDownload && (isNew || isUpdate) && styles.actionBtnNew,
                      !isInstalled && !canDownload && styles.actionBtnLocked,
                      isItemDownloading && styles.actionBtnDisabled,
                    ]}
                    onPress={() => handleDownloadSingle(item)}
                    disabled={isItemDownloading || batchSyncing}
                    activeOpacity={0.8}
                  >
                    {isItemDownloading ? (
                      <View style={styles.actionBtnContent}>
                        <ActivityIndicator size="small" color="#fff" />
                        <Text style={styles.actionBtnText}>Installing into app...</Text>
                      </View>
                    ) : isInstalled ? (
                      <Text style={styles.actionBtnTextInstalled}>Re-Sync / Re-install ↻</Text>
                    ) : !canDownload ? (
                      <View style={styles.actionBtnContent}>
                        <Text style={{ fontSize: 13 }}>👑</Text>
                        <Text style={styles.actionBtnTextLocked}>Unlock Premium Strata 🔒</Text>
                      </View>
                    ) : (
                      <Text style={styles.actionBtnText}>
                        {isUpdate ? 'Update Strata 🔄' : 'Download & Install ⚡'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Premium Unlock Modal ───────────────────────────────────────── */}
      <Modal
        animationType="fade"
        transparent
        visible={premiumModalVisible}
        onRequestClose={() => setPremiumModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isDesktop && styles.modalCardDesktop]}>
            <View style={styles.premiumModalHeader}>
              <Text style={{ fontSize: 32 }}>👑</Text>
              <Text style={styles.premiumModalTitle}>Premium Strata Locked</Text>
              <Text style={styles.premiumModalSubtitle}>
                {targetPremiumItem
                  ? targetPremiumItem.displayName
                  : 'Exclusive Examination Syllabus & Bundles'}
              </Text>
            </View>

            <Text style={styles.premiumModalDesc}>
              This package contains complete syllabus questions, step-by-step explanations, and mock exam bundles reserved for activated users.
            </Text>

            {/* Device Identity Box */}
            <View style={styles.deviceCredentialCard}>
              <View style={styles.credentialRow}>
                <Text style={styles.credentialLabel}>Hardware Device ID:</Text>
                <Text style={styles.credentialVal} numberOfLines={1}>
                  {hardwareDeviceId || 'Loading...'}
                </Text>
              </View>
              <View style={styles.credentialRow}>
                <Text style={styles.credentialLabel}>Device License Code:</Text>
                <Text style={styles.credentialValCode}>
                  {deviceLicenseCode || '------'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.copyCredentialBtn}
                onPress={handleCopyHardwareDetails}
              >
                <Text style={styles.copyCredentialBtnText}>📋 Copy Device Credentials</Text>
              </TouchableOpacity>
            </View>

            {/* In-Place Activation Key Input */}
            <Text style={styles.activationInputLabel}>Enter Your Activation PIN / Key:</Text>
            <TextInput
              style={styles.activationInput}
              placeholder="Paste 10+ character key here"
              placeholderTextColor="#64748b"
              value={activationInputKey}
              onChangeText={setActivationInputKey}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={styles.activateSubmitBtn}
              onPress={handleActivateSubmit}
              disabled={isActivatingKey}
            >
              {isActivatingKey ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.activateSubmitBtnText}>Activate & Unlock Strata ⚡</Text>
              )}
            </TouchableOpacity>

            {/* WhatsApp Vendor Contact Button */}
            <TouchableOpacity
              style={styles.whatsAppContactBtn}
              onPress={() => handleContactWhatsAppVendor(targetPremiumItem?.displayName)}
            >
              <Text style={styles.whatsAppContactBtnText}>💬 Request Key via WhatsApp Support</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalDismissBtn}
              onPress={() => setPremiumModalVisible(false)}
            >
              <Text style={styles.modalDismissBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Cloud Source Settings Modal ─────────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent
        visible={settingsModalOpen}
        onRequestClose={() => setSettingsModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isDesktop && styles.modalCardDesktop]}>
            <Text style={styles.modalTitle}>⚙️ Cloud Strata Settings</Text>
            <Text style={styles.modalSub}>
              Enter the raw URL of your hosted <Text style={{ color: '#10b981', fontWeight: 'bold' }}>strata_catalog.json</Text> file on GitHub.
            </Text>

            <Text style={styles.modalInputLabel}>Catalog Manifest URL:</Text>
            <TextInput
              style={styles.modalInput}
              value={catalogUrlInput}
              onChangeText={setCatalogUrlInput}
              placeholder="https://raw.githubusercontent.com/.../strata_catalog.json"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={styles.modalResetBtn}
              onPress={() => setCatalogUrlInput(DEFAULT_CATALOG_URL)}
            >
              <Text style={styles.modalResetBtnText}>Reset to Default GitHub Source</Text>
            </TouchableOpacity>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setSettingsModalOpen(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveCatalogSettings}
                disabled={savingSettings}
              >
                {savingSettings ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={styles.modalSaveBtnText}>Save & Sync ⚡</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0f1d',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerDesktop: {
    maxWidth: DESKTOP_CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    width: '100%',
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  backButtonIcon: {
    color: '#38bdf8',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 4,
  },
  backButtonText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '500',
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  premiumActivePill: {
    backgroundColor: '#78350f',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  premiumActivePillText: {
    color: '#fde047',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  basicTierPill: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  basicTierPillText: {
    color: '#38bdf8',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIconEmoji: {
    fontSize: 15,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  scrollContentDesktop: {
    maxWidth: DESKTOP_CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    width: '100%',
  },
  telemetryBanner: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#1e293b',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 14,
  },
  telemetryStat: {
    alignItems: 'center',
  },
  telemetryLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  telemetryValue: {
    fontSize: 22,
    fontWeight: '900',
  },
  telemetryBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  masterSyncBtn: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10b981',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  masterSyncBtnDimmed: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  syncBtnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  masterSyncBtnEmoji: {
    fontSize: 16,
  },
  masterSyncBtnText: {
    color: '#022c22',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  memberNoticeBanner: {
    backgroundColor: '#1e1b4b',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#4338ca',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  memberNoticeTextGroup: {
    flex: 1,
    marginRight: 10,
  },
  memberNoticeHeading: {
    color: '#c7d2fe',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2,
  },
  memberNoticeSub: {
    color: '#818cf8',
    fontSize: 10,
    lineHeight: 14,
  },
  memberNoticeUpgradeBtn: {
    backgroundColor: '#f59e0b',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  memberNoticeUpgradeBtnText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '900',
  },
  premiumActiveBanner: {
    backgroundColor: '#2e1c05',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#d97706',
    marginBottom: 12,
  },
  premiumActiveBannerText: {
    color: '#fef08a',
    fontSize: 11,
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 12,
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 13,
  },
  searchClear: {
    color: '#94a3b8',
    fontSize: 14,
    paddingHorizontal: 6,
  },
  tierFilterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tierFilterBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  tierFilterBtnActive: {
    backgroundColor: '#0369a1',
    borderColor: '#38bdf8',
  },
  tierFilterBtnActiveGold: {
    backgroundColor: '#78350f',
    borderColor: '#f59e0b',
  },
  tierFilterText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.4,
  },
  tierFilterTextActive: {
    color: '#ffffff',
  },
  tierFilterTextActiveGold: {
    color: '#fef08a',
  },
  categoryScroll: {
    marginBottom: 14,
  },
  categoryScrollContent: {
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
  },
  categoryChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  categoryChipText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  categoryChipTextActive: {
    color: '#ffffff',
  },
  chipCounterBadge: {
    backgroundColor: '#10b981',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipCounterBadgeText: {
    color: '#022c22',
    fontSize: 9,
    fontWeight: '900',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: 6,
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptySub: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 280,
  },
  itemsGrid: {
    gap: 12,
  },
  strataCard: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  strataCardNew: {
    borderColor: '#10b981',
    borderWidth: 1.5,
    backgroundColor: '#06281e',
  },
  strataCardPremium: {
    borderColor: '#d97706',
    borderWidth: 1.5,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#334155',
  },
  categoryBadgeText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '900',
  },
  badgesGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  basicBadge: {
    backgroundColor: '#0f291e',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#10b981',
  },
  basicBadgeText: {
    color: '#6ee7b7',
    fontSize: 9,
    fontWeight: '900',
  },
  premiumBadge: {
    backgroundColor: '#78350f',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  premiumBadgeText: {
    color: '#fef08a',
    fontSize: 9,
    fontWeight: '900',
  },
  statusBadgeNew: {
    backgroundColor: '#064e3b',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#10b981',
  },
  statusBadgeNewText: {
    color: '#6ee7b7',
    fontSize: 9,
    fontWeight: '900',
  },
  statusBadgeUpdate: {
    backgroundColor: '#78350f',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  statusBadgeUpdateText: {
    color: '#fde047',
    fontSize: 9,
    fontWeight: '900',
  },
  statusBadgeInstalled: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusBadgeInstalledText: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '800',
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardDesc: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  cardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  metaChip: {
    backgroundColor: '#1f2937',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metaChipLabel: {
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '600',
  },
  downloadProgressContainer: {
    marginBottom: 10,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressPhaseText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '600',
  },
  progressPercentText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '800',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#1e293b',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 3,
  },
  actionBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnNew: {
    backgroundColor: '#10b981',
  },
  actionBtnLocked: {
    backgroundColor: '#92400e',
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  actionBtnInstalled: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  actionBtnTextLocked: {
    color: '#fef08a',
    fontSize: 12,
    fontWeight: '900',
  },
  actionBtnTextInstalled: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },

  // Premium Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  modalCardDesktop: {
    maxWidth: 520,
  },
  premiumModalHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  premiumModalTitle: {
    color: '#fef08a',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4,
  },
  premiumModalSubtitle: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
  premiumModalDesc: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginBottom: 14,
  },
  deviceCredentialCard: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#3b82f6',
    marginBottom: 14,
  },
  credentialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  credentialLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  credentialVal: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  credentialValCode: {
    color: '#38bdf8',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
  },
  copyCredentialBtn: {
    alignSelf: 'center',
    marginTop: 6,
    paddingVertical: 4,
  },
  copyCredentialBtnText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  activationInputLabel: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  activationInput: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569',
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#f8fafc',
    fontSize: 12,
    marginBottom: 10,
  },
  activateSubmitBtn: {
    backgroundColor: '#eab308',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 10,
  },
  activateSubmitBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '900',
  },
  whatsAppContactBtn: {
    backgroundColor: '#065f46',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#10b981',
    marginBottom: 12,
  },
  whatsAppContactBtnText: {
    color: '#6ee7b7',
    fontSize: 11,
    fontWeight: '800',
  },
  modalDismissBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  modalDismissBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },

  // Settings Modal Styles
  modalTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 6,
  },
  modalSub: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  modalInputLabel: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569',
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#f8fafc',
    fontSize: 12,
    marginBottom: 10,
  },
  modalResetBtn: {
    alignSelf: 'flex-start',
    marginBottom: 18,
  },
  modalResetBtnText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },
  modalSaveBtn: {
    flex: 1,
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalSaveBtnText: {
    color: '#022c22',
    fontSize: 12,
    fontWeight: '900',
  },
});
