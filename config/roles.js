const ROLE_RANK = {
  founder: 0,
  super_admin: 1,
  admin: 2,
  team_lead: 3,
  collaborator: 4,
};

function idsEqual(a, b) {
  return a && b && a.toString() === b.toString();
}

function pathIncludes(path, id) {
  return (path || []).some((entry) => idsEqual(entry, id));
}

/**
 * Determines whether `actor` has management authority over `target`.
 * Combines three layers:
 *   1. Rank gate — you can never manage someone at or above your own rank.
 *   2. Natural lineage — your own invite subtree, optionally depth-limited
 *      or with specific people excluded (founder-configurable).
 *   3. Explicit additional grants — authority over people outside your
 *      natural lineage, assigned individually by the founder.
 * The founder always has full authority, unconditionally.
 */
function canManage(actor, target) {
  if (actor.role === 'founder') return true;
  if (idsEqual(actor._id, target._id)) return false;

  if (ROLE_RANK[actor.role] >= ROLE_RANK[target.role]) return false;

  if (pathIncludes(actor.deniedManaged, target._id)) return false;

  const ancestorIndex = (target.lineagePath || []).findIndex((id) => idsEqual(id, actor._id));
  if (ancestorIndex !== -1) {
    const depthFromActor = target.lineagePath.length - ancestorIndex;
    const maxDepth = actor.managementScope && actor.managementScope.depth;
    if (maxDepth === null || maxDepth === undefined || depthFromActor <= maxDepth) {
      return true;
    }
  }

  const grants = actor.additionalManaged || [];
  for (const grant of grants) {
    if (idsEqual(grant.userId, target._id)) return true;
    if (grant.includeSubtree && pathIncludes(target.lineagePath, grant.userId)) return true;
  }

  return false;
}

module.exports = { ROLE_RANK, canManage };
