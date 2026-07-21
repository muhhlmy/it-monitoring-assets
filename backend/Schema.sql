CREATE TABLE IF NOT EXISTS karyawan (
    id_karyawan BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nik VARCHAR(30) NOT NULL UNIQUE,
    nama_karyawan VARCHAR(150) NOT NULL,
    email_kantor VARCHAR(150) UNIQUE,
    lokasi_kerja VARCHAR(100),
    status_karyawan VARCHAR(30),
    jabatan VARCHAR(100),
    folder_karyawan VARCHAR(255),
    tingkat_jabatan VARCHAR(50),
    departemen VARCHAR(100),
    direktorat VARCHAR(100),
    tanggal_mulai_bekerja DATE,
    jenis_perjanjian_kerja VARCHAR(50),
    status_kepegawaian VARCHAR(50),
    id_atasan_langsung BIGINT NULL,
    dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    diperbarui_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_atasan_langsung
        FOREIGN KEY (id_atasan_langsung)
        REFERENCES karyawan (id_karyawan)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS aset_ti (
    id_aset BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nomor_seri VARCHAR(100) UNIQUE,
    label_aset VARCHAR(100) NOT NULL UNIQUE,
    spesifikasi TEXT,
    id_karyawan BIGINT NULL,
    lokasi_aset VARCHAR(100),
    tipe_perangkat VARCHAR(50),
    merek VARCHAR(100),
    model VARCHAR(100),
    status_aset VARCHAR(30),
    kondisi_aset VARCHAR(30),
    catatan_aset TEXT,
    dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    diperbarui_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_aset_karyawan
        FOREIGN KEY (id_karyawan)
        REFERENCES karyawan (id_karyawan)
        ON DELETE SET NULL
);

-- Menambahkan kolom juga pada database lama yang tabelnya sudah tersedia.
ALTER TABLE aset_ti
    ADD COLUMN IF NOT EXISTS lokasi_aset VARCHAR(100);

CREATE OR REPLACE VIEW daftar_aset_ti_lengkap AS
SELECT
    a.id_aset,
    a.nomor_seri,
    a.label_aset,
    a.spesifikasi,
    k.nik,
    k.nama_karyawan,
    k.departemen,
    CASE
        WHEN a.id_karyawan IS NOT NULL THEN k.lokasi_kerja
        ELSE a.lokasi_aset
    END AS lokasi_kerja,
    a.tipe_perangkat,
    a.merek,
    a.model,
    a.status_aset,
    a.kondisi_aset,
    a.catatan_aset,
    a.lokasi_aset
FROM aset_ti AS a
LEFT JOIN karyawan AS k
    ON k.id_karyawan = a.id_karyawan;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nama VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    diperbarui_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS log_riwayat_aset (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_aset BIGINT NULL,
    label_aset VARCHAR(100) NOT NULL,
    aksi VARCHAR(50) NOT NULL, -- 'TAMBAH', 'UBAH', 'HAPUS'
    perubahan TEXT NOT NULL,
    oleh_pengguna VARCHAR(150) NOT NULL,
    dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS log_audit_login (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nama_pengguna VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    aktifitas VARCHAR(100) NOT NULL, -- 'LOGIN', 'LOGOUT', 'GAGAL_LOGIN'
    ip_address VARCHAR(50),
    browser VARCHAR(255),
    dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
