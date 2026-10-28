// Supabase Edge Function: provision-students
// Provisions roster accounts in small, retryable batches. Never expose the service-role key to Android.
import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INITIAL_PASSWORD = Deno.env.get("VOKASI_INITIAL_STUDENT_PASSWORD");
const DEFAULT_SCHOOL_YEAR = "2026/2027";
const MAX_BATCH = 2500;
const STUDENT_CONCURRENCY = 8;
const MAJOR_NAMES: Record<string, string> = {
  DPIB: "Desain Pemodelan dan Informasi Bangunan",
  GEO: "Teknik Geomatika",
  TAB: "Teknik Alat Berat",
  TITL: "Teknik Instalasi Tenaga Listrik",
  TKP: "Teknik Konstruksi dan Perumahan",
  TKR: "Teknik Kendaraan Ringan",
  TMI: "Teknik Mekanik Industri",
  TOI: "Teknik Otomasi Industri",
  TP: "Teknik Pengelasan",
  TPM: "Teknik Pemesinan",
  TSM: "Teknik Sepeda Motor",
};

type StudentInput = {
  fullName: string;
  majorCode: string;
  majorName?: string;
  gradeLevel?: number;
  classLabel: string;
  admissionYear: number;
  schoolYear?: string;
};
type MajorInput = { code: string; name?: string };
type ClassInput = {
  majorCode: string;
  majorName?: string;
  gradeLevel?: number;
  classLabel: string;
  schoolYear?: string;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

function romanForGrade(grade: number) {
  return grade === 10 ? "X" : grade === 11 ? "XI" : grade === 12 ? "XII" : "";
}

function usernameBase(fullName: string) {
  const ascii = fullName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const value = ascii.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
  return (value || "siswa").slice(0, 26).replace(/\.+$/g, "") || "siswa";
}

async function findUsername(
  admin: ReturnType<typeof createClient>,
  fullName: string,
  reservedUsernames: Set<string>,
) {
  const base = usernameBase(fullName);
  for (let n = 1; n <= 9999; n++) {
    const suffix = n === 1 ? "" : `.${n}`;
    const candidate = (base.slice(0, 30 - suffix.length).replace(/\.+$/g, "") + suffix).slice(0, 30);
    const key = candidate.toLowerCase();
    if (reservedUsernames.has(key)) continue;
    reservedUsernames.add(key);
    const { data, error } = await admin.from("student_roster")
      .select("id").ilike("username", candidate).limit(1);
    if (error) {
      reservedUsernames.delete(key);
      throw new Error("Gagal memeriksa ketersediaan username.");
    }
    if (!data?.length) return candidate;
    reservedUsernames.delete(key);
  }
  throw new Error("Tidak dapat membuat username unik untuk nama ini.");
}
async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string): Promise<User | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}


function validateMajor(raw: MajorInput) {
  const code = String(raw?.code ?? "").trim().toUpperCase();
  const providedName = String(raw?.name ?? "").trim();
  const name = MAJOR_NAMES[code] ?? providedName;
  if (!/^[A-Z0-9]{2,8}$/.test(code)) throw new Error("Kode jurusan tidak valid.");
  if (!name || name.length > 100) throw new Error("Nama jurusan tidak valid.");
  return { code, name };
}

function validateClass(raw: ClassInput) {
  const majorCode = String(raw?.majorCode ?? "").trim().toUpperCase();
  const majorName = MAJOR_NAMES[majorCode] ?? String(raw?.majorName ?? "").trim();
  const rawLabel = String(raw?.classLabel ?? "").trim().replace(/\s+/g, " ");
  const schoolYear = String(raw?.schoolYear ?? DEFAULT_SCHOOL_YEAR).trim();
  const gradeMatch = rawLabel.match(/^(XII|XI|X)\s+(.+)$/i);
  const gradeFromLabel = gradeMatch
    ? (gradeMatch[1].toUpperCase() === "X" ? 10
      : gradeMatch[1].toUpperCase() === "XI" ? 11 : 12)
    : Number(raw?.gradeLevel);
  const gradeLevel = Number(raw?.gradeLevel ?? gradeFromLabel);
  const classLabel = gradeMatch ? `${gradeMatch[1].toUpperCase()} ${gradeMatch[2]}`
    : `${romanForGrade(gradeLevel)} ${rawLabel}`;
  if (!/^[A-Z0-9]{2,8}$/.test(majorCode) || !majorName) {
    throw new Error("Jurusan kelas tidak valid.");
  }
  if (![10, 11, 12].includes(gradeLevel)) throw new Error("Tingkat harus X, XI, atau XII.");
  if (!classLabel || classLabel.length < 3 || classLabel.length > 80 ||
      !/^[A-Za-z0-9 .-]+$/.test(classLabel)) {
    throw new Error("Nama rombel tidak valid.");
  }
  if (gradeMatch && gradeLevel !== gradeFromLabel) throw new Error("Tingkat tidak sesuai dengan nama rombel.");
  if (!/^\d{4}\/\d{4}$/.test(schoolYear)) throw new Error("Tahun ajaran harus berformat 2026/2027.");
  return { majorCode, majorName, gradeLevel, classLabel, schoolYear };
}

async function ensureMajor(admin: ReturnType<typeof createClient>, raw: MajorInput) {
  const parsed = validateMajor(raw);
  const { data: found, error: readError } = await admin.from("majors")
    .select("id,code,name").eq("code", parsed.code).maybeSingle();
  if (readError) throw new Error("Gagal membaca daftar jurusan.");
  if (found) {
    if (found.name !== parsed.name) {
      const { error } = await admin.from("majors")
        .update({ name: parsed.name, is_active: true }).eq("id", found.id);
      if (error) throw new Error("Gagal memperbarui nama jurusan.");
    }
    return { ...found, name: parsed.name };
  }
  const { data, error } = await admin.from("majors")
    .insert({ code: parsed.code, name: parsed.name, is_active: true })
    .select("id,code,name").single();
  if (error || !data) throw new Error("Gagal menyimpan jurusan.");
  return data;
}

async function ensureClass(admin: ReturnType<typeof createClient>, raw: ClassInput) {
  const parsed = validateClass(raw);
  const major = await ensureMajor(admin, { code: parsed.majorCode, name: parsed.majorName });
  const { data: found, error: readError } = await admin.from("classes")
    .select("id").eq("major_id", major.id).eq("grade_level", parsed.gradeLevel)
    .eq("class_name", parsed.classLabel).eq("school_year", parsed.schoolYear).maybeSingle();
  if (readError) throw new Error("Gagal membaca daftar kelas.");
  if (found) return found;
  const { data, error } = await admin.from("classes").insert({
    major_id: major.id, grade_level: parsed.gradeLevel, class_name: parsed.classLabel,
    school_year: parsed.schoolYear, is_active: true,
  }).select("id").single();
  if (!error && data) return data;
  const retry = await admin.from("classes").select("id")
    .eq("major_id", major.id).eq("grade_level", parsed.gradeLevel)
    .eq("class_name", parsed.classLabel).eq("school_year", parsed.schoolYear).maybeSingle();
  if (retry.error || !retry.data) throw new Error("Gagal menyimpan kelas.");
  return retry.data;
}

function validateStudent(raw: StudentInput) {
  const fullName = String(raw?.fullName ?? "").trim().replace(/\s+/g, " ");
  const majorCode = String(raw?.majorCode ?? "").trim().toUpperCase();
  const providedMajorName = String(raw?.majorName ?? "").trim();
  const majorName = MAJOR_NAMES[majorCode] ?? providedMajorName;
  const classLabelRaw = String(raw?.classLabel ?? "").trim().replace(/\s+/g, " ");
  const schoolYear = String(raw?.schoolYear ?? DEFAULT_SCHOOL_YEAR).trim();
  const admissionYear = Number(raw?.admissionYear);
  const gradeMatch = classLabelRaw.match(/^(XII|XI|X)\s+(.+)$/i);
  const gradeFromLabel = gradeMatch
    ? (gradeMatch[1].toUpperCase() === "X" ? 10
      : gradeMatch[1].toUpperCase() === "XI" ? 11 : 12)
    : Number(raw?.gradeLevel);
  const gradeLevel = Number(raw?.gradeLevel ?? gradeFromLabel);
  const classLabel = gradeMatch ? `${gradeMatch[1].toUpperCase()} ${gradeMatch[2]}`
    : `${romanForGrade(gradeLevel)} ${classLabelRaw}`;

  if (fullName.length < 2 || fullName.length > 120) throw new Error("Nama siswa tidak valid.");
  if (!/^[A-Z0-9]{2,8}$/.test(majorCode)) throw new Error("Kode jurusan tidak valid.");
  if (!majorName || majorName.length > 100) throw new Error("Nama jurusan tidak valid.");
  if (![10, 11, 12].includes(gradeLevel)) throw new Error("Tingkat harus X, XI, atau XII.");
  if (!classLabel || classLabel.length < 3 || classLabel.length > 80 || !/^[A-Za-z0-9 .-]+$/.test(classLabel)) {
    throw new Error("Nama rombel tidak valid.");
  }
  if (gradeMatch && gradeLevel !== gradeFromLabel) throw new Error("Tingkat tidak sesuai dengan nama rombel.");
  if (!Number.isInteger(admissionYear) || admissionYear < 2000 || admissionYear > 2100) {
    throw new Error("Angkatan harus berupa tahun masuk yang valid.");
  }
  if (!/^\d{4}\/\d{4}$/.test(schoolYear)) throw new Error("Tahun ajaran harus berformat 2026/2027.");
  return { fullName, normalizedName: normalizeName(fullName), majorCode, majorName, gradeLevel, classLabel, admissionYear, schoolYear };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Gunakan POST." });
  if (!PROJECT_URL || !ANON_KEY || !SERVICE_ROLE_KEY) return json(500, { error: "Konfigurasi Supabase Function belum lengkap." });
  if (!INITIAL_PASSWORD || INITIAL_PASSWORD.length < 8) {
    return json(500, { error: "Secret VOKASI_INITIAL_STUDENT_PASSWORD belum disetel atau kurang dari 8 karakter." });
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json(401, { error: "Login admin diperlukan." });

  const caller = createClient(PROJECT_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return json(401, { error: "Sesi admin tidak valid." });

  const admin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: adminRow, error: adminCheckError } = await admin.from("school_admins")
    .select("user_id").eq("user_id", userData.user.id).eq("is_active", true).maybeSingle();
  if (adminCheckError || !adminRow) return json(403, { error: "Akun ini tidak terdaftar sebagai admin sekolah aktif." });

  let body: { students?: StudentInput[]; classes?: ClassInput[]; majors?: MajorInput[] };
  try { body = await req.json(); } catch { return json(400, { error: "Body JSON tidak valid." }); }
  const students = Array.isArray(body.students) ? body.students : [];
  const classes = Array.isArray(body.classes) ? body.classes : [];
  const majors = Array.isArray(body.majors) ? body.majors : [];
  if (students.length > MAX_BATCH || classes.length > 500 || majors.length > 50 ||
      (students.length === 0 && classes.length === 0 && majors.length === 0)) {
    return json(400, { error: `Kirim maksimal ${MAX_BATCH} siswa, 500 kelas, dan 50 jurusan per impor.` });
  }

  const created: Array<{ fullName: string; username: string; status: string }> = [];
  const existing: Array<{ fullName: string; username: string; status: string }> = [];
  const failures: Array<{ row: number; fullName: string; error: string }> = [];

  for (let i = 0; i < majors.length; i++) {
    try { await ensureMajor(admin, majors[i]); }
    catch (e) {
      failures.push({ row: i + 1, fullName: `Jurusan ${String(majors[i]?.code ?? "")}`,
        error: e instanceof Error ? e.message : "Gagal menyimpan jurusan." });
    }
  }
  for (let i = 0; i < classes.length; i++) {
    try { await ensureClass(admin, classes[i]); }
    catch (e) {
      failures.push({ row: i + 1, fullName: `Kelas ${String(classes[i]?.classLabel ?? "")}`,
        error: e instanceof Error ? e.message : "Gagal menyimpan kelas." });
    }
  }

  // Validate rows before concurrent work and reject duplicate identities in the same file.
  const reservedUsernames = new Set<string>();
  const studentWork: Array<{ row: number; parsed: ReturnType<typeof validateStudent> }> = [];
  const seenIdentityKeys = new Set<string>();
  for (let i = 0; i < students.length; i++) {
    try {
      const parsed = validateStudent(students[i]);
      const identityKey = `${parsed.normalizedName}|${parsed.majorCode.toLowerCase()}|${parsed.admissionYear}`;
      if (seenIdentityKeys.has(identityKey)) {
        failures.push({ row: i + 1, fullName: parsed.fullName, error: "Identitas siswa ganda dalam file impor." });
        continue;
      }
      seenIdentityKeys.add(identityKey);
      studentWork.push({ row: i + 1, parsed });
    } catch (e) {
      failures.push({
        row: i + 1,
        fullName: String(students[i]?.fullName ?? ""),
        error: e instanceof Error ? e.message : "Data tidak valid.",
      });
    }
  }

  let nextWorkIndex = 0;
  async function processStudent(item: { row: number; parsed: ReturnType<typeof validateStudent> }) {
    const { row: rowNumber, parsed } = item;
    try {
      const { data: majorRow, error: majorReadError } = await admin.from("majors")
        .select("id,code,name").eq("code", parsed.majorCode).maybeSingle();
      if (majorReadError) throw new Error("Gagal membaca daftar jurusan.");
      let major = majorRow;
      if (!major) {
        const { data, error } = await admin.from("majors")
          .insert({ code: parsed.majorCode, name: parsed.majorName, is_active: true })
          .select("id,code,name").single();
        if (error || !data) throw new Error("Gagal menyimpan jurusan. Periksa data jurusan.");
        major = data;
      }

      let { data: classRow, error: classReadError } = await admin.from("classes")
        .select("id").eq("major_id", major.id).eq("grade_level", parsed.gradeLevel)
        .eq("class_name", parsed.classLabel).eq("school_year", parsed.schoolYear).maybeSingle();
      if (classReadError) throw new Error("Gagal membaca daftar kelas.");
      if (!classRow) {
        const { data, error } = await admin.from("classes").insert({
          major_id: major.id, grade_level: parsed.gradeLevel, class_name: parsed.classLabel,
          school_year: parsed.schoolYear, is_active: true,
        }).select("id").single();
        if (error || !data) {
          const retry = await admin.from("classes").select("id")
            .eq("major_id", major.id).eq("grade_level", parsed.gradeLevel)
            .eq("class_name", parsed.classLabel).eq("school_year", parsed.schoolYear).maybeSingle();
          if (retry.error || !retry.data) throw new Error("Gagal menyimpan kelas.");
          classRow = retry.data;
        } else classRow = data;
      }

      const identityKey = `${parsed.normalizedName}|${parsed.majorCode.toLowerCase()}|${parsed.admissionYear}`;
      const { data: rosterMatches, error: rosterReadError } = await admin.from("student_roster")
        .select("id,full_name,username,auth_user_id,registration_status,data_status,class_id")
        .eq("identity_key", identityKey).limit(2);
      if (rosterReadError) throw new Error("Gagal membaca daftar siswa.");
      if ((rosterMatches ?? []).length > 1) throw new Error("Identitas siswa ganda; perlu pemeriksaan admin.");
      let roster = rosterMatches?.[0] ?? null;

      if (!roster) {
        const username = await findUsername(admin, parsed.fullName, reservedUsernames);
        const { data, error } = await admin.from("student_roster").insert({
          full_name: parsed.fullName, normalized_name: parsed.normalizedName, identity_key: identityKey,
          major_id: major.id, class_id: classRow.id, admission_year: parsed.admissionYear,
          current_school_year: parsed.schoolYear, username, registration_status: "pending", data_status: "valid",
        }).select("id,full_name,username,auth_user_id,registration_status,data_status,class_id").single();
        if (error || !data) throw new Error("Gagal menyimpan data siswa.");
        roster = data;
      } else {
        if (roster.data_status === "needs_review") throw new Error("Data siswa ditandai perlu validasi admin.");
        const changes: Record<string, unknown> = {
          class_id: classRow.id, major_id: major.id, current_school_year: parsed.schoolYear,
          full_name: parsed.fullName, normalized_name: parsed.normalizedName,
        };
        if (!roster.username) changes.username = await findUsername(admin, parsed.fullName, reservedUsernames);
        const { error } = await admin.from("student_roster").update(changes).eq("id", roster.id);
        if (error) throw new Error("Gagal memperbarui data kelas siswa.");
        roster = { ...roster, ...changes };
      }

      if (roster.registration_status === "inactive") {
        existing.push({ fullName: roster.full_name, username: roster.username ?? "", status: "inactive" });
        return;
      }

      let authUserId = roster.auth_user_id as string | null;
      if (!authUserId) {
        const username = String(roster.username ?? "");
        const loginEmail = `${username}@students.vokasi.invalid`;
        const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
          email: loginEmail,
          password: INITIAL_PASSWORD,
          email_confirm: true,
          user_metadata: { username, account_type: "student" },
        });
        let authUser = createdUser?.user ?? null;
        if (!authUser && createError) authUser = await findAuthUserByEmail(admin, loginEmail);
        if (!authUser) throw new Error("Gagal membuat akun login. Periksa log Edge Function untuk detailnya.");
        authUserId = authUser.id;
        const { error: linkError } = await admin.from("student_roster").update({
          auth_user_id: authUserId, registration_status: "registered", registered_at: new Date().toISOString(),
        }).eq("id", roster.id);
        if (linkError) throw new Error("Akun dibuat tetapi gagal menghubungkannya ke daftar siswa; impor ulang aman untuk melanjutkan.");
        created.push({ fullName: roster.full_name, username: roster.username, status: "created" });
      } else {
        existing.push({ fullName: roster.full_name, username: roster.username, status: "existing" });
      }

      const { error: profileError } = await admin.from("student_profiles").upsert({
        user_id: authUserId, roster_id: roster.id,
      }, { onConflict: "user_id" });
      if (profileError) throw new Error("Akun ada tetapi profil belum tersiapkan; impor ulang aman untuk melanjutkan.");
    } catch (e) {
      failures.push({
        row: rowNumber,
        fullName: parsed.fullName,
        error: e instanceof Error ? e.message : "Gagal memproses siswa.",
      });
    }
  }

  const workers = Array.from({ length: Math.min(STUDENT_CONCURRENCY, studentWork.length) }, async () => {
    while (true) {
      const index = nextWorkIndex++;
      if (index >= studentWork.length) return;
      await processStudent(studentWork[index]);
    }
  });
  await Promise.all(workers);

  const { error: auditError } = await admin.from("school_import_batches").insert({
    created_by: userData.user.id,
    rows_received: students.length + classes.length + majors.length,
    accounts_created: created.length,
    accounts_existing: existing.length,
    failed_rows: failures.length,
    result_details: { created, existing, failures, classes_received: classes.length, majors_received: majors.length },
  });
  if (auditError) console.error("Import audit could not be saved:", auditError.message);

  return json(200, {
    success: failures.length === 0,
    received: students.length + classes.length + majors.length,
    created: created.length,
    existing: existing.length,
    failed: failures.length,
    createdAccounts: created,
    existingAccounts: existing,
    failures,
    note: "Password awal hanya disetel saat akun pertama dibuat; impor ulang tidak mereset password siswa.",
  });
});
