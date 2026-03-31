-- Migration: stable_channel_identity
-- Adds unique constraints to Channel so channels can be upserted by stable
-- natural keys (xcStreamId for Xtream, tvgId for M3U) rather than deleted
-- and recreated with new UUIDs on every sync.

-- Some existing rows may have NULL xcStreamId / tvgId — partial unique indexes
-- using WHERE would be ideal, but Prisma's @@unique generates standard unique
-- indexes. We filter out NULLs at the application level, so NULL values will
-- never collide (PostgreSQL does not consider two NULLs as equal in a unique
-- constraint).

CREATE UNIQUE INDEX "Channel_sourceId_xcStreamId_key"
  ON "Channel"("sourceId", "xcStreamId")
  WHERE "xcStreamId" IS NOT NULL;

CREATE UNIQUE INDEX "Channel_sourceId_tvgId_key"
  ON "Channel"("sourceId", "tvgId")
  WHERE "tvgId" IS NOT NULL;
