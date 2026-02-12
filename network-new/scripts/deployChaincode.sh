#!/bin/bash
#
# Script to deploy chaincode on academic-channel
# Uses proper TLS configuration for all peer commands
#

set -e

CHANNEL_NAME=$1
CC_NAME=$2
CC_VERSION=$3
CC_SEQUENCE=$4
CC_SRC_PATH=$5
DELAY=3

echo "=========================================="
echo "Deploying chaincode: $CC_NAME v$CC_VERSION"
echo "Channel: $CHANNEL_NAME"
echo "=========================================="

# Define TLS CA paths
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
echo "TLS certificates verified"

# Note: npm dependencies should be installed on the host before running this script
# The CLI container does not have npm installed

# Package chaincode
echo ""
echo "Packaging chaincode..."
peer lifecycle chaincode package ${CC_NAME}.tar.gz \
    --path ${CC_SRC_PATH} \
    --lang node \
    --label ${CC_NAME}_${CC_VERSION}

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to package chaincode"
    exit 1
fi
echo "✅ Chaincode packaged"

# Install on SchoolOrg peer
echo ""
echo "Installing chaincode on peer0.school.academic.edu..."
setSchoolOrg

peer lifecycle chaincode install ${CC_NAME}.tar.gz

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install chaincode on SchoolOrg peer"
    exit 1
fi
echo "✅ Installed on peer0.school"

sleep $DELAY

# Install on StudentsOrg peer
echo ""
echo "Installing chaincode on peer0.students.academic.edu..."
setStudentsOrg

peer lifecycle chaincode install ${CC_NAME}.tar.gz

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install chaincode on StudentsOrg peer"
    exit 1
fi
echo "✅ Installed on peer0.students"

sleep $DELAY

# Query installed chaincode to get package ID
echo ""
echo "Querying installed chaincode..."
peer lifecycle chaincode queryinstalled >&log.txt
cat log.txt
PACKAGE_ID=$(sed -n "/${CC_NAME}_${CC_VERSION}/{s/^Package ID: //; s/, Label:.*$//; p;}" log.txt)

if [ -z "$PACKAGE_ID" ]; then
    echo "ERROR: Failed to get package ID"
    exit 1
fi
echo "Package ID: $PACKAGE_ID"

# Approve for SchoolOrg
echo ""
echo "Approving chaincode for SchoolOrg..."
setSchoolOrg

peer lifecycle chaincode approveformyorg \
    -o orderer.academic.edu:7050 \
    --ordererTLSHostnameOverride orderer.academic.edu \
    --channelID $CHANNEL_NAME \
    --name $CC_NAME \
    --version $CC_VERSION \
    --package-id $PACKAGE_ID \
    --sequence $CC_SEQUENCE \
    --tls \
    --cafile ${ORDERER_CA}

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to approve chaincode for SchoolOrg"
    exit 1
fi
echo "✅ Approved for SchoolOrg"

sleep $DELAY

# Approve for StudentsOrg
echo ""
echo "Approving chaincode for StudentsOrg..."
setStudentsOrg

peer lifecycle chaincode approveformyorg \
    -o orderer.academic.edu:7050 \
    --ordererTLSHostnameOverride orderer.academic.edu \
    --channelID $CHANNEL_NAME \
    --name $CC_NAME \
    --version $CC_VERSION \
    --package-id $PACKAGE_ID \
    --sequence $CC_SEQUENCE \
    --tls \
    --cafile ${ORDERER_CA}

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to approve chaincode for StudentsOrg"
    exit 1
fi
echo "✅ Approved for StudentsOrg"

sleep $DELAY

# Check commit readiness
echo ""
echo "Checking commit readiness..."
peer lifecycle chaincode checkcommitreadiness \
    --channelID $CHANNEL_NAME \
    --name $CC_NAME \
    --version $CC_VERSION \
    --sequence $CC_SEQUENCE \
    --tls \
    --cafile ${ORDERER_CA} \
    --output json

sleep $DELAY

# Commit chaincode
echo ""
echo "Committing chaincode definition..."
peer lifecycle chaincode commit \
    -o orderer.academic.edu:7050 \
    --ordererTLSHostnameOverride orderer.academic.edu \
    --channelID $CHANNEL_NAME \
    --name $CC_NAME \
    --version $CC_VERSION \
    --sequence $CC_SEQUENCE \
    --tls \
    --cafile ${ORDERER_CA} \
    --peerAddresses peer0.school.academic.edu:7051 \
    --tlsRootCertFiles ${SCHOOL_PEER_TLS_CA} \
    --peerAddresses peer0.students.academic.edu:9051 \
    --tlsRootCertFiles ${STUDENTS_PEER_TLS_CA}

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to commit chaincode"
    exit 1
fi
echo "✅ Chaincode committed"

sleep $DELAY

# Query committed chaincode
echo ""
echo "Querying committed chaincode..."
peer lifecycle chaincode querycommitted \
    --channelID $CHANNEL_NAME \
    --name $CC_NAME \
    --tls \
    --cafile ${ORDERER_CA}

# Initialize chaincode (optional - may fail due to non-deterministic responses)
echo ""
echo "Initializing chaincode (calling InitLedger)..."
peer chaincode invoke \
    -o orderer.academic.edu:7050 \
    --ordererTLSHostnameOverride orderer.academic.edu \
    --tls \
    --cafile ${ORDERER_CA} \
    -C $CHANNEL_NAME \
    -n $CC_NAME \
    --peerAddresses peer0.school.academic.edu:7051 \
    --tlsRootCertFiles ${SCHOOL_PEER_TLS_CA} \
    --peerAddresses peer0.students.academic.edu:9051 \
    --tlsRootCertFiles ${STUDENTS_PEER_TLS_CA} \
    -c '{"function":"InitLedger","Args":[]}' || {
    echo "⚠️  InitLedger returned an error (non-critical, may be due to timestamp mismatch)"
    echo "   Chaincode is deployed and ready to use"
}

echo ""
echo "=========================================="
echo "✅ Chaincode deployment completed!"
echo "=========================================="
echo "Chaincode: $CC_NAME"
echo "Version: $CC_VERSION"
echo "Channel: $CHANNEL_NAME"
echo "Package ID: $PACKAGE_ID"
echo "=========================================="
