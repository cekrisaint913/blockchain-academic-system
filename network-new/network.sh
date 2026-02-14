#!/bin/bash
#
# Academic Blockchain Network - Management Script
# Organizations: SchoolOrg + StudentsOrg
# Channel: academic-channel
# Chaincode: academic-cc
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

CHANNEL_NAME="academic-channel"
CHAINCODE_NAME="academic-cc"
CHAINCODE_VERSION="1.0"
CHAINCODE_SEQUENCE="1"
CC_SRC_PATH="./chaincode/academic-cc"

# Print colored message

function create_network() {
    echo "Creating Docker network..."

    # Supprimer le réseau existant s'il existe
    docker network rm academic-network 2>/dev/null || true
    
    # Créer le réseau
    docker network create academic-network --label 'com.docker.compose.network=academic'
    
    echo "✅ Network academic-network created"
}


function printMessage() {
    echo -e "${GREEN}${1}${NC}"
}

function printError() {
    echo -e "${RED}${1}${NC}"
}

function printWarning() {
    echo -e "${YELLOW}${1}${NC}"
}

# Generate crypto material using cryptogen
function generateCrypto() {
    printMessage "📜 Generating crypto material..."

    which cryptogen
    if [ "$?" -ne 0 ]; then
        printError "cryptogen tool not found. Exiting"
        exit 1
    fi

    if [ -d "organizations/peerOrganizations" ]; then
        rm -rf organizations/peerOrganizations && rm -rf organizations/ordererOrganizations
    fi

    cryptogen generate --config=./crypto-config.yaml --output="organizations"

    if [ "$?" -ne 0 ]; then
        printError "Failed to generate crypto material..."
        exit 1
    fi
    printMessage "✅ Crypto material generated successfully"
}

# Generate genesis block and channel transaction (System Channel approach)
function generateChannelArtifacts() {
    printMessage "🔧 Generating channel artifacts..."

    which configtxgen
    if [ "$?" -ne 0 ]; then
        printError "configtxgen tool not found. Exiting"
        exit 1
    fi

    if [ ! -d "channel-artifacts" ]; then
        mkdir channel-artifacts
    fi

    # Generate orderer genesis block (System Channel)
    printMessage "Generating orderer genesis block (system-channel)..."
    configtxgen -profile AcademicOrdererGenesis -channelID system-channel -outputBlock ./channel-artifacts/genesis.block

    if [ "$?" -ne 0 ]; then
        printError "Failed to generate genesis block..."
        exit 1
    fi

    # Generate channel creation transaction
    printMessage "Generating channel creation transaction for ${CHANNEL_NAME}..."
    configtxgen -profile AcademicChannel -outputCreateChannelTx ./channel-artifacts/${CHANNEL_NAME}.tx -channelID $CHANNEL_NAME

    if [ "$?" -ne 0 ]; then
        printError "Failed to generate channel creation transaction..."
        exit 1
    fi

    # Generate anchor peer update transactions
    printMessage "Generating anchor peer update for SchoolMSP..."
    configtxgen -profile AcademicChannel -outputAnchorPeersUpdate ./channel-artifacts/SchoolMSPanchors.tx -channelID $CHANNEL_NAME -asOrg SchoolMSP

    printMessage "Generating anchor peer update for StudentsMSP..."
    configtxgen -profile AcademicChannel -outputAnchorPeersUpdate ./channel-artifacts/StudentsMSPanchors.tx -channelID $CHANNEL_NAME -asOrg StudentsMSP

    printMessage "✅ Channel artifacts generated successfully"
}

# Start the network
function networkUp() {
    printMessage "🚀 Starting Academic Blockchain Network..."

    create_network

    echo "Starting Certificate Authorithies..."
    docker compose -f docker-compose-ca.yaml up -d

    # Start CA containers
    printMessage "Starting Certificate Authorities..."
    docker compose -f docker-compose-ca.yaml up -d

    sleep 3

    # Start network containers (orderer + peers)
    printMessage "Starting Orderer and Peers..."
    docker compose -f docker-compose-network.yaml up -d

    sleep 3

    docker ps --format "table {{.Names}}\t{{.Status}}"

    printMessage "✅ Network started successfully"
}

# Stop the network
function networkDown() {
    printMessage "🛑 Stopping Academic Blockchain Network..."

    docker compose -f docker-compose-network.yaml down --volumes --remove-orphans
    docker compose -f docker-compose-ca.yaml down --volumes --remove-orphans

    docker network rm academic-network 2>/dev/null || true

    # Remove chaincode containers
    docker rm -f $(docker ps -aq --filter "name=dev-peer") 2>/dev/null || true

    # Remove chaincode images
    docker rmi $(docker images "dev-peer*" -q) 2>/dev/null || true

    printMessage "Removing generated artifacts..."
    rm -rf channel-artifacts/*
    rm -rf organizations/peerOrganizations organizations/ordererOrganizations

    printMessage "✅ Network stopped and cleaned"
}

# Create channel
function createChannel() {
    printMessage "📺 Creating channel ${CHANNEL_NAME}..."

    docker exec cli scripts/createChannel.sh $CHANNEL_NAME

    printMessage "✅ Channel created successfully"
}

# Deploy chaincode
function deployChaincode() {
    printMessage "🎯 Deploying chaincode ${CHAINCODE_NAME}..."

    # Install npm dependencies on host (CLI container doesn't have npm)
    if [ -f "${CC_SRC_PATH}/package.json" ]; then
        printMessage "Installing chaincode npm dependencies on host..."
        pushd ${CC_SRC_PATH} > /dev/null
        npm install --production
        popd > /dev/null
    fi

    docker exec cli scripts/deployChaincode.sh $CHANNEL_NAME $CHAINCODE_NAME $CHAINCODE_VERSION $CHAINCODE_SEQUENCE $CC_SRC_PATH

    printMessage "✅ Chaincode deployed successfully"
}

# Print help
function printHelp() {
    echo "Academic Blockchain Network Management"
    echo ""
    echo "Usage: "
    echo "  network.sh <command>"
    echo ""
    echo "Commands:"
    echo "  up          - Start the network"
    echo "  down        - Stop and clean the network"
    echo "  restart     - Restart the network"
    echo "  generate    - Generate crypto material and channel artifacts"
    echo "  createChannel - Create the academic-channel"
    echo "  deployCC    - Deploy the academic-cc chaincode"
    echo "  all         - Do everything (generate, up, createChannel, deployCC)"
    echo ""
}

# Main
MODE=$1

if [ "$MODE" == "up" ]; then
    networkUp
elif [ "$MODE" == "down" ]; then
    networkDown
elif [ "$MODE" == "restart" ]; then
    networkDown
    sleep 2
    networkUp
elif [ "$MODE" == "generate" ]; then
    generateCrypto
    generateChannelArtifacts
elif [ "$MODE" == "createChannel" ]; then
    createChannel
elif [ "$MODE" == "deployCC" ]; then
    deployChaincode
elif [ "$MODE" == "all" ]; then
    printMessage "🏗️  Building complete Academic Blockchain Network..."
    generateCrypto
    generateChannelArtifacts
    networkUp
    sleep 5
    createChannel
    sleep 3
    deployChaincode
    printMessage "🎉 Network is ready!"
else
    printHelp
    exit 1
fi
