/**
 * Home-screen widgets (Android, react-native-android-widget).
 *
 * NowPlayingWidget: one dark rounded card. Artwork at the left with the title and artist beside it and a like
 * button; under them the elapsed and remaining time over a thin progress bar; previous, play / pause and next
 * at the foot. Short widgets drop the times.
 *
 * PlaylistWidget: up to four pinned playlists as tiles. A tap plays one in the background without opening the
 * app (1.41.0); the header shows the song playing with play / pause. A tap that played nothing says why in the foot.
 *
 * RemoteViews can't blur, so a "glass" button is a faint white fill on the card, and every glyph is an inline SVG
 * (icons.ts). Sizes come from widgetLayout.ts and colours from widgetTheme.ts.
 */
import React from 'react';
import { FlexWidget, ImageWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import type { ColorProp } from 'react-native-android-widget';
import { Icon } from './icons';
import { formatClock, widgetLink, WidgetPin, WidgetSnapshot } from './widgetData';
import { nowPlayingLayout, PLAYLIST_GAP, PLAYLIST_PAD, playlistLayout, progressWidth, songCountLabel } from './widgetLayout';
import { TILE_RADIUS, WIDGET_RADIUS, WidgetColor } from '../constants/widgetTheme';

type ImageSource = React.ComponentProps<typeof ImageWidget>['image'];
const asImage = (uri: string) => uri as ImageSource;

// ─── Small parts ────────────────────────────────────────────────────────────

const RoundButton: React.FC<{
  size: number;
  icon: string;
  iconSize: number;
  action: string;
  fill?: ColorProp;
  label: string;
}> = ({ size, icon, iconSize, action, fill = WidgetColor.glass, label }) => (
  <FlexWidget
    clickAction={action}
    accessibilityLabel={label}
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: fill,
      justifyContent: 'center',
      alignItems: 'center',
    }}
  >
    <SvgWidget svg={icon} style={{ width: iconSize, height: iconSize }} />
  </FlexWidget>
);

/** A cover, or the card's raised dark with a note when the song has no picture. */
const Cover: React.FC<{ uri?: string; size: number; radius: number }> = ({ uri, size, radius }) =>
  uri ? (
    <ImageWidget image={asImage(uri)} imageWidth={size} imageHeight={size} radius={radius} />
  ) : (
    <FlexWidget
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: WidgetColor.raised, justifyContent: 'center', alignItems: 'center' }}
    >
      <SvgWidget svg={Icon.note(WidgetColor.inkMuted)} style={{ width: size * 0.4, height: size * 0.4 }} />
    </FlexWidget>
  );

const Spacer: React.FC<{ width: number }> = ({ width }) => <FlexWidget style={{ width, height: 1 }} />;

// ─── Now playing ────────────────────────────────────────────────────────────

export const NowPlayingWidget: React.FC<{ snapshot: WidgetSnapshot; width: number; height: number }> = ({
  snapshot,
  width,
  height,
}) => {
  const { song, isPlaying, liked, position, duration } = snapshot;

  if (!song) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          width: 'match_parent',
          height: 'match_parent',
          borderRadius: WIDGET_RADIUS,
          backgroundColor: WidgetColor.surface,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
        }}
      >
        <SvgWidget svg={Icon.note(WidgetColor.inkMuted)} style={{ width: 28, height: 28 }} />
        <TextWidget text="Nothing playing" style={{ fontSize: 15, fontWeight: '600', color: WidgetColor.ink, marginTop: 10 }} />
      </FlexWidget>
    );
  }

  const layout = nowPlayingLayout(width, height);
  const filled = progressWidth(layout.barWidth, position, duration);

  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        borderRadius: WIDGET_RADIUS,
        backgroundColor: WidgetColor.surface,
        flexDirection: 'column',
        justifyContent: 'center',
        padding: layout.pad,
      }}
    >
      {/* Artwork, song, like */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: widgetLink.nowPlaying() }}
          accessibilityLabel="Open the player"
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
        >
          <Cover uri={song.cover} size={layout.art} radius={layout.artRadius} />
          <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 12 }}>
            <TextWidget text={song.title} maxLines={1} truncate="END" style={{ fontSize: 15, fontWeight: '700', color: WidgetColor.ink }} />
            <TextWidget text={song.artist || 'Unknown artist'} maxLines={1} truncate="END" style={{ fontSize: 12, color: WidgetColor.inkMuted, marginTop: 2 }} />
          </FlexWidget>
        </FlexWidget>
        <RoundButton
          size={layout.button - 4}
          iconSize={layout.icon - 2}
          icon={liked ? Icon.heart(WidgetColor.liked) : Icon.heartOutline(WidgetColor.inkMuted)}
          action="TOGGLE_LIKE"
          label={liked ? 'Unlike' : 'Like'}
          fill={WidgetColor.clear}
        />
      </FlexWidget>

      <FlexWidget style={{ flex: 1, width: 'match_parent' }} />

      {/* Progress and time */}
      <FlexWidget style={{ width: layout.barWidth, height: 4, borderRadius: 2, backgroundColor: WidgetColor.track, flexDirection: 'row' }}>
        {filled > 0 ? <FlexWidget style={{ width: filled, height: 4, borderRadius: 2, backgroundColor: WidgetColor.ink }} /> : null}
      </FlexWidget>
      {layout.showTimes ? (
        <FlexWidget style={{ width: layout.barWidth, flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <TextWidget text={formatClock(position)} style={{ fontSize: 11, color: WidgetColor.inkMuted }} />
          <TextWidget text={duration > 0 ? `-${formatClock(duration - position)}` : ''} style={{ fontSize: 11, color: WidgetColor.inkMuted }} />
        </FlexWidget>
      ) : null}

      <FlexWidget style={{ flex: 1, width: 'match_parent' }} />

      {/* Transport */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
        <RoundButton size={layout.button} iconSize={layout.icon} icon={Icon.previous(WidgetColor.ink)} action="PREVIOUS" label="Previous" />
        <Spacer width={layout.gap} />
        <RoundButton
          size={layout.playButton}
          iconSize={layout.playIcon}
          icon={isPlaying ? Icon.pause(WidgetColor.ink) : Icon.play(WidgetColor.ink)}
          action="TOGGLE_PLAY"
          label={isPlaying ? 'Pause' : 'Play'}
          fill={WidgetColor.glassStrong}
        />
        <Spacer width={layout.gap} />
        <RoundButton size={layout.button} iconSize={layout.icon} icon={Icon.next(WidgetColor.ink)} action="NEXT" label="Next" />
      </FlexWidget>
    </FlexWidget>
  );
};

// ─── Playlist ───────────────────────────────────────────────────────────────

/**
 * 1.41.0: four pinned playlists (Settings → Navigation and shortcuts → Widget playlists). A tap on a tile plays that
 * playlist straight away without opening the app; the header shows what is playing with play / pause. Until some are
 * pinned, the first four playlists stand in.
 */
export const PlaylistWidget: React.FC<{ snapshot: WidgetSnapshot; width: number; height?: number }> = ({ snapshot, width, height = 240 }) => {
  const pins = snapshot.pinned ?? [];
  const shell = {
    width: 'match_parent' as const,
    height: 'match_parent' as const,
    borderRadius: WIDGET_RADIUS,
    backgroundColor: WidgetColor.surface,
    padding: PLAYLIST_PAD,
    flexDirection: 'column' as const,
  };

  if (pins.length === 0) {
    return (
      <FlexWidget clickAction="OPEN_APP" style={{ ...shell, justifyContent: 'center', alignItems: 'center' }}>
        <SvgWidget svg={Icon.note(WidgetColor.inkMuted)} style={{ width: 28, height: 28 }} />
        <TextWidget text="No playlists yet" style={{ fontSize: 15, fontWeight: '600', color: WidgetColor.ink, marginTop: 10 }} />
      </FlexWidget>
    );
  }

  const { tileW, tileH, rows, header } = playlistLayout(width, height, pins.length, Boolean(snapshot.notice));
  const song = snapshot.song;

  const tile = (pin: WidgetPin) => (
    <FlexWidget
      key={pin.id}
      clickAction="PLAY_PLAYLIST"
      clickActionData={{ playlistId: pin.id, name: pin.name }}
      accessibilityLabel={`Play ${pin.name}`}
      style={{ width: tileW, height: tileH, borderRadius: TILE_RADIUS, backgroundColor: WidgetColor.raised }}
    >
      <OverlapWidget style={{ width: tileW, height: tileH }}>
        {pin.cover ? (
          <ImageWidget image={asImage(pin.cover)} imageWidth={tileW} imageHeight={tileH} radius={TILE_RADIUS} />
        ) : (
          <FlexWidget style={{ width: tileW, height: tileH, borderRadius: TILE_RADIUS, backgroundColor: WidgetColor.raised, justifyContent: 'center', alignItems: 'center' }}>
            <SvgWidget svg={Icon.note(WidgetColor.inkMuted)} style={{ width: 24, height: 24, marginBottom: 22 }} />
          </FlexWidget>
        )}
        <FlexWidget
          style={{
            width: tileW,
            height: tileH,
            borderRadius: TILE_RADIUS,
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: 10,
            backgroundGradient: { from: WidgetColor.fadeClear, to: WidgetColor.fadeDeep, orientation: 'TOP_BOTTOM' },
          }}
        >
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: tileW - 20 }}>
            <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
              <TextWidget text={pin.name} maxLines={1} truncate="END" style={{ fontSize: 13, fontWeight: '600', color: WidgetColor.ink }} />
              <TextWidget text={songCountLabel(pin.songCount)} maxLines={1} style={{ fontSize: 11, color: WidgetColor.inkMuted }} />
            </FlexWidget>
            <FlexWidget style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: WidgetColor.glassStrong, justifyContent: 'center', alignItems: 'center' }}>
              <SvgWidget svg={Icon.play(WidgetColor.ink)} style={{ width: 12, height: 12 }} />
            </FlexWidget>
          </FlexWidget>
        </FlexWidget>
      </OverlapWidget>
    </FlexWidget>
  );

  return (
    <FlexWidget style={shell}>
      <FlexWidget style={{ width: 'match_parent', height: header, flexDirection: 'row', alignItems: 'center' }}>
        {song ? (
          <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: widgetLink.nowPlaying() }} accessibilityLabel="Open the player" style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
            <Cover uri={song.cover} size={34} radius={8} />
            <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 10 }}>
              <TextWidget text={song.title} maxLines={1} truncate="END" style={{ fontSize: 14, fontWeight: '700', color: WidgetColor.ink }} />
              <TextWidget text={song.artist || 'Unknown artist'} maxLines={1} truncate="END" style={{ fontSize: 11, color: WidgetColor.inkMuted }} />
            </FlexWidget>
          </FlexWidget>
        ) : (
          <FlexWidget style={{ flex: 1 }}>
            <TextWidget text="Playlists" style={{ fontSize: 15, fontWeight: '700', color: WidgetColor.ink }} />
          </FlexWidget>
        )}
        {song ? (
          <RoundButton
            size={36}
            iconSize={18}
            icon={snapshot.isPlaying ? Icon.pause(WidgetColor.ink) : Icon.play(WidgetColor.ink)}
            action="TOGGLE_PLAY"
            label={snapshot.isPlaying ? 'Pause' : 'Play'}
            fill={WidgetColor.glassStrong}
          />
        ) : null}
      </FlexWidget>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', marginTop: PLAYLIST_GAP }}>
        {pins.slice(0, 2).map(tile)}
      </FlexWidget>
      {rows > 1 ? (
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', marginTop: PLAYLIST_GAP }}>
          {pins.slice(2, 4).map(tile)}
        </FlexWidget>
      ) : null}
      {snapshot.notice ? (
        <FlexWidget
          clickAction={snapshot.noticeUri ? 'OPEN_URI' : undefined}
          clickActionData={snapshot.noticeUri ? { uri: snapshot.noticeUri } : undefined}
          accessibilityLabel={snapshot.notice}
          style={{ width: 'match_parent', marginTop: 6 }}
        >
          <TextWidget text={snapshot.notice} maxLines={1} truncate="END" style={{ fontSize: 12, color: WidgetColor.ink }} />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
};
