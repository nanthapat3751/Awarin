# syntax=docker/dockerfile:1
# image ของ API (server) — ใช้ทั้งรันแอป และรัน migrate (deploy/migrate.sh) ด้วย image เดียวกัน
# build จากรากโปรเจกต์:  docker build -f deploy/api.Dockerfile -t systemboq-api .

FROM node:22-bookworm-slim

# Chromium สำหรับสร้าง PDF (Puppeteer) · ฟอนต์ไทยสำรอง · pg_dump รุ่น 17 ให้ตรงกับฐานข้อมูล (สำรองข้อมูลรายวัน)
# pg_dump ต้องไม่เก่ากว่าเซิร์ฟเวอร์ ไม่งั้นปฏิเสธการสำรอง — Debian มีแค่รุ่น 15 จึงดึงจาก apt.postgresql.org
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg chromium fonts-thai-tlwg fonts-noto-color-emoji \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-17 \
 && rm -rf /var/lib/apt/lists/*

# ใช้ Chromium ของระบบ ไม่ให้ puppeteer โหลด Chrome ของตัวเองตอน npm ci (ใหญ่และขาด library)
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# ติดตั้ง dependency ก่อนคัดลอกโค้ด — แก้โค้ดแล้ว build ใหม่จะไม่ต้องลงแพ็กเกจซ้ำ
# lockfile ของ workspace ต้องเห็น package.json ครบทุกตัว แม้จะลงแค่ server + shared-types
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY server/package.json server/
COPY staff-app/package.json staff-app/
COPY client-app/package.json client-app/
RUN npm ci --workspace server --workspace packages/shared-types --include-workspace-root

COPY packages/shared-types packages/shared-types
COPY server server
COPY deploy/migrate.sh deploy/migrate.sh

RUN npm run build -w packages/shared-types \
 && npx -w server prisma generate \
 && npm run build -w server

# โฟลเดอร์ข้อมูล (ผูกกับ volume) ต้องเป็นของ user node ก่อน — volume ใหม่จะได้สิทธิ์ตามนี้
RUN mkdir -p server/uploads server/private-uploads server/backups server/data/geoip \
 && chown -R node:node server/uploads server/private-uploads server/backups server/data

ARG APP_VERSION=dev
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION}

USER node
WORKDIR /app/server
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD curl -fsS http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "dist/server.js"]
