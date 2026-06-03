import client from "./client";

export const authApi = {
  login: (email: string, password: string) =>
    client.post("/auth/login", { email, password }),

  logout: () => client.delete("/auth/logout"),

  me: () => client.get("/auth/me"),
};
