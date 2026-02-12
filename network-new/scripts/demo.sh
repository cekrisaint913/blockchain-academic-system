#!/bin/bash
#
# Academic Blockchain Demo Script
# Demonstrates the complete workflow: Classes -> Exams -> Grades
#

set -e

cd "$(dirname "$0")/.."

echo "=========================================="
echo "   ACADEMIC BLOCKCHAIN DEMO"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() {
    echo -e "${BLUE}>>> $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
    echo ""
}

# Step 1: List all classes (should be empty initially)
print_step "Step 1: Listing all classes (initial state)"
./scripts/queryChaincode.sh ClassContract:GetAllClasses
print_success "Query completed"

sleep 2

# Step 2: Create a class
print_step "Step 2: Creating a class 'Cybersecurity 101'"
./scripts/invokeChaincode.sh ClassContract:CreateClass CYBER101 Cybersecurity "Introduction to Cybersecurity"
print_success "Class created"

sleep 3

# Step 3: Create another class
print_step "Step 3: Creating another class 'Blockchain Development'"
./scripts/invokeChaincode.sh ClassContract:CreateClass BLOCK201 Blockchain "Smart Contract Development"
print_success "Class created"

sleep 3

# Step 4: List all classes again
print_step "Step 4: Listing all classes (should show 2 classes)"
./scripts/queryChaincode.sh ClassContract:GetAllClasses
print_success "Query completed"

sleep 2

# Step 5: Get class details
print_step "Step 5: Getting details for CYBER101"
./scripts/queryChaincode.sh ClassContract:GetClassDetails CYBER101
print_success "Query completed"

sleep 2

# Step 6: Add a module to the class
print_step "Step 6: Adding module 'Network Security' to CYBER101"
./scripts/invokeChaincode.sh ClassContract:AddModuleToClass CYBER101 NetworkSecurity
print_success "Module added"

sleep 3

# Step 7: Enroll a student
print_step "Step 7: Enrolling student 'alice' in CYBER101"
./scripts/invokeChaincode.sh ClassContract:EnrollStudent CYBER101 alice
print_success "Student enrolled"

sleep 3

# Step 8: Create an exam
print_step "Step 8: Creating exam 'Midterm' for CYBER101"
./scripts/invokeChaincode.sh AcademicContract:CreateExam EXAM001 CYBER101 Midterm 2024-03-15 "First midterm exam"
print_success "Exam created"

sleep 3

# Step 9: List all exams
print_step "Step 9: Listing all exams"
./scripts/queryChaincode.sh AcademicContract:GetAllExams
print_success "Query completed"

sleep 2

# Step 10: Submit a grade
print_step "Step 10: Submitting grade for student 'alice' on EXAM001"
./scripts/invokeChaincode.sh AcademicContract:SubmitGrade GRADE001 EXAM001 alice 85 100 "Good work"
print_success "Grade submitted"

sleep 3

# Step 11: Publish the grade
print_step "Step 11: Publishing grade GRADE001"
./scripts/invokeChaincode.sh AcademicContract:PublishGrade GRADE001
print_success "Grade published"

sleep 3

# Step 12: Get all grades
print_step "Step 12: Getting all grades"
./scripts/queryChaincode.sh AcademicContract:GetAllGrades
print_success "Query completed"

# Step 13: Final summary
print_step "Step 13: Final state - All classes"
./scripts/queryChaincode.sh ClassContract:GetAllClasses

echo ""
echo "=========================================="
echo "   DEMO COMPLETED SUCCESSFULLY!"
echo "=========================================="
echo ""
echo "Summary of created data:"
echo "  - 2 Classes: CYBER101, BLOCK201"
echo "  - 1 Student enrolled: alice in CYBER101"
echo "  - 1 Exam: EXAM001 (Midterm)"
echo "  - 1 Grade: GRADE001 (alice: 85/100)"
echo ""
echo "Available query commands:"
echo "  ./scripts/queryChaincode.sh ClassContract:GetAllClasses"
echo "  ./scripts/queryChaincode.sh ClassContract:GetClassDetails CYBER101"
echo "  ./scripts/queryChaincode.sh AcademicContract:GetAllExams"
echo "  ./scripts/queryChaincode.sh AcademicContract:GetAllGrades"
echo ""
