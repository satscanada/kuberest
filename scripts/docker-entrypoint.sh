#!/bin/sh
set -e

if [ -f /kube/config ]; then
  sed \
    -e 's|https://127.0.0.1:|https://desktop-control-plane:|g' \
    -e 's|https://localhost:|https://desktop-control-plane:|g' \
    /kube/config > /tmp/kube-config
  chmod 600 /tmp/kube-config
  export KUBECONFIG=/tmp/kube-config
fi

exec node src/server.js
