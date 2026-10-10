ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "whatsappEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "whatsappGroupDesc" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "whatsappGroupTitle" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "whatsappGroupUrl" TEXT;

CREATE TABLE IF NOT EXISTS "EventStory" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "badge" TEXT,
    "heading" TEXT NOT NULL,
    "story" TEXT NOT NULL,
    "highlightOne" TEXT,
    "highlightTwo" TEXT,
    "imageOneUrl" TEXT,
    "imageTwoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventStory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventHighlight" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "iconName" TEXT NOT NULL DEFAULT 'Sparkles',
    "badge" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventHighlight_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventSchedule" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventTestimonial" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT,
    "ticketId" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "quote" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 5,
    "avatarUrl" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "moderationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventTestimonial_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TeamMember" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "bio" TEXT,
    "imageUrl" TEXT,
    "socialLinks" JSONB,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Sponsor" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'POWERED_BY',
    "logoUrl" TEXT,
    "websiteUrl" TEXT,
    "description" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "socialLinks" JSONB,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Sponsor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventVideo" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "videoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventVideo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventStory_eventId_key" ON "EventStory"("eventId");
CREATE INDEX IF NOT EXISTS "EventHighlight_eventId_orderIndex_idx" ON "EventHighlight"("eventId", "orderIndex");
CREATE INDEX IF NOT EXISTS "EventSchedule_eventId_orderIndex_idx" ON "EventSchedule"("eventId", "orderIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "EventTestimonial_ticketId_key" ON "EventTestimonial"("ticketId");
CREATE INDEX IF NOT EXISTS "EventTestimonial_eventId_isPublished_orderIndex_idx" ON "EventTestimonial"("eventId", "isPublished", "orderIndex");
CREATE INDEX IF NOT EXISTS "EventTestimonial_userId_idx" ON "EventTestimonial"("userId");
CREATE INDEX IF NOT EXISTS "TeamMember_eventId_orderIndex_idx" ON "TeamMember"("eventId", "orderIndex");
CREATE INDEX IF NOT EXISTS "Sponsor_eventId_orderIndex_idx" ON "Sponsor"("eventId", "orderIndex");
CREATE INDEX IF NOT EXISTS "EventVideo_eventId_orderIndex_idx" ON "EventVideo"("eventId", "orderIndex");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventStory_eventId_fkey') THEN
        ALTER TABLE "EventStory" ADD CONSTRAINT "EventStory_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventHighlight_eventId_fkey') THEN
        ALTER TABLE "EventHighlight" ADD CONSTRAINT "EventHighlight_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventSchedule_eventId_fkey') THEN
        ALTER TABLE "EventSchedule" ADD CONSTRAINT "EventSchedule_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventTestimonial_eventId_fkey') THEN
        ALTER TABLE "EventTestimonial" ADD CONSTRAINT "EventTestimonial_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventTestimonial_userId_fkey') THEN
        ALTER TABLE "EventTestimonial" ADD CONSTRAINT "EventTestimonial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventTestimonial_ticketId_fkey') THEN
        ALTER TABLE "EventTestimonial" ADD CONSTRAINT "EventTestimonial_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeamMember_eventId_fkey') THEN
        ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Sponsor_eventId_fkey') THEN
        ALTER TABLE "Sponsor" ADD CONSTRAINT "Sponsor_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventVideo_eventId_fkey') THEN
        ALTER TABLE "EventVideo" ADD CONSTRAINT "EventVideo_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
