export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  OPERATIONS_MANAGER: 'OPERATIONS_MANAGER',
  DISPATCHER: 'DISPATCHER',
  DATA_MANAGER: 'DATA_MANAGER',
  SUPPORT_AGENT: 'SUPPORT_AGENT',
  VIEWER: 'VIEWER'
};

const all = ['overview', 'live-map', 'routes', 'stops', 'paths', 'schedules', 'fleet', 'drivers', 'trips', 'eta', 'incidents', 'feedback', 'tickets', 'payments', 'imports', 'reports', 'settings', 'audit-logs'];

export const rolePermissions = {
  [ROLES.SUPER_ADMIN]: all.flatMap((module) => [`${module}:read`, `${module}:write`, `${module}:export`]),
  [ROLES.OPERATIONS_MANAGER]: ['overview:read', 'live-map:read', 'routes:read', 'routes:write', 'stops:read', 'stops:write', 'paths:read', 'paths:write', 'schedules:read', 'schedules:write', 'fleet:read', 'fleet:write', 'drivers:read', 'drivers:write', 'trips:read', 'trips:write', 'eta:read', 'eta:write', 'incidents:read', 'incidents:write', 'reports:read', 'reports:export'],
  [ROLES.DISPATCHER]: ['overview:read', 'live-map:read', 'fleet:read', 'fleet:write', 'trips:read', 'trips:write', 'eta:read', 'incidents:read', 'incidents:write'],
  [ROLES.DATA_MANAGER]: ['overview:read', 'routes:read', 'routes:write', 'stops:read', 'stops:write', 'paths:read', 'paths:write', 'schedules:read', 'schedules:write', 'imports:read', 'imports:write', 'reports:read', 'reports:export'],
  [ROLES.SUPPORT_AGENT]: ['overview:read', 'live-map:read', 'feedback:read', 'feedback:write', 'tickets:read', 'tickets:write', 'incidents:read'],
  [ROLES.VIEWER]: ['overview:read', 'live-map:read', 'routes:read', 'stops:read', 'paths:read', 'schedules:read', 'fleet:read', 'drivers:read', 'trips:read', 'eta:read', 'incidents:read', 'feedback:read', 'tickets:read', 'payments:read', 'imports:read', 'reports:read', 'settings:read']
};

export function permissionsFor(role) {
  return rolePermissions[role] || rolePermissions.VIEWER;
}

export function hasPermission(role, permission) {
  if (role === ROLES.SUPER_ADMIN) return true;
  return permissionsFor(role).includes(permission);
}

