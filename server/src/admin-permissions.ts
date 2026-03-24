import type {
  AdminPermission,
} from '../../src/shared/backend'
import type { StaffRole } from '../../src/shared/types'

const permissionsByRole: Record<StaffRole, readonly AdminPermission[]> = {
  moderator: [
    'admin.access',
    'dashboard.read',
    'users.read',
    'users.block',
    'reports.read',
    'reports.note',
    'reports.resolve',
    'media.read',
    'media.moderate',
    'audit.read',
  ],
  owner: [
    'admin.access',
    'dashboard.read',
    'users.read',
    'users.block',
    'users.premium.write',
    'reports.read',
    'reports.note',
    'reports.resolve',
    'media.read',
    'media.moderate',
    'audit.read',
    'staff.manage',
  ],
  support: [
    'admin.access',
    'dashboard.read',
    'users.read',
    'users.premium.write',
    'reports.read',
    'reports.note',
    'media.read',
    'audit.read',
  ],
}

export function getAdminPermissionsForRole(role?: StaffRole | null): AdminPermission[] {
  if (!role) {
    return []
  }

  return [...permissionsByRole[role]]
}

export function hasAdminPermission(
  role: StaffRole | undefined | null,
  permission: AdminPermission,
) {
  return getAdminPermissionsForRole(role).includes(permission)
}
