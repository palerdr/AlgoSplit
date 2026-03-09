// Re-export API modules - import directly from each module to avoid naming conflicts
// e.g. import { getSplits } from '@/api/splits.api'
// or import { analyzeSplit } from '@/api/analysis.api'

export { apiClient, getErrorMessage, tokenStore, onAuthLogout } from './client';
export { login, signup, getCurrentUser, logout } from './auth.api';
export { bodyweightKeys, getBodyweightEntries, createBodyweightEntry, batchCreateBodyweightEntries, deleteBodyweightEntry } from './bodyweight.api';
