#!/bin/bash
#
# Query chaincode helper script
# Usage: ./queryChaincode.sh <contract:function> [arg1] [arg2] ...
#
# Examples:
#   ./queryChaincode.sh ClassContract:GetAllClasses
#   ./queryChaincode.sh ClassContract:GetClassDetails CLASS001
#   ./queryChaincode.sh AcademicContract:GetAllExams
#

if [ -z "$1" ]; then
    echo "Usage: ./queryChaincode.sh <contract:function> [arg1] [arg2] ..."
    echo ""
    echo "Examples:"
    echo "  ./queryChaincode.sh ClassContract:GetAllClasses"
    echo "  ./queryChaincode.sh ClassContract:GetClassDetails CLASS001"
    echo "  ./queryChaincode.sh AcademicContract:GetAllExams"
    echo ""
    echo "Available contracts:"
    echo "  - ClassContract: GetAllClasses, GetClassDetails, GetEnrolledStudents"
    echo "  - AcademicContract: GetClassMaterials, GetExam, GetAllExams, GetGrade, GetAllGrades"
    exit 1
fi

FUNCTION=$1

# Paths inside CLI container
PEER_MSP=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/school.academic.edu/users/Admin@school.academic.edu/msp
PEER_TLS=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/school.academic.edu/peers/peer0.school.academic.edu/tls/ca.crt

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
echo "Querying chaincode"
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
    peer chaincode query \
        -C academic-channel \
        -n academic-cc \
        -c "$JSON_ARGS"
