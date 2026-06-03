import client from "./client";

export const formsApi = {
  list: (params?: { page?: number; per_page?: number }) =>
    client.get("/forms", { params }),

  get: (id: number) => client.get(`/forms/${id}`),

  create: (data: any) => client.post("/forms", { form: data }),

  update: (id: number, data: any) => client.patch(`/forms/${id}`, { form: data }),

  delete: (id: number) => client.delete(`/forms/${id}`),

  publish: (id: number) => client.post(`/forms/${id}/publish`),

  copy: (id: number) => client.post(`/forms/${id}/copy`),

  responsesSummary: (id: number) => client.get(`/forms/${id}/responses_summary`),

  analytics: (id: number) => client.get(`/forms/${id}/analytics`),
};

export const responsesApi = {
  list: (formId: number, params?: { page?: number }) =>
    client.get(`/forms/${formId}/responses`, { params }),

  exportCsv: (formId: number) =>
    client.get(`/forms/${formId}/responses/export`, {
      params: { format: "csv" },
      responseType: "blob",
    }),
};

export const templatesApi = {
  list: () => client.get("/templates"),
  get: (id: number) => client.get(`/templates/${id}`),
  useTemplate: (id: number) => client.post(`/templates/${id}/use`),
};

export const analyticsApi = {
  dashboard: () => client.get("/analytics/dashboard"),
  form: (formId: number) => client.get(`/forms/${formId}/analytics`),
};
