-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('M3U', 'XTREAM');

-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('SERIES', 'ONCE', 'MANUAL');

-- CreateEnum
CREATE TYPE "NewOnlyMode" AS ENUM ('ALL', 'NEW_ONLY');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('SCHEDULED', 'RECORDING', 'POST_PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('RECORDING_STARTED', 'RECORDING_COMPLETED', 'RECORDING_FAILED', 'DISK_WARNING', 'SOURCE_SYNC_ERROR', 'SYSTEM');

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "m3uUrl" TEXT,
    "xcHost" TEXT,
    "xcUsername" TEXT,
    "xcPassword" TEXT,
    "epgUrl" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "syncError" TEXT,
    "refreshDaily" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelNumber" INTEGER,
    "groupTitle" TEXT,
    "streamUrl" TEXT NOT NULL,
    "streamType" TEXT NOT NULL DEFAULT 'hls',
    "tvgId" TEXT,
    "tvgName" TEXT,
    "tvgLogo" TEXT,
    "xcStreamId" INTEGER,
    "xcCategoryId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "category" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "season" INTEGER,
    "episode" INTEGER,
    "iconUrl" TEXT,
    "isNew" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordingRule" (
    "id" TEXT NOT NULL,
    "type" "RuleType" NOT NULL,
    "channelId" TEXT,
    "seriesTitle" TEXT,
    "programId" TEXT,
    "manualStart" TIMESTAMP(3),
    "manualEnd" TIMESTAMP(3),
    "newOnly" "NewOnlyMode" NOT NULL DEFAULT 'ALL',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "keepLast" INTEGER,
    "startEarly" INTEGER NOT NULL DEFAULT 0,
    "endLate" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recording" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT,
    "channelId" TEXT NOT NULL,
    "programId" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "season" INTEGER,
    "episode" INTEGER,
    "category" TEXT,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "filePath" TEXT,
    "livePath" TEXT,
    "fileSize" BIGINT,
    "duration" INTEGER,
    "comskipStatus" TEXT,
    "edlPath" TEXT,
    "tmdbId" INTEGER,
    "posterUrl" TEXT,
    "backdropUrl" TEXT,
    "sidecarPath" TEXT,
    "status" "RecordingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "errorMessage" TEXT,
    "ffmpegPid" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Channel_tvgId_idx" ON "Channel"("tvgId");

-- CreateIndex
CREATE INDEX "Channel_sourceId_idx" ON "Channel"("sourceId");

-- CreateIndex
CREATE INDEX "Channel_name_idx" ON "Channel"("name");

-- CreateIndex
CREATE INDEX "Program_channelId_startTime_idx" ON "Program"("channelId", "startTime");

-- CreateIndex
CREATE INDEX "Program_title_idx" ON "Program"("title");

-- CreateIndex
CREATE INDEX "Program_startTime_endTime_idx" ON "Program"("startTime", "endTime");

-- CreateIndex
CREATE UNIQUE INDEX "Program_channelId_startTime_key" ON "Program"("channelId", "startTime");

-- CreateIndex
CREATE INDEX "RecordingRule_seriesTitle_idx" ON "RecordingRule"("seriesTitle");

-- CreateIndex
CREATE INDEX "RecordingRule_type_idx" ON "RecordingRule"("type");

-- CreateIndex
CREATE INDEX "Recording_status_idx" ON "Recording"("status");

-- CreateIndex
CREATE INDEX "Recording_scheduledStart_idx" ON "Recording"("scheduledStart");

-- CreateIndex
CREATE INDEX "Recording_title_idx" ON "Recording"("title");

-- CreateIndex
CREATE INDEX "Recording_ruleId_idx" ON "Recording"("ruleId");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingRule" ADD CONSTRAINT "RecordingRule_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "RecordingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
