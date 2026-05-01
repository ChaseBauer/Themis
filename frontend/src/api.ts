import axios from 'axios'
import type {
  AppSettings,
  ChangeComment,
  ChangeDetail,
  ChangesPage,
  ConfigChange,
  ConfigDrift,
  DashboardStats,
  Device,
  DeviceHealth,
  GoldenConfig,
  User,
} from './types'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('themis-token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('themis-token')
      localStorage.removeItem('themis-user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

// Auth
export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ token: string; user: User }>('/auth/login', { username, password }),
  register: (username: string, email: string, password: string) =>
    api.post<{ token: string; user: User }>('/auth/register', { username, email, password }),
  me: () => api.get<User>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put<User>('/auth/password', {
      current_password: currentPassword,
      new_password: newPassword,
    }),
  oauthConfig: () =>
    api.get<{ enabled: boolean; provider_name: string }>('/auth/oauth/config'),
}

// Devices
export const devicesApi = {
  list: () => api.get<Device[]>('/devices'),
  get: (id: string) => api.get<Device>(`/devices/${id}`),
  create: (data: Omit<Device, 'id' | 'created_at' | 'created_by' | 'tags'> & { ssh_password?: string; tags?: string[] }) =>
    api.post<Device>('/devices', data),
  update: (id: string, data: Partial<Device> & { ssh_password?: string; config_pull_command?: string | null; tags?: string[] }) =>
    api.put<Device>(`/devices/${id}`, data),
  delete: (id: string) => api.delete(`/devices/${id}`),
  testConnection: (id: string) =>
    api.post<{ success: boolean; steps: { label: string; ok: boolean; detail?: string }[] }>(`/devices/${id}/test-connection`),
  onboard: (id: string) =>
    api.post<{ config: string; version: number }>(`/devices/${id}/onboard`),
  revertGoldenWs: (id: string, goldenConfigId?: string): WebSocket => {
    const token = localStorage.getItem('themis-token') ?? ''
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const params = new URLSearchParams({ token })
    if (goldenConfigId) params.set('golden_config_id', goldenConfigId)
    return new WebSocket(`${proto}//${window.location.host}/api/devices/${id}/revert-golden?${params}`)
  },
  healthCheckAll: () => api.get<DeviceHealth[]>('/devices/health'),
  healthCheck: (id: string) => api.get<DeviceHealth>(`/devices/${id}/health`),
}

// Changes
export const changesApi = {
  listAll: (params?: { status?: string; search?: string; page?: number; limit?: number }) =>
    api.get<ChangesPage>('/changes', { params }),
  listForDevice: (deviceId: string) =>
    api.get<ConfigChange[]>(`/devices/${deviceId}/changes`),
  get: (id: string) => api.get<ChangeDetail>(`/changes/${id}`),
  create: (
    deviceId: string,
    data: {
      title: string
      description?: string
      config_diff: string
      scheduled_at?: string
      scheduled_save_as_golden?: boolean
    },
  ) => api.post<ConfigChange>(`/devices/${deviceId}/changes`, data),
  createBatch: (data: {
    device_ids: string[]
    title: string
    description?: string
    config_diff: string
    scheduled_at?: string
    scheduled_save_as_golden?: boolean
  }) => api.post<ConfigChange[]>('/changes/batch', data),
  update: (
    id: string,
    data: {
      title: string
      description?: string
      config_diff: string
      scheduled_at?: string
      scheduled_save_as_golden?: boolean
    },
  ) => api.put<ChangeDetail>(`/changes/${id}`, data),
  delete: (id: string) => api.delete(`/changes/${id}`),
  approve: (id: string, comment?: string) =>
    api.post<ChangeDetail>(`/changes/${id}/approve`, { comment }),
  unapprove: (id: string) =>
    api.post<ChangeDetail>(`/changes/${id}/unapprove`),
  reject: (id: string, comment?: string) =>
    api.post<ChangeDetail>(`/changes/${id}/reject`, { comment }),
  deploy: (id: string, saveAsGolden?: boolean) =>
    api.post<ChangeDetail>(`/changes/${id}/deploy`, { save_as_golden: saveAsGolden }),
  listComments: (id: string) =>
    api.get<ChangeComment[]>(`/changes/${id}/comments`),
  createComment: (
    id: string,
    data: {
      content: string
      parent_comment_id?: string
      line_start?: number
      line_end?: number
      line_snapshot?: string
    },
  ) => api.post<ChangeComment>(`/changes/${id}/comments`, data),
  resolveComment: (changeId: string, commentId: string) =>
    api.post<ChangeComment>(`/changes/${changeId}/comments/${commentId}/resolve`),
  deleteComment: (changeId: string, commentId: string) =>
    api.delete(`/changes/${changeId}/comments/${commentId}`),
}

// Golden Configs
export const goldenConfigsApi = {
  listForDevice: (deviceId: string) =>
    api.get<GoldenConfig[]>(`/devices/${deviceId}/golden-configs`),
  create: (deviceId: string, config: string) =>
    api.post<GoldenConfig>(`/devices/${deviceId}/golden-configs`, { config }),
}

// Users
export const usersApi = {
  list: () => api.get<User[]>('/users'),
}

// Admin
export const adminApi = {
  listUsers: () => api.get<User[]>('/admin/users'),
  updateUserRole: (userId: string, role: string) =>
    api.put<User>(`/admin/users/${userId}/role`, { role }),
  getSettings: () => api.get<AppSettings>('/admin/settings'),
  updateSettings: (data: Partial<AppSettings>) =>
    api.put<AppSettings>('/admin/settings', data),
}

// Drift
export const driftApi = {
  listOpen: () => api.get<ConfigDrift[]>('/drift'),
  getForDevice: (deviceId: string) =>
    api.get<ConfigDrift | null>(`/devices/${deviceId}/drift`),
  accept: (driftId: string, title?: string) =>
    api.post<ConfigDrift>(`/drift/${driftId}/accept`, { title }),
  dismiss: (driftId: string) =>
    api.post<ConfigDrift>(`/drift/${driftId}/dismiss`),
}

// Stats
export const statsApi = {
  get: () => api.get<DashboardStats>('/stats'),
}
