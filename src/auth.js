export function getAuthHeaders() {
  const token = localStorage.getItem('appAuthToken') || sessionStorage.getItem('appAuthToken')
  return token ? { Authorization: `Bearer ${token}` } : {}
}
