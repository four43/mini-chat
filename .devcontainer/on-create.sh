#!/bin/bash
set -e

# Fix permissions issue when trying to update
chmod 1777 /tmp
apt update
apt install -y \
    git \
    git-lfs \
    fzf \
    jq \
    vim
