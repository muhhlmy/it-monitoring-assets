import { pool, withTransaction } from "../config/database.js";
import {
  USER_MANAGEMENT_ROLES,
  canCreateManagedUser,
  canDeleteManagedUser,
  canUpdateManagedUser,
  hasSensitiveUserPermission,
  isSuperAdminRole,
  isValidUserPermissionPayload,
  normalizeUserManagementRole,
} from "../services/userAccessService.js";
import {
  DEFAULT_USER_PERMISSIONS,
  SUPERADMIN_PERMISSIONS,
  normalizePermissions,
} from "../services/permissionService.js";
import { hashPassword } from "../security/passwordService.js";
import {
  assertAllowedFields,
  assertPlainObject,
  createHttpError,
  parseNewPassword,
  parseOptionalBoolean,
  parsePositiveIntegerParam,
  parseQueueIds,
  parseRequiredEmail,
  parseRequiredName,
} from "../security/requestValidation.js";

const USER_CREATE_FIELDS = new Set([
  "nama",
  "email",
  "password",
  "role",
  "permissions",
  "queue_ids",
  "is_active",
]);
const USER_UPDATE_FIELDS = USER_CREATE_FIELDS;

function parseUserId(value) {
  return parsePositiveIntegerParam(value, "ID pengguna");
}

function parseRequestedRole(value, fallback) {
  const role = normalizeUserManagementRole(value ?? fallback);
  if (role === USER_MANAGEMENT_ROLES.UNKNOWN) {
    throw createHttpError(400, "Role pengguna tidak valid.");
  }
  return role;
}

function assertValidPermissions(permissions) {
  if (!isValidUserPermissionPayload(permissions)) {
    throw createHttpError(400, "Payload permission pengguna tidak valid.");
  }
}

function assertAdminHasNoQueueGrant(actorRole, queueIds) {
  if (
    normalizeUserManagementRole(actorRole) === USER_MANAGEMENT_ROLES.ADMIN &&
    Array.isArray(queueIds) &&
    queueIds.length > 0
  ) {
    throw createHttpError(
      403,
      "Admin tidak dapat memberikan assignment queue kepada pengguna.",
    );
  }
}

// Helper untuk sync mapping user_ticket_queues
async function syncUserQueues(queryable, userId, queueIds) {
  if (!Array.isArray(queueIds)) return;
  await queryable.query("DELETE FROM user_ticket_queues WHERE user_id = $1", [
    userId,
  ]);
  for (const queueId of queueIds) {
    await queryable.query(
      `INSERT INTO user_ticket_queues (user_id, queue_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, queueId],
    );
  }
}

async function lockActiveSuperadmins(queryable) {
  const result = await queryable.query(
    `SELECT id
       FROM users
      WHERE is_active = true
        AND deleted_at IS NULL
        AND LOWER(TRIM(role)) IN ('superadmin', 'super admin')
      ORDER BY id
      FOR UPDATE`,
  );
  return result.rows.map((row) => Number(row.id)).filter(Number.isSafeInteger);
}

export async function listUsers(req, res) {
  const result = await pool.query(
    `SELECT u.id, u.nama, u.email, u.role, u.permissions, u.is_active, u.dibuat_pada, u.diperbarui_pada,
            COALESCE(
              JSON_AGG(
                JSON_BUILD_OBJECT('id', q.id, 'kode', q.kode, 'nama', q.nama)
              ) FILTER (WHERE q.id IS NOT NULL), '[]'
            ) AS queues
       FROM users u
       LEFT JOIN user_ticket_queues utq ON utq.user_id = u.id
       LEFT JOIN ticket_queues q ON q.id = utq.queue_id AND q.is_active = true
      WHERE u.deleted_at IS NULL
      GROUP BY u.id
      ORDER BY u.id DESC`,
  );

  const rows = result.rows.map((user) => {
    const isSuper = isSuperAdminRole(user.role);
    user.permissions = isSuper
      ? { ...SUPERADMIN_PERMISSIONS }
      : normalizePermissions(user.permissions, { defaults: DEFAULT_USER_PERMISSIONS });
    user.queue_ids = (user.queues || []).map((q) => Number(q.id)).filter(Number.isSafeInteger);
    return user;
  });
  res.json(rows);
}

export async function storeUser(req, res) {
  assertPlainObject(req.body, "Payload pengguna harus berupa object JSON.");
  assertAllowedFields(req.body, USER_CREATE_FIELDS, "Payload pengguna");

  const { role, permissions } = req.body;
  const nama = parseRequiredName(req.body.nama);
  const email = parseRequiredEmail(req.body.email);
  const password = parseNewPassword(req.body.password);
  const queueIds = parseQueueIds(req.body.queue_ids);
  const requestedActive = parseOptionalBoolean(req.body.is_active, "is_active");
  const currentUserRole = normalizeUserManagementRole(req.user?.role);
  const newRole = parseRequestedRole(role, USER_MANAGEMENT_ROLES.USER);

  assertValidPermissions(permissions);
  assertAdminHasNoQueueGrant(currentUserRole, queueIds);

  const userPermissions =
    newRole === USER_MANAGEMENT_ROLES.SUPERADMIN
      ? { ...SUPERADMIN_PERMISSIONS }
      : normalizePermissions(permissions, {
          defaults: permissions === undefined ? DEFAULT_USER_PERMISSIONS : {},
        });

  if (!canCreateManagedUser(currentUserRole, newRole, userPermissions)) {
    throw createHttpError(
      403,
      "Admin hanya dapat membuat akun user tanpa permission sensitif.",
    );
  }

  const passwordHash = await hashPassword(password);
  const isActive = requestedActive ?? true;

  const newUser = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO users (nama, email, password, role, permissions, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, nama, email, role, permissions, is_active, dibuat_pada, diperbarui_pada`,
      [
        nama,
        email,
        passwordHash,
        newRole,
        JSON.stringify(userPermissions),
        isActive,
      ],
    );

    const createdUser = result.rows[0];
    if (
      currentUserRole === USER_MANAGEMENT_ROLES.SUPERADMIN &&
      Array.isArray(queueIds)
    ) {
      await syncUserQueues(client, createdUser.id, queueIds);
    }

    const qResult = await client.query(
      `SELECT q.id, q.kode, q.nama FROM user_ticket_queues utq JOIN ticket_queues q ON q.id = utq.queue_id WHERE utq.user_id = $1`,
      [createdUser.id],
    );
    createdUser.queues = qResult.rows.map((q) => ({ ...q, id: Number(q.id) }));
    createdUser.queue_ids = qResult.rows.map((q) => Number(q.id)).filter(Number.isSafeInteger);
    return createdUser;
  });

  res.status(201).json(newUser);
}

export async function replaceUser(req, res) {
  assertPlainObject(req.body, "Payload pengguna harus berupa object JSON.");
  assertAllowedFields(req.body, USER_UPDATE_FIELDS, "Payload pengguna");

  const id = parseUserId(req.params.id);
  const currentUserRole = normalizeUserManagementRole(req.user?.role);
  const nama = parseRequiredName(req.body.nama);
  const email = parseRequiredEmail(req.body.email);
  const newPassword = parseNewPassword(req.body.password, { required: false });
  const passwordHash = newPassword === undefined ? undefined : await hashPassword(newPassword);
  const requestedActive = parseOptionalBoolean(req.body.is_active, "is_active");
  const queueIds = parseQueueIds(req.body.queue_ids);
  const requestedRole =
    req.body.role === undefined
      ? undefined
      : parseRequestedRole(req.body.role, undefined);

  assertValidPermissions(req.body.permissions);
  assertAdminHasNoQueueGrant(currentUserRole, queueIds);

  if (
    currentUserRole === USER_MANAGEMENT_ROLES.ADMIN &&
    (requestedRole === USER_MANAGEMENT_ROLES.ADMIN ||
      requestedRole === USER_MANAGEMENT_ROLES.SUPERADMIN ||
      hasSensitiveUserPermission(req.body.permissions))
  ) {
    throw createHttpError(
      403,
      "Admin tidak dapat mengubah role atau permission sensitif pengguna.",
    );
  }

  const updatedUser = await withTransaction(async (client) => {
    const activeSuperadminIds = await lockActiveSuperadmins(client);
    const oldUserResult = await client.query(
      `SELECT id, nama, email, password, role, permissions, is_active
         FROM users
        WHERE id = $1
          AND deleted_at IS NULL
        FOR UPDATE`,
      [id],
    );
    if (oldUserResult.rowCount === 0) {
      throw createHttpError(404, "Pengguna tidak ditemukan.");
    }
    const oldUser = oldUserResult.rows[0];
    const oldRole = normalizeUserManagementRole(oldUser.role);

    let { role, permissions } = req.body;

    role = requestedRole ?? oldRole;
    const oldPermissions = normalizePermissions(oldUser.permissions, {
      defaults: DEFAULT_USER_PERMISSIONS,
    });
    const userPermissions =
      role === USER_MANAGEMENT_ROLES.SUPERADMIN
        ? { ...SUPERADMIN_PERMISSIONS }
        : permissions === undefined
          ? oldPermissions
          : normalizePermissions(permissions, { defaults: {} });

    if (!canUpdateManagedUser(currentUserRole, oldRole, role, userPermissions)) {
      throw createHttpError(
        403,
        "Admin hanya dapat memperbarui akun user tanpa mengubah role atau permission sensitif.",
      );
    }

    const isActive = requestedActive ?? oldUser.is_active === true;
    const removesActiveSuperadmin =
      oldRole === USER_MANAGEMENT_ROLES.SUPERADMIN &&
      oldUser.is_active === true &&
      (role !== USER_MANAGEMENT_ROLES.SUPERADMIN || isActive !== true);
    if (
      removesActiveSuperadmin &&
      activeSuperadminIds.includes(id) &&
      activeSuperadminIds.length <= 1
    ) {
      throw createHttpError(409, "Superadmin aktif terakhir tidak dapat dinonaktifkan atau diturunkan role-nya.");
    }

    const roleGuard =
      currentUserRole === USER_MANAGEMENT_ROLES.ADMIN
        ? " AND LOWER(TRIM(role)) = 'user'"
        : "";

    let result;
    if (passwordHash !== undefined) {
      result = await client.query(
        `UPDATE users
            SET nama = $1, email = $2, password = $3, role = $4, permissions = $5, is_active = $6, diperbarui_pada = CURRENT_TIMESTAMP
          WHERE id = $7
            AND deleted_at IS NULL${roleGuard}
          RETURNING id, nama, email, role, permissions, is_active, dibuat_pada, diperbarui_pada`,
        [
          nama,
          email,
          passwordHash,
          role,
          JSON.stringify(userPermissions),
          isActive,
          id,
        ],
      );
    } else {
      result = await client.query(
        `UPDATE users
            SET nama = $1, email = $2, role = $3, permissions = $4, is_active = $5, diperbarui_pada = CURRENT_TIMESTAMP
          WHERE id = $6
            AND deleted_at IS NULL${roleGuard}
          RETURNING id, nama, email, role, permissions, is_active, dibuat_pada, diperbarui_pada`,
        [
          nama,
          email,
          role,
          JSON.stringify(userPermissions),
          isActive,
          id,
        ],
      );
    }

    if (result.rowCount === 0) {
      throw createHttpError(
        409,
        "Role pengguna berubah selama permintaan diproses. Silakan muat ulang data.",
      );
    }

    const transactionUser = result.rows[0];
    if (
      currentUserRole === USER_MANAGEMENT_ROLES.SUPERADMIN &&
      Array.isArray(queueIds)
    ) {
      await syncUserQueues(client, transactionUser.id, queueIds);
    }

    const qResult = await client.query(
      `SELECT q.id, q.kode, q.nama FROM user_ticket_queues utq JOIN ticket_queues q ON q.id = utq.queue_id WHERE utq.user_id = $1`,
      [transactionUser.id],
    );
    transactionUser.queues = qResult.rows.map((q) => ({ ...q, id: Number(q.id) }));
    transactionUser.queue_ids = qResult.rows.map((q) => Number(q.id)).filter(Number.isSafeInteger);
    transactionUser.permissions =
      role === USER_MANAGEMENT_ROLES.SUPERADMIN
        ? { ...SUPERADMIN_PERMISSIONS }
        : normalizePermissions(transactionUser.permissions, { defaults: userPermissions });
    return transactionUser;
  });

  res.json(updatedUser);
}

export async function destroyUser(req, res) {
  const currentUserRole = normalizeUserManagementRole(req.user?.role);
  if (currentUserRole !== USER_MANAGEMENT_ROLES.SUPERADMIN) {
    throw createHttpError(
      403,
      "Admin tidak memiliki akses untuk menghapus pengguna.",
    );
  }

  const id = parseUserId(req.params.id);
  const deletedByUserId = Number(req.user?.id);
  if (!Number.isSafeInteger(deletedByUserId) || deletedByUserId <= 0) {
    throw createHttpError(403, "Identitas actor penghapusan tidak valid.");
  }

  await withTransaction(async (client) => {
    const oldUserResult = await client.query(
      `SELECT role
         FROM users
        WHERE id = $1
          AND deleted_at IS NULL
        FOR UPDATE`,
      [id],
    );
    if (oldUserResult.rowCount === 0) {
      throw createHttpError(404, "Pengguna tidak ditemukan.");
    }

    const oldRole = oldUserResult.rows[0].role;
    if (!canDeleteManagedUser(currentUserRole, oldRole)) {
      throw createHttpError(403, "Akun superadmin tidak dapat dihapus.");
    }

    const result = await client.query(
      `UPDATE users
          SET is_active = false,
              deleted_at = CURRENT_TIMESTAMP,
              deleted_by_user_id = $2,
              deletion_reason = $3,
              diperbarui_pada = CURRENT_TIMESTAMP
        WHERE id = $1
          AND deleted_at IS NULL
          AND LOWER(TRIM(role)) NOT IN ('superadmin', 'super admin')
        RETURNING id`,
      [id, deletedByUserId, "Soft-delete melalui user management API."],
    );
    if (result.rowCount === 0) {
      throw createHttpError(
        409,
        "Role pengguna berubah selama permintaan diproses. Silakan muat ulang data.",
      );
    }
  });

  res.json({ message: "Pengguna berhasil dinonaktifkan dan dihapus secara logis." });
}
