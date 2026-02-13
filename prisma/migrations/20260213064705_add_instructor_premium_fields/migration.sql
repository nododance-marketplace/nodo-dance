/*
  Warnings:

  - You are about to drop the column `youtubeVideoUrl` on the `InstructorProfile` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InstructorProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "photoUrl" TEXT,
    "styles" TEXT NOT NULL,
    "otherStyle" TEXT,
    "skillLevels" TEXT NOT NULL,
    "offerings" TEXT NOT NULL DEFAULT '[]',
    "languages" TEXT NOT NULL DEFAULT '[]',
    "yearsTeaching" INTEGER,
    "studentsTaught" INTEGER,
    "certifications" TEXT,
    "rating" REAL NOT NULL DEFAULT 4.9,
    "offersPrivate" BOOLEAN NOT NULL DEFAULT false,
    "privateRateHourly" INTEGER,
    "offersGroup" BOOLEAN NOT NULL DEFAULT false,
    "groupRatePerClass" INTEGER,
    "groupClassNotes" TEXT,
    "locationType" TEXT,
    "neighborhood" TEXT,
    "address" TEXT,
    "travelRadiusMiles" INTEGER,
    "paymentCash" BOOLEAN NOT NULL DEFAULT false,
    "paymentVenmo" TEXT,
    "paymentCashApp" TEXT,
    "paymentPayPal" TEXT,
    "instagramUrl" TEXT,
    "websiteUrl" TEXT,
    "bookingUrl" TEXT,
    "youtubeUrl" TEXT,
    "tiktokUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InstructorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_InstructorProfile" ("address", "bio", "bookingUrl", "createdAt", "displayName", "groupClassNotes", "groupRatePerClass", "headline", "id", "instagramUrl", "isPublished", "languages", "locationType", "neighborhood", "offerings", "offersGroup", "offersPrivate", "otherStyle", "paymentCash", "paymentCashApp", "paymentPayPal", "paymentVenmo", "photoUrl", "privateRateHourly", "skillLevels", "slug", "styles", "travelRadiusMiles", "updatedAt", "userId", "websiteUrl", "yearsTeaching") SELECT "address", "bio", "bookingUrl", "createdAt", "displayName", "groupClassNotes", "groupRatePerClass", "headline", "id", "instagramUrl", "isPublished", "languages", "locationType", "neighborhood", "offerings", "offersGroup", "offersPrivate", "otherStyle", "paymentCash", "paymentCashApp", "paymentPayPal", "paymentVenmo", "photoUrl", "privateRateHourly", "skillLevels", "slug", "styles", "travelRadiusMiles", "updatedAt", "userId", "websiteUrl", "yearsTeaching" FROM "InstructorProfile";
DROP TABLE "InstructorProfile";
ALTER TABLE "new_InstructorProfile" RENAME TO "InstructorProfile";
CREATE UNIQUE INDEX "InstructorProfile_userId_key" ON "InstructorProfile"("userId");
CREATE UNIQUE INDEX "InstructorProfile_slug_key" ON "InstructorProfile"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
