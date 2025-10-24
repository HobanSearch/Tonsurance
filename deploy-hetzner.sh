#!/bin/bash
# Tonsurance Hetzner Deployment Script
# Run this script on your Hetzner server as root or with sudo

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Tonsurance Hetzner Deployment Script${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root or with sudo${NC}"
    exit 1
fi

# Configuration
APP_DIR="/opt/tonsurance"
APP_USER="tonsurance"
DOMAIN="tonsurance.com"

echo -e "\n${YELLOW}Step 1: Updating system packages...${NC}"
apt update && apt upgrade -y

echo -e "\n${YELLOW}Step 2: Installing required packages...${NC}"
apt install -y \
    curl \
    wget \
    git \
    ufw \
    nginx \
    certbot \
    python3-certbot-nginx \
    htop \
    net-tools

echo -e "\n${YELLOW}Step 3: Installing Docker...${NC}"
if ! command -v docker &> /dev/null; then
    # Add Docker's official GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

    # Set up the stable repository
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Install Docker Engine
    apt update
    apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Start and enable Docker
    systemctl start docker
    systemctl enable docker

    echo -e "${GREEN}Docker installed successfully${NC}"
else
    echo -e "${GREEN}Docker already installed${NC}"
fi

echo -e "\n${YELLOW}Step 4: Creating application user...${NC}"
if ! id "$APP_USER" &>/dev/null; then
    useradd -r -m -s /bin/bash $APP_USER
    usermod -aG docker $APP_USER
    echo -e "${GREEN}User $APP_USER created and added to docker group${NC}"
else
    echo -e "${GREEN}User $APP_USER already exists${NC}"
fi

echo -e "\n${YELLOW}Step 5: Setting up application directory...${NC}"
mkdir -p $APP_DIR
cd $APP_DIR

# Check if this is initial deployment or update
if [ -d "$APP_DIR/.git" ]; then
    echo -e "${YELLOW}Updating existing repository...${NC}"
    sudo -u $APP_USER git pull
else
    echo -e "${YELLOW}Please enter your GitHub repository URL:${NC}"
    read REPO_URL
    sudo -u $APP_USER git clone $REPO_URL .
fi

echo -e "\n${YELLOW}Step 6: Setting up environment files...${NC}"
if [ ! -f ".env.production" ]; then
    echo -e "${RED}ERROR: .env.production not found!${NC}"
    echo -e "${YELLOW}Please copy .env.production from your local machine to $APP_DIR/.env.production${NC}"
    echo -e "${YELLOW}You can use: scp .env.production root@your-server:$APP_DIR/.env.production${NC}"
    exit 1
else
    # Create symlink for docker-compose
    ln -sf .env.production .env
    chown $APP_USER:$APP_USER .env.production .env
    chmod 600 .env.production .env
    echo -e "${GREEN}.env.production found and linked${NC}"
fi

echo -e "\n${YELLOW}Step 7: Configuring firewall...${NC}"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable
echo -e "${GREEN}Firewall configured${NC}"

echo -e "\n${YELLOW}Step 8: Installing Nginx configuration...${NC}"
if [ -f "nginx.conf" ]; then
    cp nginx.conf /etc/nginx/nginx.conf
    nginx -t  # Test configuration
    systemctl restart nginx
    systemctl enable nginx
    echo -e "${GREEN}Nginx configured and started${NC}"
else
    echo -e "${RED}WARNING: nginx.conf not found in repository${NC}"
    echo -e "${YELLOW}Please manually configure Nginx later${NC}"
fi

echo -e "\n${YELLOW}Step 9: Building Docker images...${NC}"
sudo -u $APP_USER docker compose build

echo -e "\n${YELLOW}Step 10: Creating systemd service...${NC}"
cat > /etc/systemd/system/tonsurance.service <<EOF
[Unit]
Description=Tonsurance Insurance Platform
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
User=$APP_USER
Group=$APP_USER

# Start services
ExecStart=/usr/bin/docker compose up -d

# Stop services
ExecStop=/usr/bin/docker compose down

# Restart services
ExecReload=/usr/bin/docker compose restart

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable service
systemctl daemon-reload
systemctl enable tonsurance.service

echo -e "\n${YELLOW}Step 11: Starting services...${NC}"
systemctl start tonsurance.service

# Wait for services to start
echo -e "${YELLOW}Waiting for services to start...${NC}"
sleep 10

echo -e "\n${YELLOW}Step 12: Running database migrations...${NC}"
docker compose exec -T api /app/bin/migrate.sh || echo -e "${YELLOW}Migration script not found or failed - run manually if needed${NC}"

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

# Show service status
echo -e "\n${YELLOW}Service Status:${NC}"
docker compose ps

# Show logs
echo -e "\n${YELLOW}Recent logs:${NC}"
docker compose logs --tail=20

echo -e "\n${GREEN}Next Steps:${NC}"
echo -e "1. Configure Cloudflare DNS to point to this server's IP"
echo -e "2. Set up SSL/TLS in Cloudflare (Full/Strict mode)"
echo -e "3. Update .env.production with your API keys and contract addresses"
echo -e "4. Deploy TON smart contracts and update addresses in .env"
echo -e "5. Configure Telegram bot webhook"
echo -e ""
echo -e "${YELLOW}Useful Commands:${NC}"
echo -e "  View logs:        docker compose logs -f"
echo -e "  Restart services: systemctl restart tonsurance"
echo -e "  Stop services:    systemctl stop tonsurance"
echo -e "  Service status:   docker compose ps"
echo -e "  Nginx status:     systemctl status nginx"
echo -e "  Firewall status:  ufw status"
echo -e ""
echo -e "${GREEN}Your Tonsurance platform is now running!${NC}"
echo -e "${YELLOW}Server IP: $(curl -s ifconfig.me)${NC}"
