#!/bin/sh
cd /workspace
if curl -sf -o /dev/null --max-time 1 http://127.0.0.1:8080/; then
  exit 0
fi
RESEARCH_PRODUCTION_BONUSES_ENABLED=true npm run dev > /tmp/wwc-dev.log 2>&1 &
exit 0
