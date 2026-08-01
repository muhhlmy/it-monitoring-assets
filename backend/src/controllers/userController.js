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

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseUserId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0 || String(id) !== String(value)) {
    throw createHttpError(400, "ID pengguna tidak valid.");
  }
  return id;
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

const SUPERADMIN_PERMISSIONS = {
  dashboard: "full",
  assets: "full",
  my_assets: "full",
  tickets: "full",
  submissions: "full",
  users: "full",
  logs: "full",
  karyawan: "full",
  export: "full",
};

const DEFAULT_USER_PERMISSIONS = {
  dashboard: "none",
  assets: "none",
  my_assets: "read_only",
  tickets: "read_only",
  submissions: "none",
  users: "none",
  logs: "none",
  karyawan: "none",
  export: "none",
};

function normaliseLegacyPermissions(raw) {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_USER_PERMISSIONS };
  const KEYS = Object.keys(DEFAULT_USER_PERMISSIONS);
  const out = {};
  for (const k of KEYS) {
    const v = raw[k];
    if (v === "none" || v === "read_only" || v === "full") {
      out[k] = v;
    } else if (v === true) {
      out[k] = "read_only";
    } else {
      out[k] = "none";
    }
  }
  return out;
}

// Helper untuk sync mapping user_ticket_queues
async function syncUserQueues(queryable, userId, queueIds) {
  if (!Array.isArray(queueIds)) return;
  await queryable.query("DELETE FROM user_ticket_queues WHERE user_id = $1", [
    userId,
  ]);
  for (const qId of queueIds) {
    const validId = parseInt(qId, 10);
    if (!isNaN(validId)) {
      await queryable.query(
        `INSERT INTO user_ticket_queues (user_id, queue_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, validId],
      );
    }
  }
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
      GROUP BY u.id
      ORDER BY u.id DESC`,
  );

  const rows = result.rows.map((user) => {
    const isSuper = isSuperAdminRole(user.role);
    user.permissions = isSuper
      ? SUPERADMIN_PERMISSIONS
      : normaliseLegacyPermissions(user.permissions);
    user.queue_ids = (user.queues || []).map((q) => q.id);
    return user;
  });
  res.json(rows);
}

export async function storeUser(req, res) {
  const { nama, email, password, role, permissions, queue_ids } = req.body;
  const currentUserRole = normalizeUserManagementRole(req.user?.role);
  const newRole = parseRequestedRole(role, USER_MANAGEMENT_ROLES.USER);

  assertValidPermissions(permissions);
  assertAdminHasNoQueueGrant(currentUserRole, queue_ids);

  const userPermissions =
    newRole === USER_MANAGEMENT_ROLES.SUPERADMIN
      ? SUPERADMIN_PERMISSIONS
      : normaliseLegacyPermissions(permissions);

  if (!canCreateManagedUser(currentUserRole, newRole, userPermissions)) {
    throw createHttpError(
      403,
      "Admin hanya dapat membuat akun user tanpa permission sensitif.",
    );
  }

  if (!nama || !email || !password) {
    throw createHttpError(400, "Nama, email, dan password wajib diisi.");
  }

  const newUser = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO users (nama, email, password, role, permissions, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, nama, email, role, permissions, is_active, dibuat_pada, diperbarui_pada`,
      [
        String(nama).trim(),
        String(email).trim().toLowerCase(),
        String(password),
        newRole,
        JSON.stringify(userPermissions),
        true,
      ],
    );

    const createdUser = result.rows[0];
    if (
      currentUserRole === USER_MANAGEMENT_ROLES.SUPERADMIN &&
      Array.isArray(queue_ids)
    ) {
      await syncUserQueues(client, createdUser.id, queue_ids);
    }

    const qResult = await client.query(
      `SELECT q.id, q.kode, q.nama FROM user_ticket_queues utq JOIN ticket_queues q ON q.id = utq.queue_id WHERE utq.user_id = $1`,
      [createdUser.id],
    );
    createdUser.queues = qResult.rows;
    createdUser.queue_ids = qResult.rows.map((q) => q.id);
    return createdUser;
  });

  res.status(201).json(newUser);
}

export async function replaceUser(req, res) {
  const id = parseUserId(req.params.id);
  const currentUserRole = normalizeUserManagementRole(req.user?.role);
  const requestedRole =
    req.body.role === undefined
      ? undefined
      : parseRequestedRole(req.body.role, undefined);

  assertValidPermissions(req.body.permissions);
  assertAdminHasNoQueueGrant(currentUserRole, req.body.queue_ids);

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
    const oldUserResult = await client.query(
      `SELECT id, nama, email, password, role, permissions, is_active
         FROM users
        WHERE id = $1
        FOR UPDATE`,
      [id],
    );
    if (oldUserResult.rowCount === 0) {
      throw createHttpError(404, "Pengguna tidak ditemukan.");
    }
    const oldUser = oldUserResult.rows[0];
    const oldRole = normalizeUserManagementRole(oldUser.role);

    let { nama, email, password, role, permissions, is_active, queue_ids } =
      req.body;

    role = requestedRole ?? oldRole;
    const userPermissions =
      role === USER_MANAGEMENT_ROLES.SUPERADMIN
        ? SUPERADMIN_PERMISSIONS
        : normaliseLegacyPermissions(
            permissions === undefined ? oldUser.permissions : permissions,
          );

    if (!canUpdateManagedUser(currentUserRole, oldRole, role, userPermissions)) {
      throw createHttpError(
        403,
        "Admin hanya dapat memperbarui akun user tanpa mengubah role atau permission sensitif.",
      );
    }

    if (!nama || !email) {
      throw createHttpError(400, "Nama dan email wajib diisi.");
    }

    if (
      oldRole === USER_MANAGEMENT_ROLES.SUPERADMIN ||
      role === USER_MANAGEMENT_ROLES.SUPERADMIN
    ) {
      is_active = true;
    } else {
      is_active = is_active !== false;
    }

    const roleGuard =
      currentUserRole === USER_MANAGEMENT_ROLES.ADMIN
        ? " AND LOWER(TRIM(role)) = 'user'"
        : "";

    let result;
    if (password && String(password).trim() !== "") {
      result = await client.query(
        `UPDATE users
            SET nama = $1, email = $2, password = $3, role = $4, permissions = $5, is_active = $6, diperbarui_pada = CURRENT_TIMESTAMP
          WHERE id = $7${roleGuard}
          RETURNING id, nama, email, role, permissions, is_active, dibuat_pada, diperbarui_pada`,
        [
          String(nama).trim(),
          String(email).trim().toLowerCase(),
          String(password),
          role,
          JSON.stringify(userPermissions),
          is_active,
          id,
        ],
      );
    } else {
      result = await client.query(
        `UPDATE users
            SET nama = $1, email = $2, role = $3, permissions = $4, is_active = $5, diperbarui_pada = CURRENT_TIMESTAMP
          WHERE id = $6${roleGuard}
          RETURNING id, nama, email, role, permissions, is_active, dibuat_pada, diperbarui_pada`,
        [
          String(nama).trim(),
          String(email).trim().toLowerCase(),
          role,
          JSON.stringify(userPermissions),
          is_active,
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
      Array.isArray(queue_ids)
    ) {
      await syncUserQueues(client, transactionUser.id, queue_ids);
    }

    const qResult = await client.query(
      `SELECT q.id, q.kode, q.nama FROM user_ticket_queues utq JOIN ticket_queues q ON q.id = utq.queue_id WHERE utq.user_id = $1`,
      [transactionUser.id],
    );
    transactionUser.queues = qResult.rows;
    transactionUser.queue_ids = qResult.rows.map((q) => q.id);
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

  await withTransaction(async (client) => {
    const oldUserResult = await client.query(
      `SELECT role
         FROM users
        WHERE id = $1
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
      `DELETE FROM users
        WHERE id = $1
          AND LOWER(TRIM(role)) NOT IN ('superadmin', 'super admin')
        RETURNING id`,
      [id],
    );
    if (result.rowCount === 0) {
      throw createHttpError(
        409,
        "Role pengguna berubah selama permintaan diproses. Silakan muat ulang data.",
      );
    }
  });

  res.json({ message: "Pengguna berhasil dihapus." });
}
