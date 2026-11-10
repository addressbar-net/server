#!/bin/bash
# ==============================================================================
# setup_nginx_certbot.sh
# 
# Configures Nginx with the specified website name, creates the corresponding
# document root in /tmp/html/${website_name}, and runs Certbot for SSL.
#
# Can be executed standalone or invoked from install.sh.
# Usage: ./setup_nginx_certbot.sh [website_name]
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check for root privileges
if [ "$(id -u)" -ne 0 ]; then
    echo "Error: This script must be run as root." >&2
    exit 1
fi

WEBSITE_NAME="${1:-}"

# Allow interactive prompt if website name was not passed as an argument
if [ -z "$WEBSITE_NAME" ]; then
    echo "=========================================================="
    echo " Nginx & Certbot Configuration"
    echo "=========================================================="
    read -r -p "Enter website domain name (e.g., example.com): " WEBSITE_NAME
fi

# Sanitize domain name input
WEBSITE_NAME="$(echo "${WEBSITE_NAME}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's|^https\?://||' -e 's|/.*$||')"

if [ -z "$WEBSITE_NAME" ]; then
    echo "Error: No website name specified. Aborting setup." >&2
    exit 1
fi

echo "=========================================================="
echo "Configuring website: ${WEBSITE_NAME}"
echo "=========================================================="

# 1. Create document root structure in /tmp/html/${WEBSITE_NAME}
echo "[1/4] Creating document root in /tmp/html/${WEBSITE_NAME}..."
mkdir -p "/tmp/html/${WEBSITE_NAME}"
mkdir -p /tmp/log/nginx
chmod 755 /tmp/html "/tmp/html/${WEBSITE_NAME}" /tmp/log/nginx 2>/dev/null || true
chown -R www-data:www-data /tmp/html "/tmp/html/${WEBSITE_NAME}" /tmp/log/nginx 2>/dev/null || true

# Create a clean placeholder index.html if directory is empty
if [ -z "$(ls -A "/tmp/html/${WEBSITE_NAME}" 2>/dev/null)" ]; then
    cat <<EOF > "/tmp/html/${WEBSITE_NAME}/index.html"
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${WEBSITE_NAME}</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            background: #0f172a;
            color: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
        }
        .container {
            background: #1e293b;
            padding: 2.5rem 3rem;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.4);
            text-align: center;
        }
        h1 { color: #38bdf8; margin: 0 0 1rem; }
        p { color: #94a3b8; margin: 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${WEBSITE_NAME}</h1>
        <p>Server and Nginx are configured and active.</p>
    </div>
</body>
</html>
EOF
fi

# 2. Detect PHP version for fastcgi_pass socket
echo "[2/4] Detecting PHP-FPM version..."
PHP_VERSION=""
if [ -f "${SCRIPT_DIR}/php_version.txt" ]; then
    PHP_VERSION="$(cat "${SCRIPT_DIR}/php_version.txt" | tr -d '[:space:]')"
fi

if [ -z "${PHP_VERSION}" ]; then
    if command -v php >/dev/null 2>&1; then
        PHP_VERSION="$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null || true)"
    fi
fi

if [ -z "${PHP_VERSION}" ] && [ -d /etc/php ]; then
    PHP_VERSION="$(ls -1 /etc/php 2>/dev/null | sort -V | tail -n 1)"
fi

if [ -z "${PHP_VERSION}" ]; then
    PHP_VERSION="8.2"
fi
echo "Using PHP version: ${PHP_VERSION}"

# 3. Update Nginx configuration file (/etc/nginx/sites-available/default)
echo "[3/4] Updating /etc/nginx/sites-available/default..."
if [ -f /etc/nginx/sites-available/default ] && [ ! -f /etc/nginx/sites-available/default_0 ]; then
    cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default_0
    echo "Backed up original default file to /etc/nginx/sites-available/default_0"
fi

NGINX_CONF="/etc/nginx/sites-available/default"
cat <<EOF > "${NGINX_CONF}"
##
# Default server configuration for ${WEBSITE_NAME}
##

server {
	server_name ${WEBSITE_NAME};
	access_log /tmp/log/nginx/${WEBSITE_NAME}.log;
	etag on;
	add_header Cache-Control "no-cache";

	root /tmp/html/${WEBSITE_NAME};
	index index.php index.html;

	location / {
		try_files \$uri \$uri/ =404;
	}

	location ~ \.php\$ {
		include snippets/fastcgi-php.conf;

		# With php-fpm unix socket:
		fastcgi_pass unix:/run/php/php${PHP_VERSION}-fpm.sock;
	}

	# Protect sensitive files and hidden files
	location ~ /\. {
		deny all;
	}

	location ~* \.(sqlite|sql|db|conf|log)$ {
		deny all;
	}
}
EOF

# Update repository default file to mirror current configuration
cp "${NGINX_CONF}" "${SCRIPT_DIR}/default"

# Ensure site is enabled
mkdir -p /etc/nginx/sites-enabled
ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

# Test and reload Nginx
if nginx -t; then
    echo "Nginx configuration syntax is valid. Reloading Nginx..."
    systemctl reload nginx || systemctl restart nginx
else
    echo "Error: Nginx configuration test failed!" >&2
    exit 1
fi

# 4. Run Certbot for the specified website name
echo "[4/4] Running Certbot for ${WEBSITE_NAME}..."
CERTBOT_BIN=""
if command -v certbot >/dev/null 2>&1; then
    CERTBOT_BIN="certbot"
elif [ -x /snap/bin/certbot ]; then
    CERTBOT_BIN="/snap/bin/certbot"
fi

if [ -n "${CERTBOT_BIN}" ]; then
    "${CERTBOT_BIN}" --nginx -d "${WEBSITE_NAME}"
else
    echo "Notice: Certbot was not found in PATH or /snap/bin/certbot."
    echo "Install certbot and run: certbot --nginx -d ${WEBSITE_NAME}"
fi

echo "=========================================================="
echo "Nginx & Certbot setup complete for: ${WEBSITE_NAME}"
echo "Document root: /tmp/html/${WEBSITE_NAME}"
echo "Nginx default: /etc/nginx/sites-available/default"
echo "=========================================================="
