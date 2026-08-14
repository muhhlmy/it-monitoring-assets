-- =====================================================================
-- SKEMA DATABASE (PostgreSQL): KARYAWAN & ASSET
-- Dibuat berdasarkan file:
--   - Skema_Table_-_Table_Karyawan.csv
--   - Skema_Table_-_Table_Asset.csv
-- =====================================================================

-- =====================================================================
-- BUAT DATABASE (jika belum ada)
-- =====================================================================
-- CATATAN: PostgreSQL TIDAK mendukung sintaks "CREATE DATABASE IF NOT
-- EXISTS" secara native. Gunakan salah satu cara berikut:
--
-- CARA 1 (disarankan, via psql) — jalankan blok ini di psql, BUKAN di
-- dalam satu transaksi/file .sql biasa, karena CREATE DATABASE tidak
-- boleh dijalankan di dalam blok DO/transaksi:
--
--     SELECT 'CREATE DATABASE esb_trackit_db'
--     WHERE NOT EXISTS (
--         SELECT FROM pg_database WHERE datname = 'esb_trackit_db'
--     )\gexec
--
-- CARA 2 (via terminal, paling simpel):
--     psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'esb_trackit_db'" \
--       | grep -q 1 || psql -U postgres -c "CREATE DATABASE esb_trackit_db"
--
-- Setelah database dibuat, hubungkan ke database tersebut sebelum
-- menjalankan sisa skrip di bawah ini, misalnya:
--     \c esb_trackit_db
-- =====================================================================

SELECT 'CREATE DATABASE esb_trackit_db'
WHERE NOT EXISTS (
    SELECT FROM pg_database WHERE datname = 'esb_trackit_db'
)\gexec

\c esb_trackit_db

-- Hapus tabel jika sudah ada (urutan: asset dulu karena punya FK ke karyawan)
DROP TABLE IF EXISTS asset;
DROP TABLE IF EXISTS karyawan;

-- =====================================================================
-- TABEL: karyawan
-- =====================================================================
CREATE TABLE karyawan (
    id                          SERIAL          PRIMARY KEY,
    nik                         VARCHAR(20)     NOT NULL,
    nama_karyawan               VARCHAR(150)    NOT NULL,
    status                      VARCHAR(20)     NOT NULL,
    title                       VARCHAR(150)    NOT NULL,
    job_level                   VARCHAR(10)     NOT NULL,
    departemen                  VARCHAR(100)    NOT NULL,
    directorate                 VARCHAR(100)    NOT NULL,
    tanggal_mulai_bekerja       DATE            NOT NULL,
    employeement_status         VARCHAR(20)     NOT NULL,
    nik_atasan_langsung         VARCHAR(20),
    email_kantor                VARCHAR(150)    NOT NULL,

    CONSTRAINT uq_karyawan_nik UNIQUE (nik),
    CONSTRAINT uq_karyawan_email UNIQUE (email_kantor),

    -- Constraint: Status karyawan hanya boleh salah satu dari nilai berikut
    CONSTRAINT chk_karyawan_status
        CHECK (status IN ('Active', 'Outsource', 'Resigned')),

    -- Constraint: Employeement Status hanya boleh salah satu dari nilai berikut
    CONSTRAINT chk_karyawan_employeement_status
        CHECK (employeement_status IN ('Permanent', 'Contract')),

    -- Self reference: NIK Atasan Langsung merujuk ke NIK karyawan lain
    CONSTRAINT fk_karyawan_atasan
        FOREIGN KEY (nik_atasan_langsung) REFERENCES karyawan (nik)
);


-- =====================================================================
-- TABEL: asset
-- =====================================================================
CREATE TABLE asset (
    id                              SERIAL          PRIMARY KEY,
    hostname                        VARCHAR(50)     NOT NULL,
    serial_number                   VARCHAR(50)     NOT NULL,
    spesifikasi                     VARCHAR(255),
    nik_pemegang_asset               VARCHAR(20),
    nama_karyawan_pemegang_asset     VARCHAR(150),
    departemen_pemegang_asset        VARCHAR(100),
    lokasi_asset                    VARCHAR(100),
    tipe_perangkat                  VARCHAR(50),
    brand_merek                     VARCHAR(50),
    model                           VARCHAR(100),
    status                          VARCHAR(20)     NOT NULL,
    kondisi                         VARCHAR(20)     NOT NULL,
    note_asset                      VARCHAR(255),

    CONSTRAINT uq_asset_hostname UNIQUE (hostname),
    CONSTRAINT uq_asset_serial_number UNIQUE (serial_number),

    -- ============================================================
    -- CONSTRAINT UTAMA YANG DIMINTA
    -- ============================================================

    -- Kolom asset.status hanya boleh salah satu dari nilai berikut
    CONSTRAINT chk_asset_status
        CHECK (status IN ('In Use', 'Stock', 'Damaged', 'In Service', 'Disposal')),

    -- Kolom asset.kondisi hanya boleh salah satu dari nilai berikut
    CONSTRAINT chk_asset_kondisi
        CHECK (kondisi IN ('Baru', 'Normal', 'Rusak Ringan', 'Rusak Sedang', 'Rusak Berat')),

    -- Relasi ke tabel karyawan (pemegang asset)
    CONSTRAINT fk_asset_pemegang
        FOREIGN KEY (nik_pemegang_asset) REFERENCES karyawan (nik)
);

-- =====================================================================
-- INDEX TAMBAHAN (opsional, mempercepat pencarian/join)
-- =====================================================================
CREATE INDEX idx_asset_status ON asset (status);
CREATE INDEX idx_asset_kondisi ON asset (kondisi);
CREATE INDEX idx_asset_nik_pemegang ON asset (nik_pemegang_asset);
CREATE INDEX idx_karyawan_nik_atasan ON karyawan (nik_atasan_langsung);

-- =====================================================================
-- CATATAN
-- =====================================================================
-- 1. Menggunakan tipe SERIAL (PostgreSQL) untuk auto-increment primary key.
--    Jika ingin memakai PostgreSQL 10+ dengan standar SQL terbaru, SERIAL
--    bisa diganti menjadi:
--        id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
-- 2. CHECK constraint di PostgreSQL berlaku aktif secara native (berbeda
--    dengan MySQL versi lama yang mengabaikannya).
-- 3. Nilai contoh pada CSV asli ("In Use / Stock / Damaged / In Service /
--    Disposal" dan "Baru / Normal / Rusak Ringan / Rusak Sedang /
--    Rusak Berat") merupakan daftar nilai valid (enumerasi), sehingga
--    dijadikan isi CHECK constraint, bukan data baris.
-- 4. Kolom nik_pemegang_asset dibiarkan boleh NULL karena tidak semua
--    asset tentu sedang dipegang oleh karyawan (misal status 'Stock'
--    atau 'Disposal').
-- 5. Alternatif: jika ingin memakai native ENUM PostgreSQL (bukan CHECK),
--    bisa dibuat seperti berikut sebagai pengganti kolom VARCHAR + CHECK:
--
--    CREATE TYPE asset_status_enum AS ENUM
--        ('In Use', 'Stock', 'Damaged', 'In Service', 'Disposal');
--    CREATE TYPE asset_kondisi_enum AS ENUM
--        ('Baru', 'Normal', 'Rusak Ringan', 'Rusak Sedang', 'Rusak Berat');
--
--    ...lalu ganti tipe kolom status/kondisi menjadi
--    asset_status_enum / asset_kondisi_enum. Pendekatan CHECK di atas
--    dipilih karena lebih fleksibel untuk menambah/mengubah nilai di
--    kemudian hari tanpa perlu ALTER TYPE.
-- =====================================================================