// Central definition of every grantable permission in the system.
// Adding a new capability anywhere in the app should mean adding a
// constant here first, then checking it in the route — never a raw string.

module.exports = {
  INVITE_USERS: 'invite_users',
  APPROVE_ACCESS: 'approve_access',
  BLOCK_USERS: 'block_users',
  MANAGE_PERMISSIONS: 'manage_permissions',
  VIEW_MESSAGES: 'view_messages',
  VIEW_REVIEWS: 'view_reviews',
  MODERATE_REVIEWS: 'moderate_reviews',
  MANAGE_CONTENT: 'manage_content',
  VIEW_AUDIT_LOG: 'view_audit_log',
};
