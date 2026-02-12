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

# In order to support multiple git accounts with SSH, we copy the SSH
# configuration which points to your different keys. In order for the ssh-agent
# to choose the correct key for the host, your ssh config needs to point to a
# specific key for that host. Only the public key is required when using ssh-agent.
#
# Host github.com
#     Hostname github.com
#     IdentityFile ~/.ssh/id_rsa
#     IdentitiesOnly yes

# Host github.com-VaisalaCorp
#     Hostname github.com
#     IdentityFile ~/.ssh/id_rsa_vaisala
#     IdentitiesOnly yes
#
# Ensure your keys have the comment of which file they correspond to:
#    ssh-keygen -c -f ./id_rsa_vaisala -C "id_rsa_vaisala"
#
# This snippet will loop through your ssh-agent's keys and create public key
# files for them. This saves us from having to copy the actual private keys
# into the container, which is a security risk.
#
# See: https://vaisala.atlassian.net/wiki/spaces/CASD/pages/4088430999/Multiple+Git+Accounts+with+SSH+Guide#Option-1:-Use-different-ssh-host-aliases
mkdir -p "$HOME/.ssh"
cp -r /root/.ssh-tmp/config "$HOME/.ssh/config"

ssh-add -L | while IFS= read -r key; do
    echo "$key";
    keyfile="$HOME/.ssh/$(echo "$key" | awk '{print $3}' | sed 's/@/_/g').pub"
    echo "$key" > "$keyfile"
done

chmod 700 "$HOME/.ssh"
chmod 600 "$HOME/.ssh/"*
