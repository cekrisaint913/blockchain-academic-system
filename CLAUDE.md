# CLAUDE.md - AI Assistant Guide for Blockchain Academic System

## Project Overview

This is a **blockchain-based academic management system** built on Hyperledger Fabric. It enables secure, transparent management of academic data including courses, enrollments, exams, and grades with an immutable audit trail.

**Primary Language**: JavaScript (Node.js/React) for application code, Go for smart contracts

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────────┐
│  React Frontend │────▶│  Express API    │────▶│  Hyperledger Fabric     │
│  (Vite + TW)    │     │  (Node.js)      │     │  (Smart Contracts - Go) │
└─────────────────┘     └────────┬────────┘     └─────────────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │      IPFS       │
                        │  (File Storage) │
                        └─────────────────┘
```

## Directory Structure

```
blockchain-academic-system/
├── backend/                    # Node.js Express API
│   ├── server.js              # Entry point
│   ├── src/
│   │   ├── app.js             # Express configuration
│   │   ├── config/fabric.js   # Hyperledger Fabric client
│   │   ├── middleware/
│   │   │   ├── auth.js        # JWT & RBAC
│   │   │   └── security.js    # Rate limiting, CORS, sanitization
│   │   ├── routes/            # API route definitions
│   │   ├── controllers/       # Request handlers
│   │   ├── services/          # Business logic (auth, IPFS)
│   │   └── utils/             # Logger, validation schemas
│   └── scripts/               # Admin scripts
│
├── frontend/                   # React SPA
│   ├── src/
│   │   ├── main.jsx           # Entry point
│   │   ├── App.jsx            # Root component + routing
│   │   ├── contexts/          # React Context (Auth)
│   │   ├── services/api.js    # Axios HTTP client
│   │   ├── pages/             # Page components
│   │   └── components/        # Reusable UI components
│   ├── vite.config.js         # Vite build config
│   └── tailwind.config.js     # Tailwind theme
│
└── chaincode/chaincode-go/    # Smart Contracts (Go)
    └── academic.go            # Main chaincode
```

## Quick Reference Commands

### Backend
```bash
cd backend
npm install           # Install dependencies
npm run dev           # Start with hot reload (nodemon)
npm start             # Production start
npm test              # Run tests with coverage
npm run lint          # ESLint check
npm run enroll-admin  # Enroll admin identity
```

### Frontend
```bash
cd frontend
npm install           # Install dependencies
npm run dev           # Start dev server (port 5173)
npm run build         # Production build
npm run preview       # Preview production build
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite 5, Tailwind CSS 3.4, TanStack Query 5 |
| Backend | Express 4.18, Node.js 18+ |
| Blockchain | Hyperledger Fabric 2.5, fabric-network 2.2 |
| Smart Contracts | Go 1.21, fabric-contract-api-go |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Storage | IPFS (ipfs-http-client) |
| Validation | Joi 17 |
| Testing | Jest 29, Supertest |

## Coding Conventions

### Backend (Node.js)

- **Module system**: CommonJS (`require`/`module.exports`)
- **Async handling**: Always use try/catch with async/await, pass errors to `next()`
- **Response format**: Consistent JSON structure
  ```javascript
  // Success
  res.json({ success: true, data: result });
  res.json({ success: true, count: items.length, data: items });

  // Error
  res.status(404).json({ success: false, error: 'Resource not found' });
  ```
- **Logging**: Use Winston logger from `utils/logger.js`
  ```javascript
  const logger = require('./utils/logger');
  logger.info('Operation completed');
  logger.error(`Operation failed: ${error.message}`);
  ```
- **Comments**: French comments are acceptable (bilingual codebase)

### Frontend (React)

- **Module system**: ES Modules (`import`/`export`)
- **Component style**: Functional components with hooks
- **State management**: React Context for auth, TanStack Query for server state
- **Styling**: Tailwind CSS utility classes
- **Routing**: React Router v6 with `<Routes>` and `<Route>`
- **No trailing semicolons** in JSX files (project convention)

### Smart Contracts (Go)

- **Framework**: Hyperledger Fabric Contract API
- **State keys**: Prefixed by type (`CLASS_`, `ENR_`, `MAT_`, `EXAM_`, `GRADE_`)
- **Error format**: `fmt.Errorf("message: %v", err)`
- **JSON tags**: camelCase field names

## API Endpoints

### Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | No | Register new user |
| POST | `/api/auth/login` | No | Login, returns JWT |
| GET | `/api/auth/me` | Yes | Get current user |

### Classes
| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/api/classes` | No | - | List all classes |
| GET | `/api/classes/:classId` | Yes | Any | Get class details |
| POST | `/api/classes` | Yes | Teacher | Create class |
| POST | `/api/classes/:classId/enroll` | Yes | Student | Enroll in class |
| GET | `/api/classes/:classId/materials` | Yes | Any | Get materials |

### Materials
| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| POST | `/api/materials/upload` | Yes | Teacher | Upload material |
| GET | `/api/materials/:hash` | Yes | Any | Download from IPFS |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |

## Smart Contract Functions

### Chaincode: `academic`

| Function | Type | Description |
|----------|------|-------------|
| `InitLedger` | Submit | Initialize with test data |
| `CreateClass` | Submit | Create new class |
| `GetClass` | Evaluate | Get single class |
| `GetAllClasses` | Evaluate | List all classes |
| `EnrollStudent` | Submit | Enroll student in class |
| `UploadMaterial` | Submit | Store material reference |
| `GetClassMaterials` | Evaluate | Get class materials |
| `CreateExam` | Submit | Create exam |
| `GetExam` | Evaluate | Get exam (respects publish time) |
| `SubmitGrade` | Submit | Submit student grade |
| `PublishGrade` | Submit | Make grade visible |
| `GetGrade` | Evaluate | Get published grade |

## Environment Variables

Backend (`.env`):
```
NODE_ENV=development|production
PORT=3000
JWT_SECRET=<secure-random-string>
JWT_EXPIRES_IN=24h
CHANNEL_NAME=mychannel
CHAINCODE_NAME=academic
CORS_ORIGIN=http://localhost:5173
```

## User Roles

| Role | Permissions |
|------|-------------|
| `student` | View classes, enroll, view materials, view published grades |
| `teacher` | All student permissions + create classes, upload materials, create exams, submit/publish grades |
| `admin` | Full system access |

## Security Features

- **JWT Authentication**: Bearer token in Authorization header
- **Role-Based Access Control**: Middleware checks `req.user.role`
- **Rate Limiting**: 100 req/15min general, 5 req/15min for auth
- **Input Validation**: Joi schemas in `utils/validation.js`
- **Input Sanitization**: Removes `<>` characters
- **Security Headers**: Helmet middleware (CSP, HSTS, etc.)
- **Audit Logging**: All sensitive operations logged

## Blockchain Integration Pattern

```javascript
// Read operation (no consensus needed)
const result = await fabricClient.evaluateTransaction(
    username,      // Identity to use
    'FunctionName', // Chaincode function
    arg1, arg2      // Arguments
);

// Write operation (requires consensus)
const result = await fabricClient.submitTransaction(
    username,
    'FunctionName',
    arg1, arg2
);
```

## Common Development Tasks

### Adding a New API Endpoint

1. Define route in `backend/src/routes/<resource>.js`
2. Add controller function in `backend/src/controllers/`
3. Add Joi validation schema if needed in `backend/src/utils/validation.js`
4. Apply middleware: `authenticate`, `authorize(['role'])` as needed

### Adding a New Chaincode Function

1. Add function to `chaincode/chaincode-go/academic.go`
2. Follow naming convention: `PascalCase`
3. Use state key prefix for new entity types
4. Return errors with `fmt.Errorf`

### Adding a New Frontend Page

1. Create page component in `frontend/src/pages/`
2. Add route in `frontend/src/App.jsx`
3. Use `api.js` service for HTTP requests
4. Wrap with `MainLayout` for protected routes

## Testing

```bash
# Backend unit/integration tests
cd backend && npm test

# Run specific test file
npm test -- path/to/test.js
```

Test files should be placed alongside source files or in `__tests__` directories.

## Error Handling Pattern

```javascript
// Controller pattern
exports.someAction = async (req, res, next) => {
    try {
        // ... logic
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error(`SomeAction failed: ${error.message}`);

        // Handle specific errors
        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                error: 'Resource not found'
            });
        }

        // Pass to global error handler
        next(error);
    }
};
```

## Key Files Reference

| Purpose | File |
|---------|------|
| Backend entry | `backend/server.js` |
| Express app config | `backend/src/app.js` |
| Fabric client | `backend/src/config/fabric.js` |
| Auth middleware | `backend/src/middleware/auth.js` |
| Security middleware | `backend/src/middleware/security.js` |
| Frontend entry | `frontend/src/main.jsx` |
| React app root | `frontend/src/App.jsx` |
| Auth context | `frontend/src/contexts/AuthContext.jsx` |
| API service | `frontend/src/services/api.js` |
| Smart contracts | `chaincode/chaincode-go/academic.go` |

## Notes for AI Assistants

1. **Bilingual codebase**: Comments may be in French; maintain consistency with surrounding code
2. **No semicolons in JSX**: Frontend follows this convention
3. **CommonJS in backend**: Use `require`/`module.exports`, not ES imports
4. **Response format**: Always use `{ success: boolean, data/error: ... }` pattern
5. **State key prefixes**: Maintain `CLASS_`, `ENR_`, `MAT_`, `EXAM_`, `GRADE_` convention in chaincode
6. **Wallet directory**: Auto-created at `backend/wallet/` for Fabric identities
7. **File uploads**: Stored temporarily in `backend/uploads/`, then pushed to IPFS
8. **Logs**: Written to `backend/logs/` directory
