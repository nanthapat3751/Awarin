#!/bin/sh
# เริ่ม nginx ของ load balancer โดยแทนชื่อ api-host ด้วย IPv4 ของเครื่องแม่
#
# host-gateway ของ Docker Desktop ใส่ /etc/hosts ทั้ง IPv4 และ IPv6 ให้ชื่อเดียวกัน nginx จะนับเป็น
# คนละเครื่อง แล้วส่งงานไปที่ IPv6 ซึ่งในคอนเทนเนอร์ต่อไม่ได้ (ทดสอบแล้ว: 2 ใน 40 คำขอได้ 502)
set -eu
ip=$(awk '$2 == "api-host" && $1 !~ /:/ { print $1; exit }' /etc/hosts)
if [ -z "$ip" ]; then
  echo "lb: ไม่พบ IPv4 ของ api-host ใน /etc/hosts — ดู extra_hosts ใน docker-compose.yml" >&2
  exit 1
fi
sed "s/api-host:/$ip:/g" /etc/nginx/lb.conf.in > /etc/nginx/conf.d/default.conf
echo "lb: API อยู่ที่ $ip"
exec nginx -g "daemon off;"
