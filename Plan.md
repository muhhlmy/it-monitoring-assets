# Plan Implementasi Routing Tiket Berdasarkan Unit

## 1. Ringkasan

Dokumen ini menjelaskan rencana implementasi sistem routing tiket berdasarkan unit tujuan:

- **HR** — Human Resources
- **IT** — Information Technology
- **GA** — General Affairs
- **OPS** — Operations

Saat user membuat tiket, tiket akan masuk ke antrean atau **queue** unit yang sesuai. Admin hanya dapat melihat tiket dari unit yang menjadi tanggung jawabnya. Setelah itu, salah satu admin dapat mengambil tiket untuk dikerjakan.

Konsep utama yang digunakan:

- `queue_id` menentukan tiket masuk ke unit mana.
- `category_id` menentukan kategori detail tiket.
- `assigned_to_user_id` menentukan admin yang sedang menangani tiket.
- Relasi admin dengan unit disimpan dalam tabel penghubung agar satu unit dapat memiliki banyak admin dan satu admin dapat menangani lebih dari satu unit.

---

## 2. Tujuan

### 2.1 Tujuan Utama

1. Mengarahkan tiket secara otomatis berdasarkan unit yang dipilih user.
2. Membatasi admin agar hanya melihat tiket sesuai unit yang ditanganinya.
3. Mendukung lebih dari satu admin dalam satu unit.
4. Mendukung satu admin menangani beberapa unit.
5. Mencegah dua admin mengambil tiket yang sama.
6. Menghilangkan ketergantungan pada nama admin dalam kolom teks.
7. Menyediakan struktur yang mudah dikembangkan untuk SLA, notifikasi, eskalasi, dan laporan.

### 2.2 Hasil yang Diharapkan

Contoh alur:

1. User memilih unit **IT**.
2. User memilih kategori **Hardware**.
3. Tiket masuk ke antrean IT.
4. Semua Admin IT dapat melihat tiket tersebut.
5. Salah satu Admin IT menekan tombol **Ambil Tiket**.
6. Tiket menjadi milik admin tersebut.
7. Status tiket berubah dari `Open` menjadi `In Progress`.
8. Semua perubahan tercatat di log riwayat tiket.

---

## 3. Kondisi Sistem Saat Ini

Tabel `tickets` saat ini sudah memiliki beberapa kolom penting:

- `kategori`
- `prioritas`
- `status_tiket`
- `assigned_to`
- `pelapor`
- `dibuat_pada`
- `diperbarui_pada`

Namun, `kategori`, `assigned_to`, dan `pelapor` masih menggunakan teks biasa.

Risiko dari kondisi tersebut:

1. Nama admin dapat berubah.
2. Nama admin dapat salah ketik.
3. Tidak ada foreign key ke tabel `users`.
4. Sulit mendukung lebih dari satu admin untuk satu unit.
5. Sulit menentukan hak akses berdasarkan unit.
6. Tidak ada pemisahan antara unit tujuan dan kategori detail.
7. Sulit melakukan reporting yang konsisten.
8. Sulit menjaga integritas data.

---

## 4. Ruang Lingkup

### 4.1 Termasuk dalam Implementasi

- Penambahan master unit atau queue.
- Penambahan mapping admin ke unit.
- Penambahan master kategori tiket.
- Perubahan tabel `tickets`.
- Migrasi data tiket lama.
- Perubahan proses pembuatan tiket.
- Dashboard tiket berdasarkan unit admin.
- Fitur claim atau ambil tiket.
- Fitur assign dan reassign tiket.
- Validasi hak akses.
- Audit log.
- Index database.
- Pengujian.
- Rollout bertahap.

### 4.2 Tidak Termasuk pada Fase Awal

Fitur berikut dapat dikerjakan pada fase lanjutan:

- SLA otomatis.
- Eskalasi otomatis.
- Integrasi email.
- Integrasi WhatsApp.
- Push notification.
- Auto-assignment berdasarkan beban admin.
- Approval berjenjang.
- Integrasi Active Directory atau SSO.
- Knowledge base.
- Chat real-time.

---

## 5. Terminologi

| Istilah | Penjelasan |
|---|---|
| Queue | Unit tujuan tiket, seperti HR, IT, GA, dan OPS |
| Category | Kategori detail di dalam suatu queue |
| Reporter | User yang membuat tiket |
| Assignee | Admin yang menangani tiket |
| Claim | Proses admin mengambil tiket yang belum memiliki assignee |
| Reassign | Memindahkan tiket dari satu admin ke admin lain |
| Superadmin | User yang dapat melihat dan mengelola seluruh unit |
| Unit Admin | Admin yang hanya menangani queue tertentu |

---

## 6. Desain Arsitektur Data

Struktur relasi target:

```text
users
  ├── user_ticket_queues
  │       └── ticket_queues
  │               └── ticket_categories
  │
  └── tickets
          ├── queue_id
          ├── category_id
          ├── pelapor_user_id
          └── assigned_to_user_id
```

Penjelasan:

- `ticket_queues` menyimpan HR, IT, GA, dan OPS.
- `user_ticket_queues` menyimpan relasi admin dengan queue.
- `ticket_categories` menyimpan kategori detail setiap queue.
- `tickets.queue_id` menentukan tujuan tiket.
- `tickets.category_id` menentukan kategori detail.
- `tickets.pelapor_user_id` menyimpan user pembuat tiket.
- `tickets.assigned_to_user_id` menyimpan admin yang menangani tiket.

---

## 7. Perubahan Database

## 7.1 Membuat Tabel Queue

```sql
CREATE TABLE public.ticket_queues (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kode varchar(20) NOT NULL UNIQUE,
    nama varchar(100) NOT NULL,
    deskripsi text,
    is_active boolean NOT NULL DEFAULT true,
    dibuat_pada timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    diperbarui_pada timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Data Awal

```sql
INSERT INTO public.ticket_queues (kode, nama, deskripsi)
VALUES
    ('HR', 'Human Resources', 'Tiket terkait sumber daya manusia'),
    ('IT', 'Information Technology', 'Tiket terkait teknologi informasi'),
    ('GA', 'General Affairs', 'Tiket terkait fasilitas dan kebutuhan umum'),
    ('OPS', 'Operations', 'Tiket terkait aktivitas operasional');
```

---

## 7.2 Membuat Tabel Mapping Admin ke Queue

```sql
CREATE TABLE public.user_ticket_queues (
    user_id bigint NOT NULL,
    queue_id bigint NOT NULL,
    is_primary boolean NOT NULL DEFAULT false,
    dibuat_pada timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, queue_id),

    CONSTRAINT fk_user_ticket_queue_user
        FOREIGN KEY (user_id)
        REFERENCES public.users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_user_ticket_queue_queue
        FOREIGN KEY (queue_id)
        REFERENCES public.ticket_queues(id)
        ON DELETE CASCADE
);
```

Fungsi tabel ini:

- Satu queue dapat memiliki banyak admin.
- Satu admin dapat menangani banyak queue.
- Admin utama dapat ditandai dengan `is_primary`.
- Mapping dapat ditambah atau dihapus tanpa mengubah struktur tabel `users`.

---

## 7.3 Membuat Tabel Kategori Tiket

```sql
CREATE TABLE public.ticket_categories (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    queue_id bigint NOT NULL,
    kode varchar(50) NOT NULL,
    nama varchar(100) NOT NULL,
    deskripsi text,
    is_active boolean NOT NULL DEFAULT true,
    dibuat_pada timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    diperbarui_pada timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ticket_category_queue
        FOREIGN KEY (queue_id)
        REFERENCES public.ticket_queues(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_ticket_category
        UNIQUE (queue_id, kode)
);
```

### Contoh Data Kategori

```sql
INSERT INTO public.ticket_categories (queue_id, kode, nama)
SELECT id, 'HARDWARE', 'Hardware'
FROM public.ticket_queues
WHERE kode = 'IT';

INSERT INTO public.ticket_categories (queue_id, kode, nama)
SELECT id, 'SOFTWARE', 'Software'
FROM public.ticket_queues
WHERE kode = 'IT';

INSERT INTO public.ticket_categories (queue_id, kode, nama)
SELECT id, 'NETWORK', 'Network'
FROM public.ticket_queues
WHERE kode = 'IT';

INSERT INTO public.ticket_categories (queue_id, kode, nama)
SELECT id, 'PERIPHERAL', 'Peripheral'
FROM public.ticket_queues
WHERE kode = 'IT';

INSERT INTO public.ticket_categories (queue_id, kode, nama)
SELECT id, 'CUTI', 'Cuti dan Kehadiran'
FROM public.ticket_queues
WHERE kode = 'HR';

INSERT INTO public.ticket_categories (queue_id, kode, nama)
SELECT id, 'PAYROLL', 'Payroll'
FROM public.ticket_queues
WHERE kode = 'HR';

INSERT INTO public.ticket_categories (queue_id, kode, nama)
SELECT id, 'REKRUTMEN', 'Rekrutmen'
FROM public.ticket_queues
WHERE kode = 'HR';

INSERT INTO public.ticket_categories (queue_id, kode, nama)
SELECT id, 'GEDUNG', 'Gedung dan Fasilitas'
FROM public.ticket_queues
WHERE kode = 'GA';

INSERT INTO public.ticket_categories (queue_id, kode, nama)
SELECT id, 'KENDARAAN', 'Kendaraan Operasional'
FROM public.ticket_queues
WHERE kode = 'GA';

INSERT INTO public.ticket_categories (queue_id, kode, nama)
SELECT id, 'OPERASIONAL', 'Operasional Harian'
FROM public.ticket_queues
WHERE kode = 'OPS';

INSERT INTO public.ticket_categories (queue_id, kode, nama)
SELECT id, 'DISTRIBUSI', 'Distribusi'
FROM public.ticket_queues
WHERE kode = 'OPS';
```

---

## 7.4 Mengubah Tabel Tickets

Tahap pertama adalah menambahkan kolom baru tanpa langsung menghapus kolom lama.

```sql
ALTER TABLE public.tickets
ADD COLUMN queue_id bigint,
ADD COLUMN category_id bigint,
ADD COLUMN pelapor_user_id bigint,
ADD COLUMN assigned_to_user_id bigint;
```

Tambahkan foreign key:

```sql
ALTER TABLE public.tickets
ADD CONSTRAINT fk_ticket_queue
    FOREIGN KEY (queue_id)
    REFERENCES public.ticket_queues(id)
    ON DELETE RESTRICT;

ALTER TABLE public.tickets
ADD CONSTRAINT fk_ticket_category
    FOREIGN KEY (category_id)
    REFERENCES public.ticket_categories(id)
    ON DELETE RESTRICT;

ALTER TABLE public.tickets
ADD CONSTRAINT fk_ticket_pelapor_user
    FOREIGN KEY (pelapor_user_id)
    REFERENCES public.users(id)
    ON DELETE SET NULL;

ALTER TABLE public.tickets
ADD CONSTRAINT fk_ticket_assigned_user
    FOREIGN KEY (assigned_to_user_id)
    REFERENCES public.users(id)
    ON DELETE SET NULL;
```

### Catatan

Kolom lama berikut dipertahankan sementara:

- `kategori`
- `assigned_to`
- `pelapor`

Kolom tersebut baru dihapus setelah:

1. Semua data lama berhasil dimigrasikan.
2. Backend sudah menggunakan kolom ID.
3. Frontend sudah menggunakan API baru.
4. Tidak ada proses lama yang masih membaca kolom teks.
5. Hasil rekonsiliasi data dinyatakan valid.

---

## 7.5 Menambahkan Index

```sql
CREATE INDEX idx_tickets_queue_status_created
ON public.tickets (queue_id, status_tiket, dibuat_pada);

CREATE INDEX idx_tickets_assigned_status
ON public.tickets (assigned_to_user_id, status_tiket);

CREATE INDEX idx_tickets_reporter_created
ON public.tickets (pelapor_user_id, dibuat_pada);

CREATE INDEX idx_tickets_category
ON public.tickets (category_id);

CREATE INDEX idx_user_ticket_queues_user
ON public.user_ticket_queues (user_id, queue_id);

CREATE INDEX idx_user_ticket_queues_queue
ON public.user_ticket_queues (queue_id, user_id);
```

---

## 8. Aturan Bisnis

## 8.1 Pembuatan Tiket

Ketika user membuat tiket:

1. User memilih queue.
2. Sistem menampilkan kategori aktif sesuai queue.
3. User memilih kategori.
4. Backend memvalidasi bahwa kategori tersebut memang milik queue yang dipilih.
5. Backend membuat tiket dengan status `Open`.
6. `assigned_to_user_id` harus bernilai `NULL`.
7. Tiket langsung tampil di dashboard admin queue terkait.
8. Aktivitas pembuatan tiket dicatat dalam log.

Contoh:

```text
Queue       : IT
Category    : Hardware
Status      : Open
Assignee    : NULL
Reporter    : User pembuat tiket
```

---

## 8.2 Hak Akses Tiket

### User Biasa

User biasa dapat:

- Membuat tiket.
- Melihat tiket miliknya sendiri.
- Menambahkan komentar pada tiket miliknya.
- Melihat status dan riwayat tiket miliknya.
- Menutup atau membatalkan tiket jika aturan bisnis mengizinkan.

User biasa tidak dapat:

- Melihat tiket user lain.
- Mengambil tiket.
- Mengubah assignee.
- Mengubah queue secara bebas.
- Mengelola kategori dan mapping admin.

### Admin Unit

Admin unit dapat:

- Melihat tiket pada queue yang menjadi tanggung jawabnya.
- Mengambil tiket yang belum memiliki assignee.
- Mengubah status tiket yang ditanganinya.
- Menambahkan komentar.
- Melakukan reassign sesuai aturan.
- Melihat riwayat tiket pada queue-nya.

Admin unit tidak dapat:

- Melihat queue yang tidak dimapping kepadanya.
- Mengambil tiket dari queue lain.
- Mengubah mapping admin.
- Mengubah master queue kecuali memiliki permission tambahan.

### Superadmin

Superadmin dapat:

- Melihat seluruh tiket.
- Mengelola queue.
- Mengelola kategori.
- Mengelola mapping admin.
- Melakukan assign dan reassign.
- Melihat seluruh log.
- Melakukan override bila diperlukan.

---

## 8.3 Claim atau Ambil Tiket

Claim harus menggunakan operasi atomik agar tiket tidak dapat diambil oleh dua admin secara bersamaan.

```sql
UPDATE public.tickets t
SET
    assigned_to_user_id = :current_admin_id,
    status_tiket = 'In Progress',
    diperbarui_pada = CURRENT_TIMESTAMP
WHERE t.id = :ticket_id
  AND t.assigned_to_user_id IS NULL
  AND EXISTS (
      SELECT 1
      FROM public.user_ticket_queues utq
      WHERE utq.user_id = :current_admin_id
        AND utq.queue_id = t.queue_id
  )
RETURNING t.*;
```

Hasil:

- Jika satu row dikembalikan, claim berhasil.
- Jika tidak ada row, tiket sudah diambil admin lain atau admin tidak memiliki akses.

Backend harus mengembalikan status konflik, misalnya HTTP `409 Conflict`, ketika tiket sudah diambil admin lain.

---

## 8.4 Reassign Tiket

Reassign hanya boleh dilakukan oleh:

- Admin yang sedang menangani tiket, jika diperbolehkan.
- Admin utama queue.
- Superadmin.

Admin tujuan harus:

1. Aktif.
2. Memiliki role admin atau superadmin.
3. Terdaftar pada queue tiket tersebut.

Validasi SQL:

```sql
SELECT 1
FROM public.users u
JOIN public.user_ticket_queues utq
    ON utq.user_id = u.id
WHERE u.id = :target_admin_id
  AND u.is_active = true
  AND u.role IN ('admin', 'superadmin')
  AND utq.queue_id = :ticket_queue_id;
```

---

## 8.5 Perubahan Queue

Perubahan queue tiket harus dibatasi.

Ketika queue berubah:

1. Validasi queue tujuan aktif.
2. Validasi kategori baru milik queue tujuan.
3. Kosongkan `assigned_to_user_id` jika assignee lama tidak memiliki akses ke queue baru.
4. Ubah status menjadi `Open` atau `Pending Assignment` sesuai keputusan bisnis.
5. Catat queue lama dan queue baru di log.

---

## 8.6 Status Tiket

Status minimum yang disarankan:

| Status | Keterangan |
|---|---|
| Open | Tiket baru dan belum ditangani |
| In Progress | Tiket sedang dikerjakan |
| Pending | Menunggu informasi atau pihak lain |
| Resolved | Solusi sudah diberikan |
| Closed | Tiket sudah selesai dan ditutup |
| Cancelled | Tiket dibatalkan |

Opsional:

- `Pending Assignment`
- `Reopened`
- `Escalated`

Status sebaiknya distandarkan menggunakan constraint atau master tabel agar tidak menjadi teks bebas.

Contoh constraint sederhana:

```sql
ALTER TABLE public.tickets
ADD CONSTRAINT chk_ticket_status
CHECK (
    status_tiket IN (
        'Open',
        'In Progress',
        'Pending',
        'Resolved',
        'Closed',
        'Cancelled'
    )
);
```

---

## 9. Rencana Migrasi Data

## 9.1 Persiapan

1. Buat backup database.
2. Pastikan backup dapat direstore.
3. Jalankan migrasi di staging.
4. Catat jumlah data sebelum migrasi.
5. Siapkan script rollback.
6. Hentikan perubahan struktur manual selama periode migrasi.

Checklist awal:

```sql
SELECT COUNT(*) FROM public.tickets;
SELECT COUNT(*) FROM public.users;
SELECT status_tiket, COUNT(*) FROM public.tickets GROUP BY status_tiket;
SELECT kategori, COUNT(*) FROM public.tickets GROUP BY kategori;
```

---

## 9.2 Membuat Struktur Baru

Urutan:

1. Buat `ticket_queues`.
2. Isi HR, IT, GA, OPS.
3. Buat `ticket_categories`.
4. Isi kategori awal.
5. Buat `user_ticket_queues`.
6. Tambahkan kolom baru ke `tickets`.
7. Tambahkan index.

Foreign key dapat ditambahkan setelah backfill jika diperlukan untuk mengurangi risiko kegagalan migrasi.

---

## 9.3 Mapping Admin

Admin yang ada perlu dipetakan secara manual.

Contoh:

```sql
INSERT INTO public.user_ticket_queues (user_id, queue_id, is_primary)
SELECT
    1,
    q.id,
    true
FROM public.ticket_queues q
WHERE q.kode = 'IT';
```

Mapping yang harus disiapkan:

| User | Role | Queue |
|---|---|---|
| Admin IT | admin/superadmin | IT |
| Admin HR | admin | HR |
| Admin GA | admin | GA |
| Admin OPS | admin | OPS |

Apabila satu admin menangani dua queue, buat dua row mapping.

---

## 9.4 Migrasi Tiket Lama

Kategori lama seperti berikut diasumsikan masuk ke queue IT:

- Hardware
- Software
- Network
- Peripheral

Backfill queue:

```sql
UPDATE public.tickets t
SET queue_id = q.id
FROM public.ticket_queues q
WHERE q.kode = 'IT'
  AND t.kategori IN ('Hardware', 'Software', 'Network', 'Peripheral')
  AND t.queue_id IS NULL;
```

Backfill kategori:

```sql
UPDATE public.tickets t
SET category_id = c.id
FROM public.ticket_categories c
JOIN public.ticket_queues q
    ON q.id = c.queue_id
WHERE q.kode = 'IT'
  AND LOWER(c.nama) = LOWER(t.kategori)
  AND t.category_id IS NULL;
```

Backfill assignee dari nama:

```sql
UPDATE public.tickets t
SET assigned_to_user_id = u.id
FROM public.users u
WHERE LOWER(TRIM(t.assigned_to)) = LOWER(TRIM(u.nama))
  AND t.assigned_to_user_id IS NULL;
```

Backfill reporter dari nama:

```sql
UPDATE public.tickets t
SET pelapor_user_id = u.id
FROM public.users u
WHERE LOWER(TRIM(t.pelapor)) = LOWER(TRIM(u.nama))
  AND t.pelapor_user_id IS NULL;
```

### Catatan Penting

Tidak semua nilai `pelapor` atau `assigned_to` lama pasti cocok dengan nama pada tabel `users`.

Data yang tidak cocok harus masuk daftar rekonsiliasi:

```sql
SELECT
    t.id,
    t.nomor_tiket,
    t.assigned_to
FROM public.tickets t
WHERE t.assigned_to IS NOT NULL
  AND t.assigned_to_user_id IS NULL;
```

```sql
SELECT
    t.id,
    t.nomor_tiket,
    t.pelapor
FROM public.tickets t
WHERE t.pelapor IS NOT NULL
  AND t.pelapor_user_id IS NULL;
```

---

## 9.5 Validasi Migrasi

Validasi jumlah tiket:

```sql
SELECT COUNT(*) AS total_tiket
FROM public.tickets;
```

Validasi queue kosong:

```sql
SELECT *
FROM public.tickets
WHERE queue_id IS NULL;
```

Validasi kategori tidak sesuai queue:

```sql
SELECT
    t.id,
    t.nomor_tiket,
    t.queue_id AS ticket_queue,
    c.queue_id AS category_queue
FROM public.tickets t
JOIN public.ticket_categories c
    ON c.id = t.category_id
WHERE t.queue_id <> c.queue_id;
```

Validasi assignee tidak terdaftar pada queue:

```sql
SELECT
    t.id,
    t.nomor_tiket,
    t.assigned_to_user_id,
    t.queue_id
FROM public.tickets t
LEFT JOIN public.user_ticket_queues utq
    ON utq.user_id = t.assigned_to_user_id
   AND utq.queue_id = t.queue_id
WHERE t.assigned_to_user_id IS NOT NULL
  AND utq.user_id IS NULL;
```

Target validasi:

- Tidak ada tiket aktif tanpa queue.
- Tidak ada kategori yang berbeda queue dengan tiket.
- Semua assignee aktif memiliki akses ke queue tiket.
- Semua tiket baru menggunakan ID user.
- Jumlah tiket sebelum dan sesudah migrasi sama.

---

## 9.6 Dual Read dan Dual Write

Untuk rollout bertahap, backend dapat menggunakan periode kompatibilitas.

### Dual Write

Saat membuat atau memperbarui tiket:

- Isi kolom ID baru.
- Isi kolom teks lama untuk sementara.

Contoh:

```text
assigned_to_user_id = 1
assigned_to         = "Admin IT"
```

### Dual Read

Prioritas pembacaan:

1. Gunakan relasi ID baru.
2. Jika ID kosong, gunakan kolom teks lama sebagai fallback.

Periode dual write dihentikan setelah seluruh frontend dan backend menggunakan struktur baru.

---

## 9.7 Menghapus Kolom Lama

Setelah stabil:

```sql
ALTER TABLE public.tickets
DROP COLUMN assigned_to,
DROP COLUMN pelapor,
DROP COLUMN kategori;
```

Sebelum dijalankan:

- Pastikan tidak ada query aplikasi yang masih menggunakan kolom lama.
- Pastikan laporan sudah menggunakan tabel master.
- Pastikan backup tersedia.
- Pastikan migrasi sudah berjalan stabil selama periode yang ditentukan.

---

## 10. Perubahan Backend

## 10.1 Service Pembuatan Tiket

Backend harus:

1. Mengambil user login dari session atau token.
2. Menerima `queue_id`.
3. Menerima `category_id`.
4. Memvalidasi queue aktif.
5. Memvalidasi kategori aktif dan berasal dari queue tersebut.
6. Mengabaikan `assigned_to_user_id` dari request user biasa.
7. Menetapkan status awal `Open`.
8. Menyimpan `pelapor_user_id` dari user login.
9. Membuat log riwayat.

Contoh payload:

```json
{
  "judul": "Laptop tidak dapat menyala",
  "deskripsi": "Laptop mati setelah proses update.",
  "queue_id": 2,
  "category_id": 5,
  "prioritas": "High",
  "attachment": null
}
```

---

## 10.2 Endpoint yang Disarankan

### Master Queue

```text
GET    /api/ticket-queues
POST   /api/ticket-queues
PATCH  /api/ticket-queues/:id
```

### Master Kategori

```text
GET    /api/ticket-queues/:queueId/categories
POST   /api/ticket-categories
PATCH  /api/ticket-categories/:id
```

### Mapping Admin

```text
GET    /api/ticket-queues/:queueId/admins
POST   /api/ticket-queues/:queueId/admins
DELETE /api/ticket-queues/:queueId/admins/:userId
```

### Tiket

```text
POST   /api/tickets
GET    /api/tickets
GET    /api/tickets/:id
PATCH  /api/tickets/:id/status
POST   /api/tickets/:id/claim
POST   /api/tickets/:id/reassign
POST   /api/tickets/:id/change-queue
```

---

## 10.3 Query Dashboard Admin

```sql
SELECT
    t.id,
    t.nomor_tiket,
    t.judul,
    t.deskripsi,
    q.kode AS queue_code,
    q.nama AS queue_name,
    c.kode AS category_code,
    c.nama AS category_name,
    t.prioritas,
    t.status_tiket,
    t.assigned_to_user_id,
    assignee.nama AS assigned_to_name,
    reporter.nama AS reporter_name,
    t.dibuat_pada,
    t.diperbarui_pada
FROM public.tickets t
JOIN public.ticket_queues q
    ON q.id = t.queue_id
LEFT JOIN public.ticket_categories c
    ON c.id = t.category_id
LEFT JOIN public.users assignee
    ON assignee.id = t.assigned_to_user_id
LEFT JOIN public.users reporter
    ON reporter.id = t.pelapor_user_id
WHERE
    :is_superadmin = true
    OR EXISTS (
        SELECT 1
        FROM public.user_ticket_queues utq
        WHERE utq.user_id = :current_user_id
          AND utq.queue_id = t.queue_id
    )
ORDER BY
    CASE t.prioritas
        WHEN 'Urgent' THEN 1
        WHEN 'High' THEN 2
        WHEN 'Medium' THEN 3
        WHEN 'Low' THEN 4
        ELSE 5
    END,
    t.dibuat_pada ASC;
```

---

## 10.4 Filter Dashboard

Filter minimum:

- Queue.
- Kategori.
- Status.
- Prioritas.
- Assignee.
- Reporter.
- Tanggal dibuat.
- Belum diambil.
- Tiket milik saya.

Tab yang disarankan:

- **Unassigned**
- **My Tickets**
- **All Unit Tickets**
- **Pending**
- **Resolved**
- **Closed**

---

## 11. Perubahan Frontend

## 11.1 Form Pembuatan Tiket

Field:

1. Judul.
2. Unit tujuan.
3. Kategori.
4. Prioritas.
5. Deskripsi.
6. Attachment.

Perilaku:

- Dropdown kategori dinonaktifkan sebelum queue dipilih.
- Setelah queue dipilih, frontend memanggil API kategori.
- Hanya kategori aktif yang ditampilkan.
- User tidak dapat memilih assignee.
- User tidak dapat mengubah reporter.
- Tampilkan informasi singkat mengenai fungsi setiap queue.

---

## 11.2 Dashboard Admin

Kolom daftar tiket:

- Nomor tiket.
- Judul.
- Queue.
- Kategori.
- Prioritas.
- Status.
- Reporter.
- Assignee.
- Waktu dibuat.
- Waktu terakhir diperbarui.
- Aksi.

Aksi:

- Lihat Detail.
- Ambil Tiket.
- Ubah Status.
- Reassign.
- Tambah Komentar.
- Pindahkan Queue, khusus role tertentu.

---

## 11.3 Dashboard Superadmin

Menu tambahan:

- Master Queue.
- Master Kategori.
- Mapping Admin.
- Semua Tiket.
- Audit Log.
- Laporan.

---

## 12. Audit Log

Setiap aksi penting harus dicatat pada `log_riwayat_tiket`.

Aksi minimum:

- `CREATE`
- `CLAIM`
- `ASSIGN`
- `REASSIGN`
- `CHANGE_STATUS`
- `CHANGE_QUEUE`
- `CHANGE_CATEGORY`
- `COMMENT`
- `ATTACHMENT`
- `RESOLVE`
- `CLOSE`
- `REOPEN`
- `CANCEL`

Contoh isi perubahan:

```json
{
  "field": "assigned_to_user_id",
  "old_value": null,
  "new_value": 12,
  "old_label": null,
  "new_label": "Admin IT 2"
}
```

Untuk implementasi awal, kolom `perubahan` yang berupa teks dapat menyimpan JSON dalam bentuk string. Pada fase berikutnya, kolom tersebut dapat diubah menjadi `jsonb`.

---

## 13. Notifikasi

Fase awal:

- Notifikasi di dalam aplikasi.
- Badge jumlah tiket baru pada menu admin.
- Badge jumlah tiket belum diambil.
- Notifikasi ketika tiket diassign.
- Notifikasi ketika status tiket berubah.
- Notifikasi ketika ada komentar baru.

Fase lanjutan:

- Email.
- Microsoft Teams.
- Slack.
- WhatsApp.
- Push notification.

---

## 14. Keamanan

## 14.1 Validasi Server-Side

Frontend tidak boleh menjadi satu-satunya pengaman.

Backend harus selalu memvalidasi:

- Queue yang boleh diakses admin.
- Tiket milik reporter.
- Kategori sesuai queue.
- Assignee sesuai queue.
- Role user.
- Status user aktif.
- Permission untuk reassign.
- Permission untuk perubahan queue.

---

## 14.2 Password

Password tidak boleh disimpan dalam bentuk teks biasa.

Gunakan salah satu:

- Argon2id.
- bcrypt.

Rencana:

1. Ubah proses registrasi dan perubahan password agar menghasilkan hash.
2. Saat login, lakukan verifikasi hash.
3. Migrasikan akun lama melalui reset password atau mekanisme rehash.
4. Jangan menampilkan password pada dump, log, atau response API.
5. Tambahkan rate limiting login.
6. Tambahkan lockout sementara setelah kegagalan berulang.

---

## 14.3 Permission

Permission JSON yang sudah ada dapat tetap digunakan untuk kontrol menu umum.

Contoh tambahan permission:

```json
{
  "tickets": true,
  "ticket_admin": true,
  "ticket_master": false,
  "ticket_reassign": true,
  "ticket_change_queue": false
}
```

Queue tetap ditentukan melalui `user_ticket_queues`, bukan hanya melalui JSON permission.

---

## 15. Pengujian

## 15.1 Unit Test

Test minimum:

- Membuat tiket dengan queue dan kategori valid.
- Menolak kategori dari queue berbeda.
- Menolak queue nonaktif.
- User biasa tidak dapat mengisi assignee.
- Admin hanya melihat queue miliknya.
- Superadmin dapat melihat semua queue.
- Claim berhasil untuk admin yang sesuai.
- Claim gagal untuk admin queue lain.
- Claim kedua gagal setelah tiket diambil.
- Reassign hanya ke admin queue yang sama.
- Reporter hanya melihat tiket miliknya.

---

## 15.2 Integration Test

Skenario:

### Skenario 1 — Tiket IT

1. Login sebagai user.
2. Buat tiket queue IT.
3. Pilih kategori Hardware.
4. Login sebagai Admin HR.
5. Pastikan tiket tidak terlihat.
6. Login sebagai Admin IT.
7. Pastikan tiket terlihat.
8. Claim tiket.
9. Pastikan status berubah menjadi `In Progress`.
10. Pastikan assignee terisi.

### Skenario 2 — Race Condition

1. Dua Admin IT membuka tiket yang sama.
2. Keduanya menekan claim hampir bersamaan.
3. Hanya satu claim yang berhasil.
4. Admin lain menerima respons konflik.

### Skenario 3 — Reassign

1. Admin IT 1 menangani tiket.
2. Reassign ke Admin IT 2.
3. Pastikan reassign berhasil.
4. Coba reassign ke Admin HR.
5. Pastikan ditolak.

### Skenario 4 — Perubahan Queue

1. Tiket berada di queue IT.
2. Superadmin memindahkan tiket ke GA.
3. Pastikan kategori IT diganti dengan kategori GA.
4. Pastikan assignee IT dikosongkan jika tidak punya akses GA.
5. Pastikan log mencatat perubahan.

---

## 15.3 Migration Test

- Jumlah tiket sebelum dan sesudah sama.
- Tidak ada tiket yang hilang.
- Semua kategori lama terpetakan.
- Semua tiket aktif memiliki queue.
- Assignee yang berhasil dipetakan sesuai user.
- Data yang gagal dipetakan tercatat.
- Rollback berhasil dijalankan di staging.

---

## 15.4 Security Test

- User tidak dapat mengubah `pelapor_user_id`.
- User tidak dapat mengisi `assigned_to_user_id`.
- Admin HR tidak dapat mengakses URL tiket IT.
- Admin nonaktif tidak dapat claim tiket.
- Request dengan queue ID palsu ditolak.
- SQL injection ditangani dengan parameterized query.
- Attachment divalidasi.
- Password tidak dikembalikan API.
- Endpoint master hanya untuk user berwenang.

---

## 16. Tahapan Implementasi

## Fase 1 — Persiapan dan Desain

Tugas:

- Finalisasi daftar queue.
- Finalisasi kategori setiap queue.
- Identifikasi admin HR, IT, GA, dan OPS.
- Finalisasi role dan permission.
- Tentukan aturan claim dan reassign.
- Buat ERD.
- Buat migration script.
- Buat rollback script.

Output:

- ERD final.
- Daftar kategori.
- Daftar mapping admin.
- Migration SQL.
- Rollback SQL.

---

## Fase 2 — Perubahan Database

Tugas:

- Membuat tabel `ticket_queues`.
- Membuat tabel `ticket_categories`.
- Membuat tabel `user_ticket_queues`.
- Menambahkan kolom baru ke `tickets`.
- Menambahkan index.
- Menambahkan seed data.
- Menambahkan constraint yang aman.

Output:

- Struktur database baru tersedia di staging.
- Data queue dan kategori tersedia.
- Admin sudah dipetakan.

---

## Fase 3 — Migrasi Data Lama

Tugas:

- Backfill queue.
- Backfill kategori.
- Backfill reporter.
- Backfill assignee.
- Membuat laporan data yang gagal dipetakan.
- Rekonsiliasi manual.
- Validasi jumlah data.

Output:

- Tiket lama kompatibel dengan struktur baru.
- Daftar anomali terselesaikan.

---

## Fase 4 — Backend

Tugas:

- Service master queue.
- Service kategori.
- Service mapping admin.
- Perubahan create ticket.
- Perubahan list ticket.
- Claim ticket.
- Reassign ticket.
- Change queue.
- Validasi hak akses.
- Audit log.
- Automated tests.

Output:

- API baru siap di staging.
- API lama tetap berjalan selama masa kompatibilitas.

---

## Fase 5 — Frontend

Tugas:

- Dropdown queue.
- Dynamic category.
- Dashboard berdasarkan unit.
- Tab unassigned dan my tickets.
- Tombol claim.
- Form reassign.
- Halaman mapping admin.
- Halaman master kategori.
- Error state claim conflict.

Output:

- User dapat membuat tiket berdasarkan unit.
- Admin dapat bekerja berdasarkan queue.

---

## Fase 6 — UAT

Peserta:

- Perwakilan user.
- Admin HR.
- Admin IT.
- Admin GA.
- Admin OPS.
- Superadmin.
- Tim developer.
- Tim QA.

Checklist:

- Routing tiket benar.
- Pembatasan akses benar.
- Claim tidak bentrok.
- Reassign benar.
- Riwayat lengkap.
- Dashboard mudah digunakan.
- Tidak ada tiket lama yang hilang.

---

## Fase 7 — Production Rollout

Strategi:

1. Backup production.
2. Jalankan migration script.
3. Jalankan backfill.
4. Aktifkan feature flag backend.
5. Aktifkan frontend baru.
6. Pantau error.
7. Pantau tiket tanpa queue.
8. Pantau claim conflict.
9. Jalankan rekonsiliasi.
10. Siapkan rollback jika metrik kritis gagal.

---

## Fase 8 — Cleanup

Setelah sistem stabil:

- Hentikan dual write.
- Hapus fallback kolom teks.
- Ubah kolom ID menjadi `NOT NULL` jika memungkinkan.
- Hapus kolom lama.
- Perbarui dokumentasi.
- Optimalkan query.
- Evaluasi SLA dan auto-assignment.

---

## 17. Strategi Rollback

Rollback harus disiapkan sebelum deployment.

### Rollback Aplikasi

- Nonaktifkan feature flag routing baru.
- Kembalikan frontend ke form lama.
- Gunakan kolom teks lama selama masa dual write.

### Rollback Database

Selama kolom lama belum dihapus:

- Struktur baru dapat dibiarkan tanpa digunakan.
- Data lama tetap tersedia.
- Aplikasi dapat kembali membaca `kategori`, `assigned_to`, dan `pelapor`.

Jangan menghapus kolom lama pada deployment pertama.

---

## 18. Monitoring Setelah Go-Live

Metrik yang dipantau:

- Jumlah tiket per queue.
- Jumlah tiket tanpa queue.
- Jumlah tiket tanpa kategori.
- Jumlah tiket belum diambil.
- Waktu rata-rata sampai tiket diambil.
- Jumlah claim conflict.
- Jumlah reassign.
- Jumlah tiket per admin.
- Jumlah error API.
- Jumlah akses ditolak.
- Tiket dengan assignee tidak sesuai queue.

Query monitoring:

```sql
SELECT
    q.kode,
    COUNT(*) AS total_tiket
FROM public.tickets t
JOIN public.ticket_queues q
    ON q.id = t.queue_id
GROUP BY q.kode
ORDER BY q.kode;
```

```sql
SELECT COUNT(*) AS tiket_tanpa_queue
FROM public.tickets
WHERE queue_id IS NULL;
```

```sql
SELECT COUNT(*) AS tiket_belum_diambil
FROM public.tickets
WHERE assigned_to_user_id IS NULL
  AND status_tiket IN ('Open', 'Pending Assignment');
```

---

## 19. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Nama lama tidak cocok dengan user | Reporter atau assignee tidak termigrasi | Buat laporan rekonsiliasi manual |
| Admin belum dimapping | Tiket tidak terlihat admin | Validasi mapping sebelum go-live |
| Dua admin claim bersamaan | Tiket dikerjakan ganda | Gunakan atomic update |
| Kategori salah queue | Routing tidak valid | Validasi backend dan foreign key |
| Query dashboard lambat | Pengalaman pengguna buruk | Tambahkan index dan pagination |
| Kolom lama dihapus terlalu cepat | Aplikasi lama error | Gunakan dual read dan dual write |
| Password masih plaintext | Risiko keamanan tinggi | Migrasi hashing password |
| Admin mengakses queue lain | Kebocoran data | Validasi server-side setiap request |
| Tiket tanpa queue | Tidak ada admin yang menerima | Monitoring dan constraint bertahap |

---

## 20. Definition of Done

Implementasi dianggap selesai ketika:

- [ ] Master queue HR, IT, GA, dan OPS tersedia.
- [ ] Semua queue memiliki kategori aktif.
- [ ] Semua admin sudah dimapping ke queue.
- [ ] User dapat membuat tiket dengan queue dan kategori.
- [ ] Tiket muncul hanya pada admin queue terkait.
- [ ] Admin dapat claim tiket.
- [ ] Race condition claim sudah ditangani.
- [ ] Reassign tervalidasi.
- [ ] Superadmin dapat melihat semua tiket.
- [ ] Reporter hanya dapat melihat tiket miliknya.
- [ ] Audit log mencatat seluruh perubahan penting.
- [ ] Data tiket lama sudah dimigrasikan.
- [ ] Tidak ada tiket aktif tanpa queue.
- [ ] Tidak ada kategori yang berbeda queue.
- [ ] Pengujian unit dan integrasi lulus.
- [ ] UAT disetujui HR, IT, GA, OPS, dan superadmin.
- [ ] Backup dan rollback sudah diuji.
- [ ] Password tidak lagi disimpan sebagai plaintext.
- [ ] Dokumentasi API dan operasional diperbarui.

---

## 21. Prioritas Pengerjaan

### Prioritas 1 — Wajib

- Queue.
- Mapping admin.
- Category.
- Foreign key user.
- Create ticket.
- Dashboard admin per queue.
- Claim atomik.
- Access control.
- Migrasi data.
- Audit log.

### Prioritas 2 — Penting

- Reassign.
- Change queue.
- Dashboard superadmin.
- Filter dan pagination.
- In-app notification.
- Reporting dasar.

### Prioritas 3 — Lanjutan

- SLA.
- Auto-assignment.
- Eskalasi.
- Email dan WhatsApp.
- Workload balancing.
- Approval.
- Knowledge base.

---

## 22. Rekomendasi Keputusan Teknis

1. Gunakan istilah **queue** atau **unit tujuan** untuk HR, IT, GA, dan OPS.
2. Pertahankan **kategori** untuk subkategori seperti Hardware, Payroll, Gedung, dan Distribusi.
3. Gunakan foreign key, bukan nama admin.
4. Jangan langsung assign admin ketika tiket dibuat.
5. Masukkan tiket ke queue terlebih dahulu.
6. Gunakan claim atomik untuk menentukan admin penanggung jawab.
7. Gunakan tabel mapping many-to-many antara user dan queue.
8. Terapkan validasi akses di backend.
9. Gunakan rollout bertahap dengan dual read dan dual write.
10. Jangan menghapus kolom lama sebelum seluruh aplikasi stabil.
