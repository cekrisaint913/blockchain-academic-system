

package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type SmartContract struct {
	contractapi.Contract
}

// Class représente une classe
type Class struct {
	ClassID     string `json:"classId"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Teacher     string `json:"teacher"`
	MaxStudents int    `json:"maxStudents"`
	Semester    string `json:"semester"`
}

// Enrollment représente une inscription
type Enrollment struct {
	EnrollmentID string `json:"enrollmentId"`
	ClassID      string `json:"classId"`
	StudentID    string `json:"studentId"`
	Status       string `json:"status"` // active, withdrawn
}

// Material représente un support de cours
type Material struct {
	MaterialID  string `json:"materialId"`
	ClassID     string `json:"classId"`
	Title       string `json:"title"`
	Type        string `json:"type"` // lecture, lab, exercise
	IPFSHash    string `json:"ipfsHash"`
	UploadedBy  string `json:"uploadedBy"`
	UploadedAt  string `json:"uploadedAt"`
}

// Exam représente un examen
type Exam struct {
	ExamID         string `json:"examId"`
	ClassID        string `json:"classId"`
	Title          string `json:"title"`
	ExamDate       string `json:"examDate"`
	QuestionIPFS   string `json:"questionIPFS"`
	CorrectionIPFS string `json:"correctionIPFS"`
	PublishAfter   string `json:"publishAfter"` // 24h après examDate
}

// Grade représente une note
type Grade struct {
	GradeID     string  `json:"gradeId"`
	ExamID      string  `json:"examId"`
	StudentID   string  `json:"studentId"`
	Score       float64 `json:"score"`
	MaxScore    float64 `json:"maxScore"`
	IsPublished bool    `json:"isPublished"`
}

// InitLedger initialise le ledger avec des données de test
func (s *SmartContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
	// Classes de test
	classes := []Class{
		{
			ClassID:     "MATH101",
			Name:        "Mathematics 101",
			Description: "Introduction au calcul différentiel",
			Teacher:     "Prof. Dupont",
			MaxStudents: 30,
			Semester:    "Automne 2024",
		},
		{
			ClassID:     "INFO101",
			Name:        "Informatique 101",
			Description: "Introduction à la programmation",
			Teacher:     "Prof. Martin",
			MaxStudents: 25,
			Semester:    "Automne 2024",
		},
	}

	for _, class := range classes {
		classJSON, err := json.Marshal(class)
		if err != nil {
			return err
		}
		err = ctx.GetStub().PutState("CLASS_"+class.ClassID, classJSON)
		if err != nil {
			return fmt.Errorf("failed to put class: %v", err)
		}
	}

	return nil
}

// CreateClass crée une nouvelle classe
func (s *SmartContract) CreateClass(ctx contractapi.TransactionContextInterface, classID, name, description, teacher, semester string, maxStudents int) error {
	exists, err := s.AssetExists(ctx, "CLASS_"+classID)
	if err != nil {
		return err
	}
	if exists {
		return fmt.Errorf("class %s already exists", classID)
	}

	class := Class{
		ClassID:     classID,
		Name:        name,
		Description: description,
		Teacher:     teacher,
		MaxStudents: maxStudents,
		Semester:    semester,
	}

	classJSON, err := json.Marshal(class)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState("CLASS_"+classID, classJSON)
}

// GetClass retourne une classe
func (s *SmartContract) GetClass(ctx contractapi.TransactionContextInterface, classID string) (*Class, error) {
	classJSON, err := ctx.GetStub().GetState("CLASS_" + classID)
	if err != nil {
		return nil, fmt.Errorf("failed to read class: %v", err)
	}
	if classJSON == nil {
		return nil, fmt.Errorf("class %s does not exist", classID)
	}

	var class Class
	err = json.Unmarshal(classJSON, &class)
	if err != nil {
		return nil, err
	}

	return &class, nil
}

// GetAllClasses retourne toutes les classes (accessible à tous)
func (s *SmartContract) GetAllClasses(ctx contractapi.TransactionContextInterface) ([]*Class, error) {
	resultsIterator, err := ctx.GetStub().GetStateByRange("CLASS_", "CLASS_~")
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()

	var classes []*Class
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}

		var class Class
		err = json.Unmarshal(queryResponse.Value, &class)
		if err != nil {
			continue
		}
		classes = append(classes, &class)
	}

	return classes, nil
}

// EnrollStudent inscrit un étudiant dans une classe
func (s *SmartContract) EnrollStudent(ctx contractapi.TransactionContextInterface, classID, studentID string) error {
	enrollmentID := fmt.Sprintf("ENR_%s_%s", classID, studentID)
	
	exists, err := s.AssetExists(ctx, enrollmentID)
	if err != nil {
		return err
	}
	if exists {
		return fmt.Errorf("student already enrolled in this class")
	}

	enrollment := Enrollment{
		EnrollmentID: enrollmentID,
		ClassID:      classID,
		StudentID:    studentID,
		Status:       "active",
	}

	enrollmentJSON, err := json.Marshal(enrollment)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(enrollmentID, enrollmentJSON)
}

// UploadMaterial ajoute un support de cours
func (s *SmartContract) UploadMaterial(ctx contractapi.TransactionContextInterface, materialID, classID, title, materialType, ipfsHash, uploadedBy string) error {
	material := Material{
		MaterialID:  materialID,
		ClassID:     classID,
		Title:       title,
		Type:        materialType,
		IPFSHash:    ipfsHash,
		UploadedBy:  uploadedBy,
		UploadedAt:  time.Now().Format(time.RFC3339),
	}

	materialJSON, err := json.Marshal(material)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState("MAT_"+materialID, materialJSON)
}

// GetClassMaterials retourne les supports d'une classe
func (s *SmartContract) GetClassMaterials(ctx contractapi.TransactionContextInterface, classID string) ([]*Material, error) {
	resultsIterator, err := ctx.GetStub().GetStateByRange("MAT_", "MAT_~")
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()

	var materials []*Material
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}

		var material Material
		err = json.Unmarshal(queryResponse.Value, &material)
		if err != nil {
			continue
		}
		
		if material.ClassID == classID {
			materials = append(materials, &material)
		}
	}

	return materials, nil
}

// CreateExam crée un examen
func (s *SmartContract) CreateExam(ctx contractapi.TransactionContextInterface, examID, classID, title, examDate, questionIPFS string) error {
	// Calculer publishAfter (24h après examDate)
	examTime, err := time.Parse(time.RFC3339, examDate)
	if err != nil {
		return fmt.Errorf("invalid exam date format: %v", err)
	}
	publishAfter := examTime.Add(24 * time.Hour).Format(time.RFC3339)

	exam := Exam{
		ExamID:       examID,
		ClassID:      classID,
		Title:        title,
		ExamDate:     examDate,
		QuestionIPFS: questionIPFS,
		PublishAfter: publishAfter,
	}

	examJSON, err := json.Marshal(exam)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState("EXAM_"+examID, examJSON)
}

// GetExam retourne un examen (avec vérification du délai)
func (s *SmartContract) GetExam(ctx contractapi.TransactionContextInterface, examID string) (*Exam, error) {
	examJSON, err := ctx.GetStub().GetState("EXAM_" + examID)
	if err != nil {
		return nil, fmt.Errorf("failed to read exam: %v", err)
	}
	if examJSON == nil {
		return nil, fmt.Errorf("exam %s does not exist", examID)
	}

	var exam Exam
	err = json.Unmarshal(examJSON, &exam)
	if err != nil {
		return nil, err
	}

	// Vérifier le délai de publication (simulation - dans la vraie vie, comparer avec l'heure actuelle)
	// Pour la démo, on retourne l'examen

	return &exam, nil
}

// SubmitGrade soumet une note
func (s *SmartContract) SubmitGrade(ctx contractapi.TransactionContextInterface, gradeID, examID, studentID string, score, maxScore float64) error {
	grade := Grade{
		GradeID:     gradeID,
		ExamID:      examID,
		StudentID:   studentID,
		Score:       score,
		MaxScore:    maxScore,
		IsPublished: false,
	}

	gradeJSON, err := json.Marshal(grade)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState("GRADE_"+gradeID, gradeJSON)
}

// PublishGrade publie une note
func (s *SmartContract) PublishGrade(ctx contractapi.TransactionContextInterface, gradeID string) error {
	gradeJSON, err := ctx.GetStub().GetState("GRADE_" + gradeID)
	if err != nil {
		return fmt.Errorf("failed to read grade: %v", err)
	}
	if gradeJSON == nil {
		return fmt.Errorf("grade %s does not exist", gradeID)
	}

	var grade Grade
	err = json.Unmarshal(gradeJSON, &grade)
	if err != nil {
		return err
	}

	grade.IsPublished = true

	gradeJSON, err = json.Marshal(grade)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState("GRADE_"+gradeID, gradeJSON)
}

// GetGrade retourne une note (si publiée)
func (s *SmartContract) GetGrade(ctx contractapi.TransactionContextInterface, gradeID string) (*Grade, error) {
	gradeJSON, err := ctx.GetStub().GetState("GRADE_" + gradeID)
	if err != nil {
		return nil, fmt.Errorf("failed to read grade: %v", err)
	}
	if gradeJSON == nil {
		return nil, fmt.Errorf("grade %s does not exist", gradeID)
	}

	var grade Grade
	err = json.Unmarshal(gradeJSON, &grade)
	if err != nil {
		return nil, err
	}

	if !grade.IsPublished {
		return nil, fmt.Errorf("grade not yet published")
	}

	return &grade, nil
}

// AssetExists vérifie si un asset existe
func (s *SmartContract) AssetExists(ctx contractapi.TransactionContextInterface, id string) (bool, error) {
	assetJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return false, fmt.Errorf("failed to read from world state: %v", err)
	}

	return assetJSON != nil, nil
}

func main() {
	assetChaincode, err := contractapi.NewChaincode(&SmartContract{})
	if err != nil {
		log.Panicf("Error creating academic chaincode: %v", err)
	}

	if err := assetChaincode.Start(); err != nil {
		log.Panicf("Error starting academic chaincode: %v", err)
	}
}
