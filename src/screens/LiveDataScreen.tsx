// Phase 197 — live sensor dashboard.
//
// Grid of SensorGauge tiles (2 columns portrait / 3 landscape via
// useWindowDimensions), swipeable pages when the channel list exceeds
// a page, transport + banner header from the active connection.
// Screen-on only: the hook stops polling on unmount (Phase 197 scope;
// iOS background mode deferred).
//
// Reached only from ObdConnectScreen's connected pane; when the
// holder is empty (deep link, stale nav state) the screen renders a
// friendly not-connected pane instead of polling nothing.

import React, {useMemo} from 'react';
import {FlatList, Text, useWindowDimensions, View, } from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {Button} from '../components/Button';
import {SensorGauge} from '../components/SensorGauge';
import {
  DASHBOARD_CHANNEL_ORDER,
  STALE_AFTER_MS,
  useLiveSensorData,
} from '../hooks/useLiveSensorData';
import {TRANSPORT_LABELS} from '../obd/providerFactory';
import type {HomeStackParamList} from '../navigation/types';
import {createThemedStyles} from '../theme/createThemedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'LiveData'>;

/** Gauges per swipeable page. */
export const GAUGES_PER_PAGE = 6;

/** Split the display-ordered channels into pages. */
export function chunkIntoPages<T>(items: ReadonlyArray<T>, size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages;
}

export function LiveDataScreen({navigation}: Props) {
  const styles = useStyles();
  const {connection, readings, unsupported, polling, linkError} =
    useLiveSensorData();
  const {width, height} = useWindowDimensions();
  const columns = width > height ? 3 : 2;

  const pages = useMemo(
    () => chunkIntoPages(DASHBOARD_CHANNEL_ORDER, GAUGES_PER_PAGE),
    [],
  );
  const now = Date.now();

  if (!connection) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.pane}>
          <Text style={styles.title}>No adapter connected</Text>
          <Text style={styles.body}>
            Connect an OBD-II adapter first — live data reads through the
            active connection.
          </Text>
          <View style={styles.spacer} />
          <Button
            title="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="livedata-back-button"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header} testID="livedata-header">
        <Text style={styles.title}>Live data</Text>
        <Text style={styles.body}>
          {connection.device.name ?? 'Adapter'} ·{' '}
          {TRANSPORT_LABELS[connection.device.transport]} ·{' '}
          {connection.adapterBanner}
          {linkError ? ' · connection lost' : polling ? '' : ' · stopped'}
        </Text>
        {linkError ? (
          <Text style={styles.errorBody} testID="livedata-link-error">
            The adapter stopped responding — reconnect and try again.
          </Text>
        ) : null}
      </View>
      <FlatList
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={pages.length > 1}
        data={pages}
        keyExtractor={(_, index) => `page-${index}`}
        testID="livedata-pages"
        renderItem={({item: page}) => (
          <View style={[styles.page, {width}]}>
            <View style={styles.grid}>
              {page.map((channel) => {
                const reading = readings.get(channel.channelId);
                const value = reading?.value ?? null;
                const stale =
                  reading !== undefined && now - reading.at > STALE_AFTER_MS;
                return (
                  <View
                    key={channel.channelId}
                    style={{flexBasis: `${100 / columns}%`}}
                  >
                    <SensorGauge
                      name={channel.name}
                      unit={channel.unit}
                      value={value}
                      stale={stale}
                      unsupported={unsupported.has(channel.channelId)}
                      testID={`gauge-${channel.channelId}`}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        )}
      />
      <View style={styles.footer}>
        <Button
          title="Back"
          variant="secondary"
          onPress={() => navigation.goBack()}
          testID="livedata-back-button"
        />
      </View>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((t) => ({
  container: {flex: 1, backgroundColor: t.background},
  pane: {padding: 24, gap: 8},
  header: {paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8},
  title: {fontSize: 22, fontWeight: '700', color: t.textPrimary},
  body: {fontSize: 16, color: t.textSecondary, lineHeight: 20},
  errorBody: {fontSize: 16, color: t.severity.critical.fg, lineHeight: 20, marginTop: 4},
  page: {paddingHorizontal: 12, paddingVertical: 8},
  grid: {flexDirection: 'row', flexWrap: 'wrap'},
  footer: {padding: 16},
  spacer: {height: 12},
}));
