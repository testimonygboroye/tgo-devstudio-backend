const AuditLog = require('../models/AuditLog');

async function logAction({ action, actor, target, details, ipAddress }) {
  try {
    await AuditLog.create({
      action,
      actor: actor ? actor._id || actor : null,
      actorEmail: actor ? actor.email : null,
      target: target ? target._id || target : null,
      targetEmail: target ? target.email : null,
      details,
      ipAddress,
    });
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
}

module.exports = { logAction };
