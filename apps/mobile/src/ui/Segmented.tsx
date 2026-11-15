/**
 * A segmented control: two to four options in one frosted capsule, the chosen one under a white capsule plate that
 * slides to it (1.41.0: the same capsule language as chips and buttons; it sits on glass panels such as Up next).
 * Both are full capsules, so the curves nest. For more options, use `Chip`s.
 * The plate and the labels share one position value, so the label colours cross over as the plate passes under them.
 */
import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, { interpolateColor, SharedValue, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { Control, Glass, Motion, Radius, Signal, Space, Typography } from '../constants/allegraTheme';
import { Tactile } from '../components/allegra/motion';

const PAD = 3;
/** The compact capsule's cell: shorter than a full target, which a 4pt hit slop above and below makes up. */
const COMPACT_CELL = 36;

export interface SegmentedProps<T extends string> {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  /** The group's accessible name. */
  label: string;
  /** A shorter capsule for headers. */
  compact?: boolean;
}

const Label: React.FC<{ index: number; position: SharedValue<number>; children: string }> = ({ index, position, children }) => {
  const color = useAnimatedStyle(() => ({
    color: interpolateColor(Math.min(1, Math.abs(position.value - index)), [0, 1], [Signal.bgDeep, Signal.inkSoft]),
  }));
  return <Animated.Text style={[Typography.secondary, styles.text, color]}>{children}</Animated.Text>;
};

export function Segmented<T extends string>({ value, options, onChange, label, compact = false }: SegmentedProps<T>) {
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const cell = options.length > 0 ? Math.max(0, width - PAD * 2) / options.length : 0;
  const index = Math.max(0, options.findIndex(o => o.value === value));
  const position = useSharedValue(index);
  useEffect(() => {
    if (reduce) { position.value = index; return; }
    position.value = withSpring(index, Motion.spring.open);
  }, [index, reduce, position]);
  const plate = useAnimatedStyle(() => ({
    width: cell,
    opacity: cell > 0 ? 1 : 0,
    transform: [{ translateX: position.value * cell }],
  }), [cell]);
  const cellHeight = compact ? COMPACT_CELL : Control.target;
  return (
    <View
      style={[styles.track, { minHeight: cellHeight + PAD * 2 }]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      <Animated.View pointerEvents="none" style={[styles.plate, plate]} />
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <Tactile
            key={o.value}
            onPress={() => { if (!selected) onChange(o.value); }}
            haptic={selected ? undefined : 'select'}
            pressScale={0.96}
            hitSlop={compact ? { top: 4, bottom: 4 } : undefined}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            wrapperStyle={styles.cellWrap}
            style={[styles.cell, { minHeight: cellHeight }]}
          >
            <Label index={i} position={position}>{o.label}</Label>
          </Tactile>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: PAD,
    borderRadius: Radius.pill,
    backgroundColor: Glass.capsule,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairline,
  },
  plate: { position: 'absolute', top: PAD, bottom: PAD, left: PAD, borderRadius: Radius.pill, backgroundColor: Signal.wave },
  cellWrap: { flex: 1 },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Space.xs },
  // One weight for both states: a bolder selected label would reflow the text as the plate arrives.
  text: { fontWeight: '600' },
});
