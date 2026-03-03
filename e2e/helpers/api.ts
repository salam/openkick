import { type APIRequestContext } from "@playwright/test";

const API = "http://localhost:3001";

export class ApiHelper {
  constructor(private request: APIRequestContext, private token?: string) {}

  private headers() {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    return h;
  }

  setToken(token: string) { this.token = token; }

  async setup(data: { name: string; email: string; password: string }) {
    const res = await this.request.post(`${API}/api/setup`, {
      headers: this.headers(),
      data,
    });
    return res.json();
  }

  async setupStatus() {
    const res = await this.request.get(`${API}/api/setup/status`);
    return res.json();
  }

  async login(email: string, password: string) {
    const res = await this.request.post(`${API}/api/guardians/login`, {
      headers: this.headers(),
      data: { email, password },
    });
    return res.json();
  }

  async createPlayer(data: { name: string; yearOfBirth?: number; position?: string; category?: string }) {
    const res = await this.request.post(`${API}/api/players`, {
      headers: this.headers(),
      data,
    });
    return { status: res.status(), body: await res.json() };
  }

  async createGuardian(data: { name: string; phone: string; email?: string; role?: string }) {
    const res = await this.request.post(`${API}/api/guardians`, {
      headers: this.headers(),
      data,
    });
    return { status: res.status(), body: await res.json() };
  }

  async linkGuardianToPlayer(guardianId: number, playerId: number) {
    const res = await this.request.post(`${API}/api/guardians/${guardianId}/players`, {
      headers: this.headers(),
      data: { playerId },
    });
    return { status: res.status(), body: await res.json() };
  }

  async createEvent(data: { type: string; title: string; date: string; startTime?: string; location?: string }) {
    const res = await this.request.post(`${API}/api/events`, {
      headers: this.headers(),
      data,
    });
    return { status: res.status(), body: await res.json() };
  }

  async getEvents() {
    const res = await this.request.get(`${API}/api/events`, { headers: this.headers() });
    return res.json();
  }

  async getAttendance(eventId: number) {
    const res = await this.request.get(`${API}/api/attendance?eventId=${eventId}`, { headers: this.headers() });
    return res.json();
  }

  async importResultsFromUrl(eventId: number, url: string) {
    const res = await this.request.post(`${API}/api/tournament-results/${eventId}/import`, {
      headers: this.headers(),
      data: { url },
    });
    return { status: res.status(), body: await res.json() };
  }

  async sendWhatsAppWebhook(payload: Record<string, unknown>) {
    const res = await this.request.post(`${API}/api/whatsapp/webhook`, {
      headers: { "Content-Type": "application/json" },
      data: payload,
    });
    return { status: res.status(), body: await res.json() };
  }

  async getSetting(key: string) {
    const res = await this.request.get(`${API}/api/settings/${key}`, { headers: this.headers() });
    return res.json();
  }

  async putSetting(key: string, value: string) {
    const res = await this.request.put(`${API}/api/settings/${key}`, {
      headers: this.headers(),
      data: { value },
    });
    return res.status();
  }

  async createSurvey(data: { title: string; questions?: unknown[]; anonymous?: boolean; deadline?: string }) {
    const res = await this.request.post(`${API}/api/surveys`, {
      headers: this.headers(),
      data,
    });
    return { status: res.status(), body: await res.json() };
  }

  async getSurveys() {
    const res = await this.request.get(`${API}/api/surveys`, { headers: this.headers() });
    return res.json();
  }

  async closeSurvey(id: number) {
    const res = await this.request.put(`${API}/api/surveys/${id}/close`, { headers: this.headers() });
    return res.status();
  }

  async archiveSurvey(id: number) {
    const res = await this.request.put(`${API}/api/surveys/${id}/archive`, { headers: this.headers() });
    return res.status();
  }

  async getSurveyResults(id: number) {
    const res = await this.request.get(`${API}/api/surveys/${id}/results`, { headers: this.headers() });
    return res.json();
  }

  async get(path: string) {
    const res = await this.request.get(`${API}${path}`, { headers: this.headers() });
    return { status: res.status(), text: await res.text(), headers: res.headers() };
  }

  async post(path: string, data?: unknown) {
    const res = await this.request.post(`${API}${path}`, {
      headers: this.headers(),
      data,
    });
    return { status: res.status(), text: await res.text(), headers: res.headers() };
  }
}
