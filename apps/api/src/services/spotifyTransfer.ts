import { createHash, randomBytes } from 'node:crypto';
import { SPOTIFY_LIKED_ID, type SpotifyFailureReason, type SpotifySourcePlaylist, type SpotifyStatus, type SpotifySyncStep } from '../shared/spotify.js';
import type { LibraryOp } from '../shared/library.js';
import type { AuthService } from '../auth/auth.js';
import type { ImportMatcher } from './importMatch.js';
import type { SpotifyPlaylist, SpotifyProvider, SpotifyTrack } from '../providers/spotify.js';
import { SpotifyApiError } from '../providers/spotify.js';
import type { SpotifyStore, StoredSpotifyPlaylist } from '../db/spotifyStore.js';

const SCOPE = 'playlist-read-private playlist-read-collaborative user-library-read';
const LIKED_NAME = 'Liked Songs';
const STATE_TTL_MS = 10 * 60_000;
const BATCH = 50;
const LEASE_MS = 90_000;
// ponytail: per-call wall-clock budget; Convex re-calls while `more` is true, so big playlists finish over several calls.
const DAILY_BUDGET_MS = 45_000;

/** A sign-in that failed after its state was read: carries where it started (app or website) and the real cause. */
export class SpotifyCallbackError extends Error {
  public constructor(public readonly original: unknown, public readonly returnTo: 'web' | 'mobile') {
    super(original instanceof Error ? original.message : 'Spotify connection failed.');
    this.name = 'SpotifyCallbackError';
  }
}

/**
 * Why a Spotify sign-in failed, as a code the website and app can explain (it travels in the return URL, so it is a
 * fixed word, never the provider's message). `not_allowed` is Spotify refusing an account that is not on a
 * development-mode app's allowed list (403 on the profile); `expired` a link used twice or after ten minutes.
 */
export function spotifyFailureReason(error: unknown): SpotifyFailureReason {
  const cause = error instanceof SpotifyCallbackError ? error.original : error;
  if (!(cause instanceof SpotifyApiError)) return 'failed';
  if (cause.status === 403) return 'not_allowed';
  if (cause.status === 400 && /expired/i.test(cause.message)) return 'expired';
  if (cause.status === 429 || cause.status >= 500) return 'unavailable';
  return 'failed';
}

export class SpotifyTransferService {
  private readonly refreshes = new Map<string, Promise<AccessGrant>>();

  public constructor(
    private readonly provider: SpotifyProvider | undefined,
    private readonly clientId: string | undefined,
    private readonly redirectUri: string,
    private readonly store: SpotifyStore,
    private readonly auth: AuthService,
    private readonly matcher: ImportMatcher
  ) {}

  public get configured(): boolean { return Boolean(this.provider && this.clientId); }
  /** Same origin as the registered callback, so a local callback returns to the local app. */
  public get webReturnUrl(): string { return new URL('/import', this.redirectUri).toString(); }

  public async connect(userId: string, returnTo: 'web' | 'mobile'): Promise<string> {
    if (!this.provider || !this.clientId) throw new SpotifyApiError(503, 'Spotify connection is not configured.');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = randomBytes(32).toString('base64url');
    const stateHash = createHash('sha256').update(state).digest('hex');
    await this.store.saveState(stateHash, { userId, verifier, returnTo }, Date.now() + STATE_TTL_MS);
    const url = new URL('https://accounts.spotify.com/authorize');
    url.search = new URLSearchParams({ response_type: 'code', client_id: this.clientId, redirect_uri: this.redirectUri, scope: SCOPE, state, code_challenge_method: 'S256', code_challenge: challenge }).toString();
    return url.toString();
  }

  public async callback(code: string, rawState: string): Promise<'web'|'mobile'> {
    if (!this.provider) throw new SpotifyApiError(503, 'Spotify connection is not configured.');
    const stateHash = createHash('sha256').update(rawState).digest('hex');
    const state = await this.store.consumeState(stateHash, Date.now());
    if (!state) throw new SpotifyApiError(400, 'This Spotify connection link expired. Start again.');
    try {
      const token = await this.provider.exchangeCode(code, state.verifier, this.redirectUri);
      const me = await this.provider.me(token.accessToken);
      const now = Date.now();
      const old = await this.store.connection(state.userId);
      await this.store.saveConnection({ userId: state.userId, spotifyUserId: me.id, refreshToken: token.refreshToken ?? old?.refreshToken ?? '', accessToken: token.accessToken, accessExpiresAt: now + Math.max(30, token.expiresIn) * 1000, dailyEnabled: old?.dailyEnabled ?? false, connectedAt: old?.connectedAt ?? now, updatedAt: now });
      return state.returnTo;
    } catch (error) {
      // The connect began in the app or on the website: a failure goes back to the same place, not always the website.
      throw new SpotifyCallbackError(error, state.returnTo);
    }
  }

  public async cancel(rawState: string): Promise<'web'|'mobile'> {
    const hash = createHash('sha256').update(rawState).digest('hex');
    const state = await this.store.consumeState(hash, Date.now());
    if (!state) throw new SpotifyApiError(400, 'This Spotify connection link expired. Start again.');
    return state.returnTo;
  }

  public async status(userId: string): Promise<SpotifyStatus> {
    const [connection, rows] = await Promise.all([this.store.connection(userId), this.store.playlists(userId)]);
    return { configured: this.configured, connected: Boolean(connection?.refreshToken), dailyEnabled: connection?.dailyEnabled ?? false, playlists: rows.filter(row => row.enabled).map(publicPlaylist) };
  }

  /** Liked Songs first, then playlists. A connection made before the library scope lists Liked Songs as needing a reconnect. */
  public async sourcePlaylists(userId: string): Promise<SpotifySourcePlaylist[]> {
    const provider = this.requireProvider();
    const { token } = await this.accessToken(userId);
    const [liked, playlists] = await Promise.all([provider.likedSummary(token), provider.playlists(token)]);
    const likedRow: SpotifySourcePlaylist = { id: SPOTIFY_LIKED_ID, name: LIKED_NAME, snapshotId: liked?.snapshotId ?? '', total: liked?.total ?? 0, imageUrl: null, kind: 'liked', ...(liked ? {} : { needsReconnect: true }) };
    return [likedRow, ...playlists];
  }

  /** What a sync step needs about its source; Liked Songs answers from the saved-tracks endpoint. */
  private async source(provider: SpotifyProvider, token: string, playlistId: string): Promise<SpotifyPlaylist | null> {
    if (playlistId !== SPOTIFY_LIKED_ID) return provider.playlist(token, playlistId);
    const liked = await provider.likedSummary(token);
    if (!liked) throw new SpotifyApiError(403, 'Reconnect Spotify to bring over your Liked Songs.');
    return { id: SPOTIFY_LIKED_ID, name: LIKED_NAME, snapshotId: liked.snapshotId, total: liked.total, imageUrl: null };
  }

  /**
   * `skipUnchanged` (daily job, with the row it already read): a finished scan whose Spotify snapshot hasn't moved
   * does no work. Manual sync always rescans, retrying review rows. Every store write carries the connection
   * generation the step started under, so a step in flight across disconnect or reconnect writes nothing after it.
   */
  public async sync(userId: string, playlistId: string, skipUnchanged = false, saved?: StoredSpotifyPlaylist): Promise<SpotifySyncStep> {
    const provider = this.requireProvider();
    const liked = playlistId === SPOTIFY_LIKED_ID;
    if (!liked && !/^[A-Za-z0-9]{10,40}$/.test(playlistId)) throw new SpotifyApiError(400, 'Choose a valid Spotify playlist.');
    const { token, generation } = await this.accessToken(userId);
    const source = await this.source(provider, token, playlistId);
    if (!source) throw new SpotifyApiError(404, 'Spotify could not find that playlist.');
    const now = Date.now();
    // Liked Songs become Allegra likes; a playlist becomes its own library (see libraryHome for which one).
    const saveHome = liked ? null : saved ?? await this.store.playlist(userId, playlistId);
    if (skipUnchanged && saved?.lastSyncedAt && saved.offset === 0 && saved.scanSnapshotId === source.snapshotId) {
      return { complete: true, added: 0, skipped: 0, reviewNeeded: 0, libraryId: saveHome?.libraryId ?? (liked ? SPOTIFY_LIKED_ID : libraryIdFor(playlistId)) };
    }
    const profile = await this.auth.getUser(userId);
    if (!profile) throw new SpotifyApiError(401, 'Sign in again to continue this transfer.');
    const home = liked ? { libraryId: SPOTIFY_LIKED_ID, removed: false } : libraryHome(playlistId, saveHome, new Set(profile.libraries.map(row => row.id)));
    const libraryId = home.libraryId;
    // The listener deleted the playlist this one was transferred into. Manual: bring it back whole, as a new library.
    // Daily: leave it deleted (a nightly run must not undo a deletion); the listener's own transfer recreates it.
    if (skipUnchanged && home.removed) return { complete: true, added: 0, skipped: 0, reviewNeeded: 0, libraryId };
    // The playlist row keeps naming the old library until a step has written to the new one, so a failed first step
    // is retried into the same new library instead of moving on to yet another.
    if (!(await this.store.savePlaylist({ userId, playlistId, name: source.name, snapshotId: source.snapshotId, total: source.total, libraryId: saveHome?.libraryId ?? libraryId, enabled: true, updatedAt: now }, generation))) throw connectionChanged();
    const leaseToken = randomBytes(18).toString('base64url');
    let claimed = await this.store.claim(userId, playlistId, leaseToken, now, LEASE_MS, generation);
    if (!claimed) throw new SpotifyApiError(409, 'This playlist is already syncing. Try again shortly.');
    try {
      let offset = claimed.offset;
      // The items page carries no snapshot_id; the playlist listing does. Edited mid-scan -> restart (receipts make the rescan cheap).
      // So does a playlist whose library was deleted (the row still names the old one): the pages already scanned went there.
      const moved = saveHome !== null && saveHome !== undefined && saveHome.libraryId !== libraryId;
      if (offset > 0 && (moved || claimed.scanSnapshotId !== source.snapshotId)) {
        offset = 0;
        claimed = { ...claimed, added: 0, skipped: 0, reviewNeeded: 0 };
        delete claimed.orderAt;
      }
      const page = liked ? await provider.likedItems(token, offset, BATCH) : await provider.items(token, playlistId, offset, BATCH);
      const ids = page.tracks.map(track => track.id);
      // Receipts say "saved to this library": a new library after a deletion starts with none, so every song is added again.
      const seen = await this.store.receipts(userId, playlistId, ids, libraryId);
      const unseen = page.tracks.filter(track => !seen.has(track.id));
      const results = await this.matcher.match(unseen.map(toImportedTrack));
      const receiptRows: { trackId: string; libraryId: string }[] = [];
      const ops: LibraryOp[] = [];
      const libraryExists = liked || profile.libraries.some(row => row.id === libraryId);
      if (!libraryExists) ops.push({ op: 'playlist_upsert', playlistId: libraryId, name: source.name.slice(0, 60), isPublic: false, at: now });
      const sourceCount = page.total <= offset ? 0 : Math.min(BATCH, page.total - offset);
      let added = claimed.added; const skipped = claimed.skipped + seen.size + Math.max(0, sourceCount - page.tracks.length); let reviewNeeded = claimed.reviewNeeded;
      // Where each song sits in the playlist, in Spotify's own order (see placeInOrder).
      const placed = liked ? null : placeInOrder(page.tracks, claimed.orderAt ?? 0);
      for (let i = 0; i < unseen.length; i++) {
        const track = unseen[i]!; const result = results[i];
        if (result?.confidence === 'exact' && result.song) {
          const at = placed?.at.get(track.id) ?? stableAddedAt(track.addedAt);
          ops.push(liked
            ? { op: 'like', ref: result.song.ref, song: result.song, origin: 'import', at }
            : { op: 'playlist_add', playlistId: libraryId, ref: result.song.ref, song: result.song, origin: 'import', at });
          receiptRows.push({ trackId: track.id, libraryId }); added++;
        } else {
          reviewNeeded++;
          // No receipt: uncertain or temporarily unavailable rows are retried during the next full scan.
        }
      }
      if (ops.length > 0) {
        // The library is not in Spotify's store, so the generation can't fence it in one transaction. Re-checking
        // here, after the slow Spotify and matching calls, leaves only this last round trip open to a disconnect.
        const live = await this.store.connection(userId);
        if (!live?.refreshToken || (live.generation ?? 0) !== generation) throw connectionChanged();
        const result = await this.auth.library.apply(userId, ops);
        if (result.rejected.length > 0) throw new SpotifyApiError(503, 'Allegra could not save this transfer step. Retry it safely.');
      }
      // Unsupported/local Spotify rows are absent from `tracks`; advance by API source rows.
      const finalOffset = offset + sourceCount;
      const complete = finalOffset >= page.total;
      const cumulativeAdded = added; const cumulativeSkipped = skipped; const cumulativeReview = reviewNeeded;
      const ack = await this.store.checkpoint(userId, playlistId, leaseToken, { receipts: receiptRows, offset: finalOffset, snapshotId: source.snapshotId, total: page.total, added: cumulativeAdded, skipped: cumulativeSkipped, reviewNeeded: cumulativeReview, complete, libraryId, ...(placed ? { orderAt: placed.end } : {}) }, generation);
      if (!ack) throw new SpotifyApiError(409, 'This transfer step expired. Retry it safely.');
      return { complete, added: cumulativeAdded, skipped: cumulativeSkipped, reviewNeeded: cumulativeReview, libraryId };
    } finally { await this.store.release(userId, playlistId, leaseToken); }
  }

  /**
   * One budgeted call of a daily run. The run is named by its start time; a playlist is marked with it once it
   * finishes or is skipped, so repeated calls walk every enabled playlist exactly once, least recently checked first.
   * `more` -> the scheduler calls again. Retryable failures (429, 5xx) and a lost connection (401) escape unmarked so
   * the scheduler's retry resumes the same playlist from its checkpoint; a playlist that cannot sync today is skipped.
   */
  public async dailyStep(userId: string, runStartedAt: number = startOfUtcDay(Date.now()), now: () => number = Date.now): Promise<{ more: boolean }> {
    const started = now();
    const connection = await this.store.connection(userId);
    if (!connection?.refreshToken) throw new SpotifyApiError(401, 'Reconnect your Spotify account to continue.');
    const generation = connection.generation ?? 0;
    const attempted = new Set<string>();
    // A playlist failing with a server error is deferred, not left in front: the others still run first.
    let deferred: unknown = null;
    for (;;) {
      const batch = (await this.store.dailyPlaylists(userId, runStartedAt, DAILY_PAGE)).filter(row => !attempted.has(row.playlistId));
      if (batch.length === 0) {
        // Only deferred playlists are left; the scheduler's retry (honouring Retry-After) tries them again.
        if (deferred) throw deferred;
        return { more: false };
      }
      for (const row of batch) {
        attempted.add(row.playlistId);
        let mark = runStartedAt;
        try {
          while (!(await this.sync(userId, row.playlistId, true, row)).complete) {
            if (now() - started > DAILY_BUDGET_MS) return { more: true };
          }
        } catch (error) {
          if (defersInRun(error)) {
            deferred ??= error;
            // Still before the run's start, so still due, but after every playlist this run has not tried yet.
            mark = runStartedAt - 1;
          } else if (!skipsForToday(error)) throw error;
        }
        if (!(await this.store.markDailyChecked(userId, row.playlistId, mark, generation))) throw connectionChanged();
        if (now() - started > DAILY_BUDGET_MS) return { more: true };
      }
    }
  }

  public async setDaily(userId: string, enabled: boolean): Promise<boolean> { return this.store.setDaily(userId, enabled); }
  public async disconnect(userId: string): Promise<void> { await this.store.disconnect(userId); }

  private requireProvider(): SpotifyProvider {
    if (!this.provider) throw new SpotifyApiError(503, 'Spotify connection is not configured.');
    return this.provider;
  }

  private async accessToken(userId: string): Promise<AccessGrant> {
    const pending = this.refreshes.get(userId); if (pending) return pending;
    const work = this.refreshAccessToken(userId); this.refreshes.set(userId, work);
    try { return await work; } finally { this.refreshes.delete(userId); }
  }

  private async refreshAccessToken(userId: string): Promise<AccessGrant> {
    const row = await this.store.connection(userId);
    if (!row?.refreshToken) throw new SpotifyApiError(401, 'Reconnect your Spotify account to continue.');
    const generation = row.generation ?? 0;
    const now = Date.now();
    if (row.accessToken && (row.accessExpiresAt ?? 0) > now + 60_000) return { token: row.accessToken, generation };
    const refreshed = await this.requireProvider().refresh(row.refreshToken);
    const saved = { ...row, refreshToken: refreshed.refreshToken ?? row.refreshToken, accessToken: refreshed.accessToken, accessExpiresAt: now + Math.max(30, refreshed.expiresIn) * 1000, updatedAt: now };
    // A refresh that started before a disconnect or reconnect must not overwrite the newer credential.
    if (!(await this.store.saveRefreshedConnection(saved, generation))) throw connectionChanged();
    return { token: refreshed.accessToken, generation };
  }
}

interface AccessGrant { token: string; generation: number }
const DAILY_PAGE = 5;

function connectionChanged(): SpotifyApiError { return new SpotifyApiError(401, 'Spotify connection changed. Reconnect to continue.'); }
/**
 * A transient conflict or server error on one playlist (Spotify 409/5xx, Allegra failing to save the step, an
 * unexpected throw) is retried later in the run. 429 is app-wide and 401 means the connection is gone: those stop
 * the account at once.
 */
function defersInRun(error: unknown): boolean {
  return error instanceof SpotifyApiError ? error.status === 409 || error.status >= 500 : true;
}
/** Failures specific to one playlist (invalid, forbidden, or gone) skip it for today. */
function skipsForToday(error: unknown): boolean {
  return error instanceof SpotifyApiError && (error.status === 400 || error.status === 403 || error.status === 404);
}
function startOfUtcDay(at: number): number { return at - (at % 86_400_000); }

/** The first library a Spotify playlist is transferred into. Library ids allow only [A-Za-z0-9_-] (parseLibraryOps). */
export function libraryIdFor(playlistId: string): string { return `spotify-${playlistId}`; }

/** The library after a deleted one: `spotify-<id>`, then `spotify-<id>-2`, `-3`... A deleted library keeps its rows. */
export function nextLibraryId(libraryId: string): string {
  const suffix = libraryId.match(/-(\d+)$/);
  return suffix ? `${libraryId.slice(0, suffix.index)}-${Number(suffix[1]) + 1}` : `${libraryId}-2`;
}

/**
 * Which library a playlist's songs go into. The one it last wrote to while that still exists. When the listener has
 * deleted it, the playlist is `removed` and goes into a new library: deleting leaves the old library's rows behind
 * (so reusing its id would bring back every old entry at its old place), and receipts for the old one say nothing
 * about the new one. A playlist that never wrote anything (its first step failed) keeps its library.
 */
export function libraryHome(
  playlistId: string,
  saved: Pick<StoredSpotifyPlaylist, 'libraryId' | 'lastSyncedAt' | 'offset'> | null | undefined,
  liveLibraryIds: ReadonlySet<string>
): { libraryId: string; removed: boolean } {
  const current = saved?.libraryId ?? libraryIdFor(playlistId);
  if (liveLibraryIds.has(current)) return { libraryId: current, removed: false };
  const wrote = saved !== null && saved !== undefined && (saved.lastSyncedAt !== undefined || saved.offset > 0);
  if (!wrote) return { libraryId: current, removed: false };
  // A step that wrote the next library and then failed to check in left it live: carry on into it.
  const next = nextLibraryId(current);
  return { libraryId: next, removed: !liveLibraryIds.has(next) };
}

/**
 * Orders a page of Spotify rows as Spotify lists them. A library orders its items by `at`, and Spotify's `added_at` is
 * not the playlist's order (a dragged song keeps its date) and repeats (a bulk add shares one). Each row gets its own
 * `added_at` or one millisecond more than the row before, whichever is later: dates stay true for ordinary playlists,
 * and an out-of-order row moves up just far enough to keep its place. `from` is the last value the previous page used.
 */
export function placeInOrder(tracks: readonly SpotifyTrack[], from: number): { at: Map<string, number>; end: number } {
  const at = new Map<string, number>();
  let last = from;
  for (const track of tracks) {
    last = Math.max(stableAddedAt(track.addedAt), last + 1);
    at.set(track.id, last);
  }
  return { at, end: last };
}

function publicPlaylist(row: StoredSpotifyPlaylist) {
  return { id: row.playlistId, name: row.name, libraryId: row.libraryId, lastSyncedAt: row.lastSyncedAt ?? null, added: row.added, skipped: row.skipped, reviewNeeded: row.reviewNeeded, syncing: (row.leaseUntil ?? 0) > Date.now() };
}
function toImportedTrack(track: SpotifyTrack) { return { title: track.title, artist: track.artist, ...(track.album ? { album: track.album } : {}), durationSec: track.durationSec }; }
function stableAddedAt(value: string): number { const parsed = Date.parse(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : 1; }
