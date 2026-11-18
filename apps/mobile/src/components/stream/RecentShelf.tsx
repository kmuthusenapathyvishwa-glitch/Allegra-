/**
 * Stream's "Recent" shelf and the header switch that drives it. The switch is two chips in the header (Songs,
 * Playlists); the shelf is the same six-tile grid for either. Both grids sit side by side on one track: changing the
 * view slides the track a screen width on the same spring as the switch's plate, the grids cross-fading as they pass,
 * so one smooth move carries Songs out and Playlists in (and back, from wherever it is). Reduce Motion swaps at once.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, SharedValue, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { Motion, Space } from '../../constants/allegraTheme';
import type { RecentView } from '../../services/stream/recentItems';
import { Segmented, Text } from '../../ui';
import * as Haptics from '../../utils/haptics';
import { swipePosition, swipeTarget } from './recentSwipe';
import { ShortcutGrid, type TrackItem } from './StreamHome';

const RECENT_OPTIONS = [
  { value: 'songs', label: 'Songs' },
  { value: 'playlists', label: 'Playlists' },
] as const satisfies readonly { value: RecentView; label: string }[];

/** `position` is the shelf's own (0 Songs, 1 Playlists): the switch's plate follows it, so a swipe on the shelf moves both. */
export const RecentSwitch: React.FC<{ view: RecentView; position: SharedValue<number>; onChange: (view: RecentView) => void }> = ({ view, position, onChange }) => (
  <View style={styles.switch}>
    <Segmented<RecentView> value={view} options={RECENT_OPTIONS} onChange={onChange} label="Recent: songs or playlists" compact position={position} />
  </View>
);

interface ShelfProps {
  view: RecentView;
  position: SharedValue<number>;
  onChange: (view: RecentView) => void;
  songs: TrackItem[];
  playlists: TrackItem[];
  onPressSong: (index: number) => void;
  onLongPressSong?: (index: number) => void;
  onPressPlaylist: (index: number) => void;
}

interface PaneProps {
  index: number;
  active: boolean;
  width: number;
  position: SharedValue<number>;
  onHeight: (height: number) => void;
  children: React.ReactNode;
}

/** One grid on the track: fades with its distance from the view, and is out of reach (touch and screen reader) when it is not the one shown. */
const Pane: React.FC<PaneProps> = ({ index, active, width, position, onHeight, children }) => {
  const fade = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - Math.abs(position.value - index)) }));
  return (
    <Animated.View
      style={[{ width }, fade]}
      pointerEvents={active ? 'auto' : 'none'}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      onLayout={e => onHeight(e.nativeEvent.layout.height)}
    >
      {children}
    </Animated.View>
  );
};

const emptyNote = (view: RecentView): string =>
  view === 'songs' ? 'Songs you play will show up here.' : 'Playlists you make or change will show up here.';

export const RecentShelf: React.FC<ShelfProps> = ({ view, position, onChange, songs, playlists, onPressSong, onLongPressSong, onPressPlaylist }) => {
  const reduce = useReducedMotion();
  // The shelf is a full-width section of the feed.
  const { width } = useWindowDimensions();
  const index = view === 'songs' ? 0 : 1;
  const dragFrom = useSharedValue(0);
  const [heights, setHeights] = useState<readonly [number, number]>([0, 0]);

  useEffect(() => {
    if (reduce) { position.value = index; return; }
    position.value = withSpring(index, Motion.spring.open);
  }, [index, reduce, position]);

  // A swipe on the shelf drags the track (and, through `position`, the switch's plate) with the finger, then settles
  // on a view. Vertical movement first hands the touch to the feed's scroll.
  const settle = (target: 0 | 1) => {
    const next: RecentView = target === 0 ? 'songs' : 'playlists';
    if (next === view) return;
    Haptics.tap();
    onChange(next);
  };
  const swipe = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onStart(() => {
      cancelAnimation(position);
      dragFrom.value = position.value;
    })
    .onUpdate(e => { position.value = swipePosition(dragFrom.value, e.translationX, width); })
    .onEnd(e => {
      const target = swipeTarget(position.value, e.velocityX);
      if (reduce) {
        position.value = target;
      } else {
        position.value = withSpring(target, Motion.spring.open);
      }
      runOnJS(settle)(target);
    });

  const track = useAnimatedStyle(() => ({ transform: [{ translateX: -position.value * width }] }), [width]);
  const setHeight = (pane: 0 | 1) => (height: number) => setHeights(current => (current[pane] === height ? current : pane === 0 ? [height, current[1]] : [current[0], height]));

  const grid = (kind: RecentView, items: TrackItem[], onPress: (i: number) => void, onLongPress?: (i: number) => void) => items.length === 0
    ? <View style={styles.empty}><Text variant="secondary" tone="secondary">{emptyNote(kind)}</Text></View>
    : <ShortcutGrid items={items} onPress={onPress} onLongPress={onLongPress} />;

  // The section is as tall as the grid showing, so a short Playlists grid leaves no gap under it.
  return (
    <GestureDetector gesture={swipe}>
      <View style={[styles.window, heights[index] > 0 && { height: heights[index] }]}>
        <Animated.View style={[styles.track, { width: width * 2 }, track]}>
          <Pane index={0} active={view === 'songs'} width={width} position={position} onHeight={setHeight(0)}>
            {grid('songs', songs, onPressSong, onLongPressSong)}
          </Pane>
          <Pane index={1} active={view === 'playlists'} width={width} position={position} onHeight={setHeight(1)}>
            {grid('playlists', playlists, onPressPlaylist)}
          </Pane>
        </Animated.View>
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  switch: { width: 164, flexShrink: 1 },
  window: { overflow: 'hidden' },
  track: { flexDirection: 'row', alignItems: 'flex-start' },
  empty: { paddingHorizontal: Space.md, paddingVertical: Space.lg },
});
