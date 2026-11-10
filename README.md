# server

Automated Remote Server Provisioning Suite for Debian/Ubuntu (SQLite & Nginx Edition).

This repository contains the standalone, zero-database-daemon server installation suite hosted at `github.com/addressbar-net/server` (forwarded from `neolamia.com`).

It prepares a fresh remote server with Nginx, Certbot SSL, PHP-FPM, SQLite, crontab reboot persistence, and system utilities so that applications like [hotletter.band](https://hotletter.band) (the `contact` package) and other `addr.bar` services run seamlessly.

---

## 🚀 Quick Start with Git

Run the automated one-step installer on a fresh Debian/Ubuntu server:

```bash
# 1. Clone this repository
git clone https://github.com/addressbar-net/server.git
cd server

# 2. Run the installer (interactive or pass your domain directly)
sudo ./install.sh example.com
```

If run without arguments (`sudo ./install.sh`), the script prompts for an optional website domain name:
- If you enter a domain (e.g. `example.com`), it automatically creates the document root `/tmp/html/example.com`, configures Nginx, and runs Certbot for SSL.
- If left blank (press Enter), base packages, PHP-FPM runtime, crontab reboot jobs, and helper binaries are installed, allowing you to configure Nginx and SSL later using `./setup_nginx_certbot.sh <domain>`.

---

## 📦 What the Installer Does

1. **@reboot Crontab Persistence**: Registers `install_temporary_directories.sh` in root's crontab so `/tmp/html` and `/tmp/log/nginx` directories are reconstructed on system reboot.
2. **Helper CLI Binaries**: Copies administrative tools from `bin/` to `/usr/local/bin/` (`html_backup`, `initiate_remote_server`, `Tar`, `tmp_shed`).
3. **Core Dependencies**: Installs `nginx`, `snapd`, `curl`, `unzip`, `sqlite3`, `php-fpm`, `php-cli`, and `php-sqlite3` via `apt`.
4. **Zero MariaDB / MySQL Overhead**: Does not install MariaDB or MySQL; the stack uses direct-file SQLite storage.
5. **No Fail2ban Automation**: Automated fail2ban rules and jail configurations are excluded.
6. **Automated PHP Timezone Alignment (EDT)**:
   - Detects the active PHP version (e.g. 8.2, 8.4, 8.5) and writes `php_version.txt`.
   - Configures `date.timezone = America/New_York` across all CLI and FPM `php.ini` files.
   - Sets the host system timezone to `America/New_York`.
   - Starts and enables `php${PHP_VERSION}-fpm`.
7. **Temporary Directory Structure**: Prepares `/tmp/html` and `/tmp/log/nginx` with `755` permissions and `www-data:www-data` ownership.
8. **Automated Nginx Virtual Host & SSL** (when domain is provided):
   - Creates document root `/tmp/html/<website_name>`.
   - Writes `/etc/nginx/sites-available/default` configured with FastCGI PHP pass (`unix:/run/php/php<version>-fpm.sock`), prioritizing `index.php`, and blocking public access to SQLite database files.
   - Requests and binds a Let's Encrypt SSL certificate via `certbot --nginx -d <website_name>`.

---

## 🔗 Deploying with `hotletter.band` (Contact Package)

This package is designed to run first on a fresh server before installing the `hotletter.band` package (`contact`).

### Step 1: Provision the Server and Domain
```bash
# Clone and run the server installer:
git clone https://github.com/addressbar-net/server.git
cd server
sudo ./install.sh <your-domain.com>

# Return to parent directory to keep repositories side-by-side:
cd ..
```

### Step 2: Deploy the `hotletter.band` Package
```bash
# Clone contact into its own sibling directory:
git clone https://github.com/addressbar-net/contact.git
cd contact

# Interactive install:
sudo ./install.sh

# Or non-interactive one-liner targeting the configured web root:
sudo ./install.sh \
  -D <your-domain.com> \
  -d /tmp/html/<your-domain.com> \
  -m /var/lib/tricurse/contact \
  -p 'YourSecurePassword123' \
  -H -y
```

Because `server` has already installed PHP-FPM, SQLite3, Nginx, and SSL, `contact` detects the existing environment, installs its web assets, and goes live immediately.

---

## 🛠️ Included CLI Utilities (`bin/`)

The following helper scripts are automatically copied to `/usr/local/bin` during installation:

* **`Tar`**: Helper script to create (`Tar c <name>`) or extract (`Tar x <name>.tar`) tar archives while preserving file access times.
* **`html_backup`**: Creates an archive of `/tmp/html` and saves it to `/var/www/html/server_1.tar`.
* **`initiate_remote_server`**: Restores temporary directories and extracts `/var/www/html/server_1.tar` back into `/tmp/html`.
* **`tmp_shed`**: Copies web files from `/var/www/html/shed` to `/tmp/html/`.
* **`link_*`**: Helper symlink scripts (`link_global_index_tmp`, `link_dusky_ember_tmp`, `link_eternalcursive_tmp`).

---

## 📄 Documentation

* [PROCESS_GUIDE.md](PROCESS_GUIDE.md): In-depth breakdown of the installation logic, workflow diagram, and website variable options.
* `documents/install_this_first_and_then_hotletter.band.pdf`: Visual architecture guide.
