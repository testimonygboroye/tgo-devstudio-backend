// Lower number = higher authority. Used to enforce that someone can only
// act on accounts strictly below their own rank (except the founder, who
// is checked separately and always has full authority).

const ROLE_RANK = {
  founder: 0,
  super_admin: 1,
  admin: 2,
  team_lead: 3,
  collaborator: 4,
};

function isAboveOrEqual(actorRole, targetRole) {
  // true if actor's rank is numerically higher-or-equal (i.e. NOT strictly senior)
  return ROLE_RANK[actorRole] >= ROLE_RANK[targetRole];
}

function canManage(actorRole, targetRole) {
  if (actorRole === 'founder') return true;
  return ROLE_RANK[actorRole] < ROLE_RANK[targetRole];
}

module.exports = { ROLE_RANK, isAboveOrEqual, canManage };
