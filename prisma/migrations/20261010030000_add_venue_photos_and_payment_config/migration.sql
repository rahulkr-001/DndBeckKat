-- CreateTable
CREATE TABLE "VenuePhoto" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'cloudinary',
    "storageAssetId" TEXT,
    "title" TEXT,
    "caption" TEXT,
    "altText" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenuePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentConfig" (
    "id" TEXT NOT NULL,
    "gstEnabled" BOOLEAN NOT NULL DEFAULT true,
    "gstPercentage" DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    "gstTaxableBase" TEXT NOT NULL DEFAULT 'SUBTOTAL',
    "gstDisplayLabel" TEXT NOT NULL DEFAULT 'GST & Applicable Taxes (18%)',
    "platformFeeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "platformFeeType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "platformFeeValue" DECIMAL(10,2) NOT NULL DEFAULT 2.50,
    "platformFeePayer" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "taxApplicableOnPlatformFee" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VenuePhoto_venueId_idx" ON "VenuePhoto"("venueId");

-- CreateIndex
CREATE INDEX "VenuePhoto_isPublished_idx" ON "VenuePhoto"("isPublished");

-- CreateIndex
CREATE INDEX "VenuePhoto_orderIndex_idx" ON "VenuePhoto"("orderIndex");

-- CreateIndex
CREATE INDEX "PaymentConfig_updatedAt_idx" ON "PaymentConfig"("updatedAt");

-- AddForeignKey
ALTER TABLE "VenuePhoto" ADD CONSTRAINT "VenuePhoto_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
