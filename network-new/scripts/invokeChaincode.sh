#!/bin/bash
#
# Invoke chaincode helper script
# Usage: ./invokeChaincode.sh <contract:function> <arg1> <arg2> ...
#
# IMPORTANT: Each argument must be separate, no spaces within args
#
# Examples:
#   ./invokeChaincode.sh ClassContract:CreateClass CLASS001 Mathematics "Intro_to_Math"
#   ./invokeChaincode.sh ClassContract:EnrollStudent CLASS001 student1
#   ./invokeChaincode.sh AcademicContract:InitLedger
#

if [ -z "$1" ]; then
    echo "Usage: ./invokeChaincode.sh <contract:function> [arg1] [arg2] ..."
    echo ""
    echo "Examples:"
    echo "  ./invokeChaincode.sh ClassContract:CreateClass CLASS001 Mathematics Introduction_to_Math"
    echo "  ./invokeChaincode.sh ClassContract:EnrollStudent CLASS001 student1"
    echo "  ./invokeChaincode.sh AcademicContract:CreateExam EXAM001 CLASS001 Midterm 2024-03-15 First_exam"
    echo ""
    echo "Available contracts:"
    echo "  - ClassContract: CreateClass, EnrollStudent, AddModuleToClass"
    echo "  - AcademicContract: InitLedger, UploadMaterial, CreateExam, SubmitGrade, PublishGrade"
    echo ""
    echo "Note: Use underscores instead of spaces in arguments"
    exit 1
fi

FUNCTION=$1

# Paths inside CLI container
PEER_MSP=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/school.academic.edu/users/Admin@school.academic.edu/msp
PEER_TLS=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/school.academic.edu/peers/peer0.school.academic.edu/tls/ca.crt
ORDERER_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/ordererOrganizations/academic.edu/orderers/orderer.academic.edu/tls/ca.crt
SCHOOL_TLS=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/school.academic.edu/peers/peer0.school.academic.edu/tls/ca.crt
STUDENTS_TLS=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/students.academic.edu/peers/peer0.students.academic.edu/tls/ca.crt

# Build JSON args array from positional parameters
shift  # Remove function name
if [ $# -eq 0 ]; then
    JSON_ARGS='{"function":"'$FUNCTION'","Args":[]}'
else
    # Build args array properly
    ARGS_JSON="["
    FIRST=true
    for arg in "$@"; do
        if [ "$FIRST" = true ]; then
            ARGS_JSON="${ARGS_JSON}\"${arg}\""
            FIRST=false
        else
            ARGS_JSON="${ARGS_JSON},\"${arg}\""
        fi
    done
    ARGS_JSON="${ARGS_JSON}]"
    JSON_ARGS='{"function":"'$FUNCTION'","Args":'$ARGS_JSON'}'
fi

echo "=========================================="
echo "Invoking chaincode"
echo "Function: $FUNCTION"
echo "Args: $JSON_ARGS"
echo "=========================================="
echo ""

docker exec \
    -e CORE_PEER_TLS_ENABLED=true \
    -e CORE_PEER_LOCALMSPID=SchoolMSP \
    -e CORE_PEER_ADDRESS=peer0.school.academic.edu:7051 \
    -e CORE_PEER_MSPCONFIGPATH=$PEER_MSP \
    -e CORE_PEER_TLS_ROOTCERT_FILE=$PEER_TLS \
    cli \
    peer chaincode invoke \
        -o orderer.academic.edu:7050 \
        --tls \
        --cafile $ORDERER_CA \
        -C academic-channel \
        -n academic-cc \
        --peerAddresses peer0.school.academic.edu:7051 \
        --tlsRootCertFiles $SCHOOL_TLS \
        --peerAddresses peer0.students.academic.edu:9051 \
        --tlsRootCertFiles $STUDENTS_TLS \
        --waitForEvent \
        --waitForEventTimeout 30s \
        -c "$JSON_ARGS"
