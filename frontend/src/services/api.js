

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export const authAPI = {
    register: (username, role, organization = 'Org1') =>
        api.post('/api/auth/register', { username, role, organization }),
    
    login: (username, password) =>
        api.post('/api/auth/login', { username, password }),
    
    me: () =>
        api.get('/api/auth/me'),
};

export const classesAPI = {
    getAll: () =>
        api.get('/api/classes'),
    
    getById: (classId) =>
        api.get(`/api/classes/${classId}`),
    
    create: (classData) =>
        api.post('/api/classes', classData),
    
    enroll: (classId, studentId) =>
        api.post(`/api/classes/${classId}/enroll`, { studentId }),
    
    getMaterials: (classId) =>
        api.get(`/api/classes/${classId}/materials`),
};

export const materialsAPI = {
    upload: (formData) =>
        api.post('/api/materials/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        }),
    
    download: (hash) =>
        api.get(`/api/materials/${hash}`, { responseType: 'blob' }),
};

export default api;
