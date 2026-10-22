# syntax=docker/dockerfile:1
# image หน้าเว็บทั้งสองฝั่ง (ไฟล์ static) เสิร์ฟด้วย nginx ในคอนเทนเนอร์
#   8081 = เว็บพนักงาน (staff-app) · 8082 = เว็บลูกค้า (client-app)
# ที่อยู่ API/โดเมนถูกฝังตอน build (Vite) — เปลี่ยนโดเมนต้อง build ใหม่

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY server/package.json server/
COPY staff-app/package.json staff-app/
COPY client-app/package.json client-app/
RUN npm ci --workspace packages/shared-types --workspace staff-app --workspace client-app --include-workspace-root

COPY packages/shared-types packages/shared-types
COPY staff-app staff-app
COPY client-app client-app

ARG API_BASE_URL
ARG CLIENT_BASE_URL
ARG TURNSTILE_SITE_KEY=""
# ไม่มี site key จริง = ไม่ตั้งตัวแปรเลย (ค่าว่างจะทำให้กล่อง Turnstile พัง — โค้ดถอยไปใช้คีย์ทดสอบเฉพาะตอนไม่มีตัวแปร)
RUN test -n "$API_BASE_URL" && test -n "$CLIENT_BASE_URL" \
 && export VITE_API_BASE_URL="$API_BASE_URL" VITE_SITE_URL="$CLIENT_BASE_URL" VITE_CLIENT_BASE_URL="$CLIENT_BASE_URL" \
 && if [ -n "$TURNSTILE_SITE_KEY" ]; then export VITE_TURNSTILE_SITE_KEY="$TURNSTILE_SITE_KEY"; fi \
 && npm run build -w packages/shared-types \
 && npm run build -w staff-app \
 && npm run build -w client-app

FROM nginx:1.27-alpine
COPY deploy/web-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/staff-app/dist /usr/share/nginx/staff
COPY --from=build /app/client-app/dist /usr/share/nginx/client
EXPOSE 8081 8082
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8082/ || exit 1
