/** Per-tenant activity_logs retention (main DB). */
const TENANT_ACTIVITY_LOG_RETENTION_DAYS = 15;
const TENANT_ACTIVITY_LOG_RETENTION_MS =
  TENANT_ACTIVITY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const TENANT_ACTIVITY_LOG_RETENTION_SECONDS =
  TENANT_ACTIVITY_LOG_RETENTION_DAYS * 24 * 60 * 60;

function tenantActivityLogRetentionCutoff() {
  return new Date(Date.now() - TENANT_ACTIVITY_LOG_RETENTION_MS);
}

/**
 * Merge optional admin date filters with the retention floor.
 * @returns {{ $gte: Date, $lte?: Date }}
 */
function tenantActivityLogCreatedAtFilter(startDate, endDate) {
  const cutoff = tenantActivityLogRetentionCutoff();
  const filter = { $gte: cutoff };

  if (startDate) {
    const start = new Date(startDate);
    if (!Number.isNaN(start.getTime()) && start > cutoff) {
      filter.$gte = start;
    }
  }
  if (endDate) {
    const end = new Date(endDate);
    if (!Number.isNaN(end.getTime())) {
      filter.$lte = end;
    }
  }

  return filter;
}

module.exports = {
  TENANT_ACTIVITY_LOG_RETENTION_DAYS,
  TENANT_ACTIVITY_LOG_RETENTION_MS,
  TENANT_ACTIVITY_LOG_RETENTION_SECONDS,
  tenantActivityLogRetentionCutoff,
  tenantActivityLogCreatedAtFilter,
};
