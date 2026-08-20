export const TEST_USERS = {
  superadmin: {
    email: process.env.E2E_SUPERADMIN_EMAIL || 'superadmin@admin.com',
    password: process.env.E2E_SUPERADMIN_PASSWORD || 'admin123',
    role: 'superadmin',
    name: 'Super Admin',
  },
  admin: {
    email: process.env.E2E_ADMIN_EMAIL || 'admin@admin.com',
    password: process.env.E2E_ADMIN_PASSWORD || 'admin123',
    role: 'admin',
    name: 'Admin IT',
  },
  user: {
    email: process.env.E2E_USER_EMAIL || 'user@user.com',
    password: process.env.E2E_USER_PASSWORD || 'user12345',
    role: 'user',
    name: 'User Karyawan',
  },
}
