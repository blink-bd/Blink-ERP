import axios from 'axios';

const API_URL = (import.meta as any).env?.VITE_API_URL || '/api/v1';
let csrfToken: string | null = null;
let csrfRequest: Promise<string> | null = null;

export async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  if (!csrfRequest) {
    csrfRequest = axios
      .get(`${API_URL}/auth/csrf`, { withCredentials: true })
      .then((response) => {
        csrfToken = response.data.data.csrfToken as string;
        return csrfToken;
      })
      .finally(() => {
        csrfRequest = null;
      });
  }
  return csrfRequest;
}
