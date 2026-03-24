const defaultAdminHosts = new Set(['admin.staging.tinychok.ru', 'admin.tinychok.ru'])

function getHostname() {
  if (typeof window === 'undefined') {
    return ''
  }

  return window.location.hostname.toLowerCase()
}

export function shouldRenderAdminApp() {
  const hostname = getHostname()
  if (!hostname) {
    return false
  }

  if (defaultAdminHosts.has(hostname)) {
    return true
  }

  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1'
  return isLocalHost && window.location.pathname.startsWith('/admin')
}

export function isAllowedAdminHost(configHosts: string[]) {
  const hostname = getHostname()
  if (!hostname) {
    return false
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return true
  }

  return configHosts.map((host) => host.toLowerCase()).includes(hostname)
}
