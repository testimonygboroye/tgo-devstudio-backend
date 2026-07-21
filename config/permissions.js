module.exports = {
  INVITE_USERS: 'invite_users',
  APPROVE_ACCESS: 'approve_access',
  BLOCK_USERS: 'block_users',
  DELETE_USERS: 'delete_users',
  MANAGE_PERMISSIONS: 'manage_permissions',
  MANAGE_ROLES: 'manage_roles',
  VIEW_MESSAGES: 'view_messages',
  VIEW_REVIEWS: 'view_reviews',
  MODERATE_REVIEWS: 'moderate_reviews',
  MANAGE_CONTENT: 'manage_content',
  VIEW_AUDIT_LOG: 'view_audit_log',

  // Permissions in this list can never be handed to someone else in an invite,
  // even by a person who holds them — only the founder can grant them.
  FOUNDER_ONLY: ['delete_users', 'manage_roles', 'manage_permissions'],
};
