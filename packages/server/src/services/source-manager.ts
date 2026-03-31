import axios from 'axios';
import { db } from '../db.js';
import { logger } from '../logger.js';
import { parseM3u } from './m3u-parser.js';
import { XtreamClient, tryXtreamCall } from './xtream-client.js';
import { epgManager } from './epg-manager.js';
import type { Source } from '@prisma/client';

/**
 * SourceManager handles fetching M3U playlists and Xtream Codes sources,
 * parsing them, and upserting channels into the database.
 *
 * IMPORTANT: Channels are upserted (not deleted+recreated) to preserve their
 * UUIDs across syncs. UUID stability is critical because:
 *   - Program rows reference Channel.id (FK with CASCADE DELETE)
 *   - RecordingRule.channelId references Channel.id
 *   - Recording.channelId references Channel.id
 * Deleting and recreating channels would invalidate all of these on every sync.
 *
 * Xtream upsert key: (sourceId, xcStreamId)
 * M3U upsert key:   (sourceId, tvgId) when tvgId is present, otherwise
 *                   we fall back to matching by (sourceId, name).
 */

/**
 * Fetch an M3U playlist from a URL and return the raw content.
 */
async function fetchM3uContent(url: string): Promise<string> {
  const response = await axios.get<string>(url, {
    timeout: 60_000,
    responseType: 'text',
    maxContentLength: 100 * 1024 * 1024, // 100MB max
    headers: {
      'User-Agent': 'AnywhereDVR/0.1',
    },
  });
  return response.data;
}

/**
 * Sync an M3U source: fetch playlist, parse channels, upsert to database.
 * Channels are matched by tvgId (preferred) or name to preserve UUIDs.
 */
async function syncM3uSource(source: Source): Promise<{ channelCount: number }> {
  if (!source.m3uUrl) {
    throw new Error(`Source "${source.name}" has no M3U URL`);
  }

  logger.info({ sourceId: source.id, name: source.name }, 'Syncing M3U source');

  // Fetch and parse
  const content = await fetchM3uContent(source.m3uUrl);
  const parsed = parseM3u(content);

  // If EPG URL was found in the M3U header and source doesn't have one set, store it
  if (parsed.epgUrl && !source.epgUrl) {
    await db.source.update({
      where: { id: source.id },
      data: { epgUrl: parsed.epgUrl },
    });
  }

  // Re-fetch source to get current disabledGroups (may have been updated since passed in)
  const freshSource = await db.source.findUnique({ where: { id: source.id } });
  const disabledGroups = (freshSource as unknown as { disabledGroups?: string[] })?.disabledGroups ?? [];

  // Load all existing channels for this source to build match maps
  const existing = await db.channel.findMany({ where: { sourceId: source.id } });
  const byTvgId = new Map(existing.filter(c => c.tvgId).map(c => [c.tvgId!, c.id]));
  const byName  = new Map(existing.map(c => [c.name, c.id]));
  const seenIds = new Set<string>();

  for (const ch of parsed.channels) {
    const isDisabled = disabledGroups.includes(ch.groupTitle ?? '');

    // Find the stable DB id for this channel
    let existingId = ch.tvgId ? byTvgId.get(ch.tvgId) : undefined;
    if (!existingId) existingId = byName.get(ch.name);

    if (existingId) {
      // Update in-place — preserves UUID
      await db.channel.update({
        where: { id: existingId },
        data: {
          name:          ch.name,
          streamUrl:     ch.streamUrl,
          streamType:    ch.streamType,
          tvgId:         ch.tvgId ?? null,
          tvgName:       ch.tvgName ?? null,
          tvgLogo:       ch.tvgLogo ?? null,
          groupTitle:    ch.groupTitle ?? null,
          channelNumber: ch.channelNumber ?? null,
          isActive:      !isDisabled,
        },
      });
      seenIds.add(existingId);
    } else {
      // New channel — create
      const created = await db.channel.create({
        data: {
          sourceId:      source.id,
          name:          ch.name,
          streamUrl:     ch.streamUrl,
          streamType:    ch.streamType,
          tvgId:         ch.tvgId ?? null,
          tvgName:       ch.tvgName ?? null,
          tvgLogo:       ch.tvgLogo ?? null,
          groupTitle:    ch.groupTitle ?? null,
          channelNumber: ch.channelNumber ?? null,
          isActive:      !isDisabled,
        },
      });
      seenIds.add(created.id);
    }
  }

  // Deactivate channels no longer in the playlist (don't delete — keep recordings)
  const removedIds = existing.map(c => c.id).filter(id => !seenIds.has(id));
  if (removedIds.length > 0) {
    await db.channel.updateMany({
      where: { id: { in: removedIds } },
      data: { isActive: false },
    });
    logger.info({ sourceId: source.id, count: removedIds.length }, 'Deactivated removed M3U channels');
  }

  const channelCount = parsed.channels.length;

  // Update sync timestamp
  await db.source.update({
    where: { id: source.id },
    data: {
      lastSyncAt: new Date(),
      syncError: null,
    },
  });

  logger.info(
    { sourceId: source.id, channelCount },
    'M3U source synced successfully',
  );

  // Refresh EPG immediately after channel sync when an EPG URL is available.
  try {
    await epgManager.refreshSource(source.id);
  } catch (epgErr) {
    logger.warn({ sourceId: source.id, err: epgErr }, 'M3U source synced but EPG refresh failed');
  }

  return { channelCount };
}

/**
 * Sync an Xtream Codes source: fetch categories + streams via XC API,
 * upsert channels by xcStreamId to preserve UUIDs, store XMLTV URL.
 */
async function syncXtreamSource(source: Source): Promise<{ channelCount: number }> {
  if (!source.xcHost || !source.xcUsername || !source.xcPassword) {
    throw new Error(`Source "${source.name}" is missing Xtream Codes credentials`);
  }

  logger.info({ sourceId: source.id, name: source.name }, 'Syncing Xtream Codes source');

  const client = new XtreamClient({
    host: source.xcHost,
    username: source.xcUsername,
    password: source.xcPassword,
  });

  // Validate credentials + get server info
  const serverInfo = await tryXtreamCall('getServerInfo', () => client.getServerInfo());
  if (!serverInfo) {
    throw new Error('Failed to connect to Xtream Codes server — check credentials and host');
  }

  logger.info(
    { sourceId: source.id, status: serverInfo.userInfo.status, maxConnections: serverInfo.userInfo.maxConnections },
    'Xtream Codes server info fetched',
  );

  // Fetch categories (for group title mapping)
  const categories = await tryXtreamCall('getCategories', () => client.getCategories()) ?? [];
  const categoryMap = new Map(categories.map((c) => [c.categoryId, c.categoryName]));

  // Fetch all live streams
  const streams = await tryXtreamCall('getLiveStreams', () => client.getLiveStreams());
  if (!streams || streams.length === 0) {
    logger.warn({ sourceId: source.id }, 'No live streams returned from Xtream Codes');
  }

  // Store XMLTV URL as epgUrl so EpgManager can fetch EPG
  const xmltvUrl = client.getXmltvUrl();

  // Re-fetch source to get current disabledGroups
  const freshSourceXc = await db.source.findUnique({ where: { id: source.id } });
  const disabledGroupsXc = (freshSourceXc as unknown as { disabledGroups?: string[] })?.disabledGroups ?? [];

  // Load all existing channels for this source, keyed by xcStreamId
  const existing = await db.channel.findMany({ where: { sourceId: source.id } });
  const byXcStreamId = new Map(existing.filter(c => c.xcStreamId != null).map(c => [c.xcStreamId!, c.id]));
  const seenIds = new Set<string>();

  for (const stream of (streams ?? [])) {
    const groupTitle  = stream.categoryId ? (categoryMap.get(stream.categoryId) ?? null) : null;
    const isDisabled  = disabledGroupsXc.includes(groupTitle ?? '');

    const channelData = {
      name:          stream.name,
      streamUrl:     client.buildStreamUrl(stream.streamId, 'm3u8'),
      streamType:    'HLS' as const,
      tvgId:         stream.epgChannelId ?? null,
      tvgName:       stream.name,
      tvgLogo:       stream.streamIcon ?? null,
      groupTitle,
      channelNumber: stream.num > 0 ? stream.num : null,
      xcStreamId:    stream.streamId,
      xcCategoryId:  stream.categoryId ? parseInt(stream.categoryId, 10) : null,
      isActive:      !isDisabled,
    };

    const existingId = byXcStreamId.get(stream.streamId);
    if (existingId) {
      // Update in-place — preserves UUID
      await db.channel.update({
        where: { id: existingId },
        data: channelData,
      });
      seenIds.add(existingId);
    } else {
      // New channel — create
      const created = await db.channel.create({
        data: { sourceId: source.id, ...channelData },
      });
      seenIds.add(created.id);
    }
  }

  // Deactivate channels no longer returned by the provider (don't delete)
  const removedIds = existing.map(c => c.id).filter(id => !seenIds.has(id));
  if (removedIds.length > 0) {
    await db.channel.updateMany({
      where: { id: { in: removedIds } },
      data: { isActive: false },
    });
    logger.info({ sourceId: source.id, count: removedIds.length }, 'Deactivated removed Xtream channels');
  }

  const channelCount = (streams ?? []).length;

  // Update source with XMLTV URL + sync timestamp
  await db.source.update({
    where: { id: source.id },
    data: {
      epgUrl: source.epgUrl ?? xmltvUrl, // don't overwrite if user set a custom EPG URL
      lastSyncAt: new Date(),
      syncError: null,
    },
  });

  logger.info(
    { sourceId: source.id, channelCount, xmltvUrl },
    'Xtream Codes source synced successfully',
  );

  // Refresh EPG immediately after channel sync.
  try {
    await epgManager.refreshSource(source.id);
  } catch (epgErr) {
    logger.warn({ sourceId: source.id, err: epgErr }, 'Xtream source synced but EPG refresh failed');
  }

  return { channelCount };
}

/**
 * Sync a source based on its type (M3U or Xtream Codes).
 */
export async function syncSource(
  sourceId: string,
): Promise<{ channelCount: number }> {
  const source = await db.source.findUnique({ where: { id: sourceId } });
  if (!source) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  try {
    switch (source.type) {
      case 'M3U':
        return await syncM3uSource(source);
      case 'XTREAM':
        return await syncXtreamSource(source);
      default:
        throw new Error(`Unknown source type: ${source.type}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown sync error';
    logger.error({ sourceId, err }, 'Source sync failed');

    // Store error on source
    await db.source.update({
      where: { id: source.id },
      data: { syncError: message },
    });

    throw err;
  }
}
