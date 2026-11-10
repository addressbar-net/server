#!/bin/bash
# ==============================================================================
# install_temporary_directories.sh
# 
# Prepares temporary directories in /tmp for Nginx serving and logs.
# Restores /tmp/html from /var/www/html/server_1.tar on reboot.
# Safe for both manual execution and non-interactive @reboot cron jobs.
# Usage: ./install_temporary_directories.sh [website_name]
# ==============================================================================

set -euo pipefail

WEBSITE_NAME="${1:-}"

# Create root web and log directories in /tmp
mkdir -p /tmp/html
mkdir -p /tmp/log/nginx

# Check for and unpack backup archive if it exists
ARCHIVE=""
for candidate in /var/www/html/server_1.tar /var/www/html/server_1_HTML.tar /var/www/html/html.tar; do
    if [ -f "$candidate" ]; then
        ARCHIVE="$candidate"
        break
    fi
done

if [ -n "$ARCHIVE" ]; then
    echo "Found ${ARCHIVE}. Restoring files to /tmp/html..."
    cp "$ARCHIVE" /tmp/restore_html.tar
    tar --overwrite -xpf /tmp/restore_html.tar -C /tmp
    rm -f /tmp/restore_html.tar
    echo "Successfully restored files to /tmp/html from ${ARCHIVE}"
else
    echo "Note: No backup archive found in /var/www/html (checked server_1.tar, server_1_HTML.tar, html.tar)."
fi

# If website name is provided, ensure its directory structure exists
if [ -n "${WEBSITE_NAME}" ]; then
    mkdir -p "/tmp/html/${WEBSITE_NAME}"
fi

# Set permissions
chmod 755 /tmp/html /tmp/log/nginx 2>/dev/null || true
if [ -n "${WEBSITE_NAME}" ]; then
    chmod 755 "/tmp/html/${WEBSITE_NAME}" 2>/dev/null || true
fi
chown -R www-data:www-data /tmp/html /tmp/log/nginx 2>/dev/null || true

# Interactive user prompt (only shown if connected to an interactive terminal, avoiding cron hang)
if [ -t 0 ]; then
    echo ""
    echo "Temporary directory setup complete in /tmp/html and /tmp/log/nginx."
    echo "Use FileZilla/SFTP to verify or remove any unwanted files from /tmp/html."
    echo ""
    read -r -p "Press [Enter] to continue..." _unused || true
fi
