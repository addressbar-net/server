#!/bin/bash
# ==============================================================================
# install_temporary_directories.sh
# 
# Prepares temporary directories in /tmp for Nginx serving and logs.
# Safe for both manual execution and non-interactive @reboot cron jobs.
# Usage: ./install_temporary_directories.sh [website_name]
# ==============================================================================

set -euo pipefail

WEBSITE_NAME="${1:-}"

# Create root web and log directories in /tmp
mkdir -p /tmp/html
mkdir -p /tmp/log/nginx
chmod 755 /tmp/html 2>/dev/null || true
chmod 755 /tmp/log/nginx 2>/dev/null || true
chown -R www-data:www-data /tmp/html /tmp/log/nginx 2>/dev/null || true

# If website name is provided, ensure its directory structure exists
if [ -n "${WEBSITE_NAME}" ]; then
    mkdir -p "/tmp/html/${WEBSITE_NAME}"
    chmod 755 "/tmp/html/${WEBSITE_NAME}" 2>/dev/null || true
    chown -R www-data:www-data "/tmp/html/${WEBSITE_NAME}" 2>/dev/null || true
fi

# Check for and unpack html.tar if it exists
if [ -f /var/www/html/html.tar ]; then
    echo "Found /var/www/html/html.tar. Copying and extracting to /tmp..."
    cp /var/www/html/html.tar /tmp/
    if command -v Tar >/dev/null 2>&1; then
        (cd /tmp && Tar x html.tar)
    else
        tar -xvpf /tmp/html.tar -C /tmp
    fi
else
    echo "Note: /var/www/html/html.tar not found. Skipping archive extraction."
fi

# Interactive user prompt (only shown if connected to a terminal, avoiding cron hang)
if [ -t 0 ]; then
    echo ""
    echo "Temporary directory setup complete in /tmp/html and /tmp/log/nginx."
    echo "Use FileZilla/SFTP to verify or remove any unwanted files from /tmp/html."
    echo ""
    read -r -p "Press [Enter] to continue..." _unused || true
fi
