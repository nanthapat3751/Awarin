-- CreateTable
CREATE TABLE "AccountAccessToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountAccessToken_tokenHash_key" ON "AccountAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountAccessToken_userId_idx" ON "AccountAccessToken"("userId");

-- AddForeignKey
ALTER TABLE "AccountAccessToken" ADD CONSTRAINT "AccountAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAccessToken" ADD CONSTRAINT "AccountAccessToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
