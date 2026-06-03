import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:3000/api/v1";

const client = axios.create({ baseURL: API_BASE });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("rforms_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("rforms_token");
      localStorage.removeItem("rforms_user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default client;
