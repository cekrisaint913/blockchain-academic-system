#!/bin/bash
#
# Script to create and join channel (System Channel approach)
# Uses peer channel create/join commands
#

set -e

CHANNEL_NAME=$1
DELAY=3
MAX_RETRY=5

echo "=========================================="
echo "Creating channel: ${CHANNEL_NAME}"
echo "Using System Channel approach"
echo "=========================================="

# Define TLS CA paths (inside CLI container)
ORDERER_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/ordererOrganizations/academic.edu/orderers/orderer.academic.edu/tls/ca.crt
SCHOOL_PEER_TLS_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/school.academic.edu/peers/peer0.school.academic.edu/tls/ca.crt
STUDENTS_PEER_TLS_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/students.academic.edu/peers/peer0.students.academic.edu/tls/ca.crt

# Function to set SchoolOrg environment
setSchoolOrg() {
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="SchoolMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=${SCHOOL_PEER_TLS_CA}
    export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/school.academic.edu/users/Admin@school.academic.edu/msp
    export CORE_PEER_ADDRESS=peer0.school.academic.edu:7051
}

# Function to set StudentsOrg environment
setStudentsOrg() {
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="StudentsMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=${STUDENTS_PEER_TLS_CA}
    export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/students.academic.edu/users/Admin@students.academic.edu/msp
    export CORE_PEER_ADDRESS=peer0.students.academic.edu:9051
}

# Verify TLS files exist
echo "Verifying TLS certificates..."
if [ ! -f "$ORDERER_CA" ]; then
    echo "ERROR: Orderer TLS CA not found at: $ORDERER_CA"
    exit 1
fi
if [ ! -f "$SCHOOL_PEER_TLS_CA" ]; then
    echo "ERROR: School peer TLS CA not found at: $SCHOOL_PEER_TLS_CA"
    exit 1
fi
if [ ! -f "$STUDENTS_PEER_TLS_CA" ]; then
    echo "ERROR: Students peer TLS CA not found at: $STUDENTS_PEER_TLS_CA"
    exit 1
fi
echo "TLS certificates verified"

# Set environment for SchoolOrg peer (channel creator)
setSchoolOrg

# Create channel using peer channel create
echo ""
echo "Creating channel ${CHANNEL_NAME}..."
peer channel create \
    -o orderer.academic.edu:7050 \
    -c $CHANNEL_NAME \
    -f ./channel-artifacts/${CHANNEL_NAME}.tx \
    --outputBlock ./channel-artifacts/${CHANNEL_NAME}.block \
    --tls \
    --cafile ${ORDERER_CA}

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to create channel"
    exit 1
fi
echo "Channel ${CHANNEL_NAME} created"

sleep $DELAY

# Join SchoolOrg peer to channel
echo ""
echo "Joining peer0.school.academic.edu to channel..."
peer channel join -b ./channel-artifacts/${CHANNEL_NAME}.block

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to join peer0.school to channel"
    exit 1
fi
echo "peer0.school.academic.edu joined channel"

sleep $DELAY

# Update anchor peers for SchoolOrg
echo ""
echo "Updating anchor peers for SchoolMSP..."
peer channel update \
    -o orderer.academic.edu:7050 \
    -c $CHANNEL_NAME \
    -f ./channel-artifacts/SchoolMSPanchors.tx \
    --tls \
    --cafile ${ORDERER_CA}

if [ $? -ne 0 ]; then
    echo "WARNING: Failed to update anchor peers for SchoolMSP (may already exist)"
fi

sleep $DELAY

# Switch to StudentsOrg
setStudentsOrg

# Join StudentsOrg peer to channel
echo ""
echo "Joining peer0.students.academic.edu to channel..."
peer channel join -b ./channel-artifacts/${CHANNEL_NAME}.block

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to join peer0.students to channel"
    exit 1
fi
echo "peer0.students.academic.edu joined channel"

sleep $DELAY

# Update anchor peers for StudentsOrg
echo ""
echo "Updating anchor peers for StudentsMSP..."
peer channel update \
    -o orderer.academic.edu:7050 \
    -c $CHANNEL_NAME \
    -f ./channel-artifacts/StudentsMSPanchors.tx \
    --tls \
    --cafile ${ORDERER_CA}

if [ $? -ne 0 ]; then
    echo "WARNING: Failed to update anchor peers for StudentsMSP (may already exist)"
fi

echo ""
echo "=========================================="
echo "Channel creation and join completed!"
echo "=========================================="
echo "Channel: ${CHANNEL_NAME}"
echo "Peers joined:"
echo "  - peer0.school.academic.edu (SchoolMSP)"
echo "  - peer0.students.academic.edu (StudentsMSP)"
echo "=========================================="
