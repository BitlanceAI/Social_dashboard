let API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://automation-dashboard-s3m6.onrender.com' : 'http://localhost:3001');

export default API_BASE_URL;
