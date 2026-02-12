#!/bin/bash
#
# Academic Blockchain Network - Deep Clean Script
# Removes ALL containers, volumes, crypto material, and caches
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🧹 Deep cleaning Fabric network...${NC}"

# 1. Stop and remove Docker Compose services
echo -e "${GREEN}[1/8] Stopping Docker Compose services...${NC}"
docker compose -f docker-compose-network.yaml down --volumes --remove-orphans 2>/dev/null || true
docker compose -f docker-compose-ca.yaml down --volumes --remove-orphans 2>/dev/null || true

# 2. Force remove all Fabric-related containers
echo -e "${GREEN}[2/8] Removing all Fabric containers...${NC}"
docker rm -f $(docker ps -aq --filter "name=peer0" --filter "name=orderer" --filter "name=ca_" --filter "name=cli" --filter "name=dev-peer") 2>/dev/null || true

# Also remove by label
docker rm -f $(docker ps -aq --filter "label=service=hyperledger-fabric") 2>/dev/null || true

# 3. Remove chaincode containers and images
echo -e "${GREEN}[3/8] Removing chaincode containers and images...${NC}"
docker rm -f $(docker ps -aq --filter "name=dev-peer*") 2>/dev/null || true
docker rmi -f $(docker images "dev-peer*" -q) 2>/dev/null || true
docker rmi -f $(docker images "*academic-cc*" -q) 2>/dev/null || true

# 4. Remove Docker volumes
echo -e "${GREEN}[4/8] Removing Docker volumes...${NC}"
docker volume rm $(docker volume ls -q --filter "name=network-new" --filter "name=peer" --filter "name=orderer") 2>/dev/null || true
docker volume rm orderer.academic.edu peer0.school.academic.edu peer0.students.academic.edu 2>/dev/null || true

# 5. Remove generated crypto material
echo -e "${GREEN}[5/8] Removing crypto material...${NC}"
rm -rf organizations/peerOrganizations
rm -rf organizations/ordererOrganizations
rm -rf organizations/fabric-ca

# 6. Remove channel artifacts
echo -e "${GREEN}[6/8] Removing channel artifacts...${NC}"
rm -rf channel-artifacts/*
mkdir -p channel-artifacts

# 7. Remove chaincode artifacts
echo -e "${GREEN}[7/8] Removing chaincode build artifacts...${NC}"
rm -rf chaincode/academic-cc/node_modules
rm -rf chaincode/academic-cc/package-lock.json
rm -f academic-cc.tar.gz
rm -f *.tar.gz

# 8. Remove API wallet and connection profiles
echo -e "${GREEN}[8/8] Removing API wallet and connection profiles...${NC}"
rm -rf ../api/wallet
rm -rf ../api/config/wallet
rm -f ../api/config/connection-profile.json

# Also clean the main backend wallet if exists
rm -rf ../../backend/wallet

# Prune Docker system
echo -e "${YELLOW}Pruning Docker system (removing dangling images/volumes)...${NC}"
docker system prune -f --volumes 2>/dev/null || true

# Remove any stale Docker networks
echo -e "${GREEN}Removing stale Docker networks...${NC}"
docker network rm academic-network 2>/dev/null || true

echo ""
echo -e "${GREEN}✅ Deep clean completed successfully!${NC}"
echo ""
echo "Next steps:"
echo "  1. ./network.sh generate   # Generate fresh crypto material"
echo "  2. ./network.sh up         # Start the network"
echo "  3. ./network.sh createChannel"
echo "  4. ./network.sh deployCC"
echo ""
echo "Or run: ./network.sh all"
