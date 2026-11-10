#!/bin/bash
# ==============================================================================
# install.sh - Remote Server Installation & Configuration
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Ensure script is executed with root privileges
if [ "$(id -u)" -ne 0 ]; then
    echo "Error: This script must be run as root." >&2
    exit 1
fi

echo "=========================================================="
echo " Remote Server Automated Installation"
echo "=========================================================="

# Allow user to specify a website name (via argument or prompt)
WEBSITE_NAME="${1:-}"
if [ -z "${WEBSITE_NAME}" ]; then
    echo ""
    echo "Website Configuration:"
    echo "  - If you enter a website name (e.g. example.com):"
    echo "      1. Directory /tmp/html/<website_name> will be created."
    echo "      2. Nginx default configuration will be updated."
    echo "      3. Certbot will be run for the specified website."
    echo "  - If left blank (press Enter):"
    echo "      1. Nginx default file will NOT be modified (can be updated manually)."
    echo "      2. Certbot will NOT be run."
    echo "      (Both can be run together later with ./setup_nginx_certbot.sh)"
    echo ""
    read -r -p "Enter website name (or press Enter to skip): " WEBSITE_NAME
fi

# Sanitize domain name input
WEBSITE_NAME="$(echo "${WEBSITE_NAME}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's|^https\?://||' -e 's|/.*$||')"

if [ -n "${WEBSITE_NAME}" ]; then
    echo "Website specified: ${WEBSITE_NAME}"
else
    echo "No website name specified. Nginx default config & Certbot will be skipped."
fi

# Step 1: Configure crontab for @reboot temporary directory initialization
echo ""
echo "[Step 1/6] Configuring @reboot cron job..."

# Ensure crontab command exists (install cron if missing)
if ! command -v crontab >/dev/null 2>&1; then
    echo "crontab command not found. Installing cron..."
    export DEBIAN_FRONTEND=noninteractive
    apt update -y && apt install -y cron
fi

CRON_JOB="@reboot ${SCRIPT_DIR}/install_temporary_directories.sh"
CURRENT_CRON="$(crontab -l 2>/dev/null || true)"

if echo "${CURRENT_CRON}" | grep -Fq "${SCRIPT_DIR}/install_temporary_directories.sh"; then
    echo "Reboot cron job is already configured."
else
    echo "Adding reboot cron job to crontab: ${CRON_JOB}"
    printf "%s\n%s\n" "${CURRENT_CRON}" "${CRON_JOB}" | sed '/^[[:space:]]*$/d' | crontab -
    echo "Cron job registered successfully."
fi
systemctl enable --now cron 2>/dev/null || true

# Step 2: Copy helper binaries to /usr/local/bin
echo ""
echo "[Step 2/6] Installing helper binaries to /usr/local/bin..."
mkdir -p /usr/local/bin
cp -p "${SCRIPT_DIR}"/bin/* /usr/local/bin/
chmod 755 /usr/local/bin/*
echo "Helper binaries installed and permissions set."

# Step 3: Update system packages and install core dependencies
echo ""
echo "[Step 3/6] Updating package index and installing Nginx, Snapd, PHP, SQLite..."
export DEBIAN_FRONTEND=noninteractive
apt update
apt upgrade -y
apt install -y nginx snapd cron curl unzip sqlite3 php-fpm php-cli php-sqlite3

# Step 4: Configure PHP runtime and timezone
echo ""
echo "[Step 4/6] Configuring PHP runtime and timezone..."

# Detect installed PHP version
PHP_VERSION=""
if command -v php >/dev/null 2>&1; then
    PHP_VERSION="$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null || true)"
fi

if [ -z "${PHP_VERSION}" ] && [ -d /etc/php ]; then
    PHP_VERSION="$(ls -1 /etc/php 2>/dev/null | sort -V | tail -n 1)"
fi

if [ -z "${PHP_VERSION}" ]; then
    echo "Warning: Could not detect PHP version. Defaulting to 8.2."
    PHP_VERSION="8.2"
fi

echo "Detected PHP version: ${PHP_VERSION}"
echo "${PHP_VERSION}" > "${SCRIPT_DIR}/php_version.txt"

# Enable and start PHP-FPM service
PHP_FPM_SERVICE="php${PHP_VERSION}-fpm"
echo "Enabling and starting ${PHP_FPM_SERVICE}..."
systemctl enable --now "${PHP_FPM_SERVICE}" || true

# Configure PHP date.timezone = America/New_York (EDT / Eastern Time)
# Proper IANA timezone name is "America/New_York" (with underscore, no spaces, no abbreviations)
TIMEZONE="America/New_York"
echo "Configuring PHP date.timezone = ${TIMEZONE} (EDT)..."

# Set system timezone
timedatectl set-timezone "${TIMEZONE}" 2>/dev/null || true

# Update all php.ini files found in /etc/php
INI_FILES=()
for f in "/etc/php/${PHP_VERSION}/fpm/php.ini" "/etc/php/${PHP_VERSION}/cli/php.ini"; do
    [ -f "$f" ] && INI_FILES+=("$f")
done

while IFS= read -r f; do
    if [ -f "$f" ]; then
        ALREADY_ADDED=false
        for existing in "${INI_FILES[@]}"; do
            [ "$existing" = "$f" ] && ALREADY_ADDED=true && break
        done
        [ "$ALREADY_ADDED" = false ] && INI_FILES+=("$f")
    fi
done < <(find /etc/php -name "php.ini" 2>/dev/null || true)

for ini_file in "${INI_FILES[@]}"; do
    if grep -qE "^[;]?[[:space:]]*date\.timezone[[:space:]]*=" "$ini_file"; then
        sed -i -E "s|^[;]?[[:space:]]*date\.timezone[[:space:]]*=.*|date.timezone = ${TIMEZONE}|" "$ini_file"
    else
        echo "date.timezone = ${TIMEZONE}" >> "$ini_file"
    fi
    echo "  Updated timezone in ${ini_file}"
done

# Restart PHP-FPM to apply timezone configuration
systemctl restart "${PHP_FPM_SERVICE}" || true

# Step 5: Initialize temporary directory structure
echo ""
echo "[Step 5/6] Initializing temporary directories..."
"${SCRIPT_DIR}/install_temporary_directories.sh" "${WEBSITE_NAME}"

# Step 6: Configure Snapd and install Certbot
echo ""
echo "[Step 6/6] Configuring Snapd and installing Certbot..."
systemctl enable --now snapd.apparmor snapd.socket || true
snap install --classic certbot || true
ln -sf /snap/bin/certbot /usr/bin/certbot || true

# Step 7: Conditional Nginx default site configuration and Certbot run
echo ""
echo "=========================================================="
if [ -n "${WEBSITE_NAME}" ]; then
    echo "Configuring Nginx default configuration and Certbot for: ${WEBSITE_NAME}"
    "${SCRIPT_DIR}/setup_nginx_certbot.sh" "${WEBSITE_NAME}"
else
    echo "Website name was NOT specified."
    echo " - Nginx default file (/etc/nginx/sites-available/default) was NOT modified."
    echo " - Certbot was NOT run."
    echo ""
    echo "You can manually configure /etc/nginx/sites-available/default,"
    echo "or run the connected setup at any time with:"
    echo "   ${SCRIPT_DIR}/setup_nginx_certbot.sh <website_name>"
fi

# Step 8: Create backup of /tmp/html for reboot restoration
echo ""
echo "=========================================================="
echo "Running html_backup to preserve /tmp/html to /var/www/html/server_1.tar..."
if [ -x /usr/local/bin/html_backup ]; then
    /usr/local/bin/html_backup
elif [ -x "${SCRIPT_DIR}/bin/html_backup" ]; then
    "${SCRIPT_DIR}/bin/html_backup"
else
    echo "Warning: html_backup script not found."
fi
echo "=========================================================="
echo "Installation complete!"
echo "=========================================================="
