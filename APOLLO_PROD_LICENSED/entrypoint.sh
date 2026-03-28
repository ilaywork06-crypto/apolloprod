#!/bin/sh
# Ensure community.json lives in the persistent volume
if [ ! -f /app/data/community.json ]; then
    echo '{"profiles": {}}' > /app/data/community.json
fi
# Symlink /app/community.json -> /app/data/community.json so the app writes there
rm -f /app/community.json
ln -s /app/data/community.json /app/community.json
exec python server.pyc
