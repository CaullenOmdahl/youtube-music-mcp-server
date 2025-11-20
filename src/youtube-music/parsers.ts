import type { Song, Album, Artist, Playlist, SearchResponse, Thumbnail } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('youtube-music-parsers');

// Type for deeply nested YouTube Music API responses
type YTMResponse = Record<string, unknown>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Safely navigate nested object properties
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * Extract text from YouTube Music text runs
 */
function extractText(textObj: unknown): string {
  if (!textObj) return '';

  if (typeof textObj === 'string') return textObj;

  const runs = getNestedValue(textObj, 'runs') as unknown[] | undefined;
  if (Array.isArray(runs)) {
    return runs
      .map((run) => (run as { text?: string }).text ?? '')
      .join('');
  }

  return '';
}

/**
 * Parse thumbnails array
 */
function parseThumbnails(thumbnailData: unknown): Thumbnail[] {
  if (!thumbnailData) return [];

  const thumbs = getNestedValue(thumbnailData, 'thumbnails') as unknown[] | undefined;
  if (!Array.isArray(thumbs)) return [];

  return thumbs.map((t) => ({
    url: (t as { url?: string }).url ?? '',
    width: (t as { width?: number }).width ?? 0,
    height: (t as { height?: number }).height ?? 0,
  }));
}

/**
 * Parse duration string to seconds
 */
function parseDuration(durationStr: string): number {
  if (!durationStr) return 0;

  const parts = durationStr.split(':').map(Number);
  if (parts.length === 2) {
    return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  } else if (parts.length === 3) {
    return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  }

  return 0;
}

/**
 * Extract artists from flex columns or artist array
 */
function _parseArtists(data: unknown): { id?: string; name: string }[] {
  if (Array.isArray(data)) {
    return data.map((artist) => ({
      id: (artist as { id?: string }).id,
      name: (artist as { name?: string }).name ?? '',
    }));
  }

  // Try to extract from text runs
  const text = extractText(data);
  if (text) {
    return [{ name: text }];
  }

  return [];
}

// =============================================================================
// Search Results Parser
// =============================================================================

export function parseSearchResults(
  response: unknown,
  filter: string | undefined,
  limit: number
): SearchResponse {
  const result: SearchResponse = {
    metadata: {
      returned: 0,
      hasMore: false,
    },
  };

  try {
    // Navigate to search results
    const contents = getNestedValue(
      response,
      'contents.tabbedSearchResultsRenderer.tabs'
    ) as unknown[] | undefined;

    if (!Array.isArray(contents)) {
      return result;
    }

    // Find the selected tab
    const selectedTab = contents.find((tab) => {
      return getNestedValue(tab, 'tabRenderer.selected') === true;
    });

    const sectionList = getNestedValue(
      selectedTab,
      'tabRenderer.content.sectionListRenderer.contents'
    ) as unknown[] | undefined;

    if (!Array.isArray(sectionList)) {
      return result;
    }

    // Parse each section
    const songs: Song[] = [];
    const albums: (Album & { artists: { id?: string; name: string }[]; browseId: string })[] = [];
    const artists: (Artist & { browseId: string; thumbnails?: Thumbnail[] })[] = [];

    for (const section of sectionList) {
      const musicShelf = getNestedValue(section, 'musicShelfRenderer');
      if (!musicShelf) continue;

      const items = getNestedValue(musicShelf, 'contents') as unknown[] | undefined;
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        const musicData = getNestedValue(
          item,
          'musicResponsiveListItemRenderer'
        ) as YTMResponse | undefined;

        if (!musicData) continue;

        // Determine item type and parse accordingly
        const playlistItemData = musicData['playlistItemData'] as YTMResponse | undefined;
        const videoId = playlistItemData?.['videoId'] as string | undefined;

        if (videoId) {
          // This is a song
          const song = parseSongFromSearchResult(musicData, videoId);
          if (song) songs.push(song);
        } else {
          // Check for album or artist
          const browseEndpoint = getNestedValue(
            musicData,
            'navigationEndpoint.browseEndpoint'
          ) as YTMResponse | undefined;

          if (browseEndpoint) {
            const browseId = browseEndpoint['browseId'] as string;
            const pageType = getNestedValue(
              browseEndpoint,
              'browseEndpointContextSupportedConfigs.browseEndpointContextMusicConfig.pageType'
            ) as string | undefined;

            if (pageType === 'MUSIC_PAGE_TYPE_ALBUM') {
              const album = parseAlbumFromSearchResult(musicData, browseId);
              if (album) albums.push(album);
            } else if (pageType === 'MUSIC_PAGE_TYPE_ARTIST') {
              const artist = parseArtistFromSearchResult(musicData, browseId);
              if (artist) artists.push(artist);
            }
          }
        }
      }
    }

    // Build response based on filter
    if (!filter || filter === 'songs') {
      result.songs = songs.slice(0, limit);
    }
    if (!filter || filter === 'albums') {
      result.albums = albums.slice(0, limit);
    }
    if (!filter || filter === 'artists') {
      result.artists = artists.slice(0, limit);
    }

    result.metadata.returned =
      (result.songs?.length ?? 0) +
      (result.albums?.length ?? 0) +
      (result.artists?.length ?? 0);
    result.metadata.hasMore = songs.length > limit || albums.length > limit || artists.length > limit;

  } catch (error) {
    logger.error('Failed to parse search results', { error });
  }

  return result;
}

function parseSongFromSearchResult(data: YTMResponse, videoId: string): Song | null {
  try {
    const flexColumns = data['flexColumns'] as unknown[] | undefined;
    if (!Array.isArray(flexColumns) || flexColumns.length < 2) return null;

    // First column: title
    const titleRuns = getNestedValue(
      flexColumns[0],
      'musicResponsiveListItemFlexColumnRenderer.text.runs'
    ) as { text?: string }[] | undefined;
    const title = titleRuns?.[0]?.text ?? '';

    // Second column: artist - album
    const secondColumnRuns = getNestedValue(
      flexColumns[1],
      'musicResponsiveListItemFlexColumnRenderer.text.runs'
    ) as { text?: string; navigationEndpoint?: unknown }[] | undefined;

    const artists: { id?: string; name: string }[] = [];
    let albumName = '';
    let albumId = '';

    if (Array.isArray(secondColumnRuns)) {
      for (const run of secondColumnRuns) {
        const browseEndpoint = getNestedValue(
          run,
          'navigationEndpoint.browseEndpoint'
        ) as { browseId?: string; browseEndpointContextSupportedConfigs?: { browseEndpointContextMusicConfig?: { pageType?: string } } } | undefined;

        if (browseEndpoint) {
          const pageType = browseEndpoint.browseEndpointContextSupportedConfigs
            ?.browseEndpointContextMusicConfig?.pageType;

          if (pageType === 'MUSIC_PAGE_TYPE_ARTIST') {
            artists.push({
              id: browseEndpoint.browseId,
              name: run.text ?? '',
            });
          } else if (pageType === 'MUSIC_PAGE_TYPE_ALBUM') {
            albumName = run.text ?? '';
            albumId = browseEndpoint.browseId ?? '';
          }
        }
      }
    }

    // Get duration from fixed columns
    const fixedColumns = data['fixedColumns'] as unknown[] | undefined;
    let duration = '';
    if (Array.isArray(fixedColumns) && fixedColumns[0]) {
      duration = extractText(
        getNestedValue(
          fixedColumns[0],
          'musicResponsiveListItemFixedColumnRenderer.text'
        )
      );
    }

    return {
      videoId,
      title,
      artists: artists.length > 0 ? artists : [{ name: 'Unknown Artist' }],
      album: albumName ? { id: albumId, name: albumName } : undefined,
      duration,
      durationSeconds: parseDuration(duration),
      thumbnails: parseThumbnails(data['thumbnail']),
    };
  } catch (error) {
    logger.warn('Failed to parse song from search result', { error, videoId });
    return null;
  }
}

function parseAlbumFromSearchResult(
  data: YTMResponse,
  browseId: string
): (Album & { artists: { id?: string; name: string }[]; browseId: string }) | null {
  try {
    const flexColumns = data['flexColumns'] as unknown[] | undefined;
    if (!Array.isArray(flexColumns) || flexColumns.length < 2) return null;

    const title = extractText(
      getNestedValue(
        flexColumns[0],
        'musicResponsiveListItemFlexColumnRenderer.text'
      )
    );

    const secondColumnRuns = getNestedValue(
      flexColumns[1],
      'musicResponsiveListItemFlexColumnRenderer.text.runs'
    ) as { text?: string }[] | undefined;

    const artists: { id?: string; name: string }[] = [];
    let year: number | undefined;

    if (Array.isArray(secondColumnRuns)) {
      for (const run of secondColumnRuns) {
        const text = run.text ?? '';
        // Check if it's a year
        if (/^\d{4}$/.test(text)) {
          year = parseInt(text, 10);
        } else if (text && text !== ' • ' && text !== ', ') {
          artists.push({ name: text });
        }
      }
    }

    return {
      id: browseId,
      name: title,
      year,
      artists,
      browseId,
    };
  } catch (error) {
    logger.warn('Failed to parse album from search result', { error, browseId });
    return null;
  }
}

function parseArtistFromSearchResult(
  data: YTMResponse,
  browseId: string
): (Artist & { browseId: string; thumbnails?: Thumbnail[] }) | null {
  try {
    const flexColumns = data['flexColumns'] as unknown[] | undefined;
    if (!Array.isArray(flexColumns) || flexColumns.length < 1) return null;

    const name = extractText(
      getNestedValue(
        flexColumns[0],
        'musicResponsiveListItemFlexColumnRenderer.text'
      )
    );

    return {
      id: browseId,
      name,
      browseId,
      thumbnails: parseThumbnails(data['thumbnail']),
    };
  } catch (error) {
    logger.warn('Failed to parse artist from search result', { error, browseId });
    return null;
  }
}

// =============================================================================
// Playlist Parser
// =============================================================================

export function parsePlaylist(
  response: unknown,
  playlistId: string,
  limit: number
): Playlist {
  try {
    const header = getNestedValue(
      response,
      'header.musicDetailHeaderRenderer'
    ) as YTMResponse | undefined;

    const title = extractText(header?.['title']);
    const description = extractText(header?.['description']);

    // Get tracks from contents
    const contents = getNestedValue(
      response,
      'contents.singleColumnBrowseResultsRenderer.tabs.0.tabRenderer.content.sectionListRenderer.contents.0.musicPlaylistShelfRenderer.contents'
    ) as unknown[] | undefined;

    const tracks: Song[] = [];

    if (Array.isArray(contents)) {
      for (const item of contents) {
        const musicData = getNestedValue(
          item,
          'musicResponsiveListItemRenderer'
        ) as YTMResponse | undefined;

        if (!musicData) continue;

        const playlistItemData = musicData['playlistItemData'] as YTMResponse | undefined;
        const videoId = playlistItemData?.['videoId'] as string | undefined;

        if (videoId) {
          const song = parseSongFromSearchResult(musicData, videoId);
          if (song) tracks.push(song);
        }

        if (tracks.length >= limit) break;
      }
    }

    return {
      id: playlistId,
      title,
      description,
      trackCount: tracks.length,
      tracks,
      thumbnails: parseThumbnails(header?.['thumbnail']),
    };
  } catch (error) {
    logger.error('Failed to parse playlist', { error, playlistId });
    return {
      id: playlistId,
      title: 'Unknown Playlist',
      tracks: [],
    };
  }
}

// =============================================================================
// Song/Album/Artist Detail Parsers
// =============================================================================

export function parseSong(response: unknown, videoId: string): Song {
  try {
    const videoDetails = getNestedValue(
      response,
      'videoDetails'
    ) as YTMResponse | undefined;

    const title = (videoDetails?.['title'] as string) ?? '';
    const author = (videoDetails?.['author'] as string) ?? '';
    const lengthSeconds = parseInt(
      (videoDetails?.['lengthSeconds'] as string) ?? '0',
      10
    );

    // Extract album information from cards section
    const cards = getNestedValue(
      response,
      'cards.cardCollectionRenderer.cards'
    ) as unknown[] | undefined;

    let albumName: string | undefined;
    let albumYear: number | undefined;

    if (Array.isArray(cards)) {
      for (const card of cards) {
        const teaserMessage = getNestedValue(
          card,
          'cardRenderer.teaser.simpleCardTeaserRenderer.message'
        ) as YTMResponse | undefined;
        if (teaserMessage) {
          const albumText = extractText(teaserMessage);
          if (albumText) {
            albumName = albumText;
            // Try to extract year from album name (e.g., "Album Name (2021)")
            const yearMatch = albumText.match(/\((\d{4})\)/);
            if (yearMatch && yearMatch[1]) {
              albumYear = parseInt(yearMatch[1], 10);
            }
            break;
          }
        }
      }
    }

    return {
      videoId,
      title,
      artists: [{ name: author }],
      durationSeconds: lengthSeconds,
      duration: formatDuration(lengthSeconds),
      ...(albumName && {
        album: {
          name: albumName,
          ...(albumYear && { year: albumYear }),
        },
      }),
      thumbnails: parseThumbnails(videoDetails?.['thumbnail']),
    };
  } catch (error) {
    logger.error('Failed to parse song', { error, videoId });
    return {
      videoId,
      title: 'Unknown Song',
      artists: [{ name: 'Unknown Artist' }],
    };
  }
}

export function parseAlbum(
  response: unknown,
  browseId: string
): Album & { tracks: Song[] } {
  try {
    const header = getNestedValue(
      response,
      'header.musicDetailHeaderRenderer'
    ) as YTMResponse | undefined;

    const title = extractText(header?.['title']);

    // Extract year from subtitle
    const subtitle = extractText(header?.['subtitle']);
    const yearMatch = subtitle.match(/\d{4}/);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : undefined;

    // Get tracks
    const contents = getNestedValue(
      response,
      'contents.singleColumnBrowseResultsRenderer.tabs.0.tabRenderer.content.sectionListRenderer.contents.0.musicShelfRenderer.contents'
    ) as unknown[] | undefined;

    const tracks: Song[] = [];

    if (Array.isArray(contents)) {
      for (const item of contents) {
        const musicData = getNestedValue(
          item,
          'musicResponsiveListItemRenderer'
        ) as YTMResponse | undefined;

        if (!musicData) continue;

        const playlistItemData = musicData['playlistItemData'] as YTMResponse | undefined;
        const videoId = playlistItemData?.['videoId'] as string | undefined;

        if (videoId) {
          const song = parseSongFromSearchResult(musicData, videoId);
          if (song) tracks.push(song);
        }
      }
    }

    return {
      id: browseId,
      name: title,
      year,
      tracks,
    };
  } catch (error) {
    logger.error('Failed to parse album', { error, browseId });
    return {
      id: browseId,
      name: 'Unknown Album',
      tracks: [],
    };
  }
}

export function parseArtist(
  response: unknown,
  channelId: string
): Artist & { topSongs: Song[] } {
  try {
    const header = getNestedValue(
      response,
      'header.musicImmersiveHeaderRenderer'
    ) as YTMResponse | undefined;

    const name = extractText(header?.['title']);

    // Get top songs
    const contents = getNestedValue(
      response,
      'contents.singleColumnBrowseResultsRenderer.tabs.0.tabRenderer.content.sectionListRenderer.contents'
    ) as unknown[] | undefined;

    const topSongs: Song[] = [];

    if (Array.isArray(contents)) {
      for (const section of contents) {
        const shelf = getNestedValue(
          section,
          'musicShelfRenderer'
        ) as YTMResponse | undefined;

        if (!shelf) continue;

        const items = shelf['contents'] as unknown[] | undefined;
        if (!Array.isArray(items)) continue;

        for (const item of items) {
          const musicData = getNestedValue(
            item,
            'musicResponsiveListItemRenderer'
          ) as YTMResponse | undefined;

          if (!musicData) continue;

          const playlistItemData = musicData['playlistItemData'] as YTMResponse | undefined;
          const videoId = playlistItemData?.['videoId'] as string | undefined;

          if (videoId) {
            const song = parseSongFromSearchResult(musicData, videoId);
            if (song) topSongs.push(song);
          }
        }

        // Only get songs from first shelf (top songs)
        if (topSongs.length > 0) break;
      }
    }

    return {
      id: channelId,
      name,
      topSongs,
    };
  } catch (error) {
    logger.error('Failed to parse artist', { error, channelId });
    return {
      id: channelId,
      name: 'Unknown Artist',
      topSongs: [],
    };
  }
}

export function parseLibrarySongs(response: unknown, limit: number): Song[] {
  try {
    const contents = getNestedValue(
      response,
      'contents.singleColumnBrowseResultsRenderer.tabs.0.tabRenderer.content.sectionListRenderer.contents.0.musicShelfRenderer.contents'
    ) as unknown[] | undefined;

    const songs: Song[] = [];

    if (Array.isArray(contents)) {
      for (const item of contents) {
        const musicData = getNestedValue(
          item,
          'musicResponsiveListItemRenderer'
        ) as YTMResponse | undefined;

        if (!musicData) continue;

        const playlistItemData = musicData['playlistItemData'] as YTMResponse | undefined;
        const videoId = playlistItemData?.['videoId'] as string | undefined;

        if (videoId) {
          const song = parseSongFromSearchResult(musicData, videoId);
          if (song) songs.push(song);
        }

        if (songs.length >= limit) break;
      }
    }

    return songs;
  } catch (error) {
    logger.error('Failed to parse library songs', { error });
    return [];
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
