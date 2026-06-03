import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:3000/api/v1";

const client = axios.create({ baseURL: API_BASE });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("rforms_customer_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default client;
