# ASC Hub — ผู้ช่วยความรู้ AI สำหรับทีม ASC

แอปพลิเคชันผู้ช่วยตอบคำถามองค์กร (asc.local) ที่ให้ทีม ASC สนับสนุนผู้ใช้ PEAK ได้เร็วและแม่นยำ — ตอบจาก **คลังความรู้ภายใน** พร้อม **แหล่งอ้างอิง (citations)** ทุกคำตอบ, รองรับ **วิเคราะห์รูปภาพ + OCR ภาษาไทย**, ระบบโควตาต่อวัน และผู้ดูแลระบบครบเครื่อง

## ฟีเจอร์หลัก

- 💬 **แชท AI แบบ RAG** — ตอบจากเอกสารองค์กรพร้อมอ้างอิง [1][2][3] กดดูแหล่งอ้างอิงได้ทุกคำตอบ และมีโหมด "ค้นหาเท่านั้น" สำรองเมื่อโมเดลล่ม
- 🖼️ **แนบรูป + OCR ฟรี** — แนบภาพหน้าจอ/เอกสารให้ AI วิเคราะห์ (VLM) หรือสกัดข้อความด้วย Tesseract.js (tha+eng) แบบไม่เสียค่าใช้จ่าย
- 🔄 **เลือก AI Provider ได้** — zai (Z.ai GLM) / OpenAI-Compatible (OpenRouter, Groq, Together ฯลฯ) / Ollama (โมเดลในเครื่อง) เปลี่ยนได้ทั้งหน้าแชทและหน้าผู้ดูแล
- 📚 **คลังความรู้** — นำเข้า ZIP / Markdown / CSV / XLSX / JSON แบบกันซ้ำอัตโนมัติ, สถานะเอกสาร (เผยแพร่ / รอตรวจสอบ / ผิดพลาด), ทดลองค้นหาดูคะแนนได้ทันที
- 🛡️ **ผู้ดูแลระบบ** — จัดการผู้ใช้ (บทบาท/สถานะ/รหัสผ่าน), ตั้งค่า AI (โควตา/timeout/จำนวน context), ดูสถิติและฟีดแบ็ก
- ⏱️ **โควตารายวัน** — จำกัดจำนวนคำถามต่อผู้ใช้ต่อวัน (ค่าเริ่มต้น 300) พร้อมแจ้งเตือนเมื่อใกล้ถึงขีดจำกัด

## เทคโนโลยี

| ส่วน | ใช้อะไร |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS 4 + shadcn/ui (New York) + Lucide icons |
| ฐานข้อมูล | Prisma ORM + SQLite |
| ยืนยันตัวตน | NextAuth.js v4 (Credentials + scrypt) |
| State | Zustand |
| AI | z-ai-web-dev-sdk / OpenAI-compatible API / Ollama |
| OCR | Tesseract.js 7 (tha+eng) + VLM fallback |

## เริ่มต้นใช้งาน

### 1. ติดตั้ง

```bash
# ต้องมี bun (หรือใช้ npm/pnpm แทนได้)
bun install
```

### 2. ตั้งค่า environment

```bash
cp .env.example .env
# แก้ NEXTAUTH_SECRET เป็นค่าสุ่ม: openssl rand -hex 32
```

### 3. สร้างฐานข้อมูล + บัญชีเริ่มต้น

```bash
bun run db:push        # สร้างตารางทั้งหมด
bunx tsx scripts/seed.ts   # สร้างบัญชีแอดมินเริ่มต้น
```

### 4. รันเซิร์ฟเวอร์

```bash
bun run dev            # http://localhost:3000
```

### 5. เข้าสู่ระบบ

| บัญชี | อีเมล | รหัสผ่าน |
|---|---|---|
| แอดมิน | `admin@asc.local` | `aschub1234` |

> ⚠️ **เปลี่ยนรหัสผ่านทันทีหลังใช้งานจริง** (หน้าผู้ดูแลระบบ → ผู้ใช้)

### 6. นำเข้าคลังความรู้

เข้าหน้า **คลังความรู้** → ปุ่มนำเข้าไฟล์ (รองรับ `.zip .md .txt .csv .xlsx .json`) หรือรันสคริปต์:

```bash
bunx tsx scripts/import-corpus.ts
```

## โครงสร้างสำคัญ

```
src/
├── app/api/          # API routes (chat SSE, search, docs, admin, auth)
├── components/app/   # UI ทั้งหมด (chat, knowledge, admin, store)
└── lib/
    ├── ai/           # provider.ts (multi-provider), ocr.ts, system-prompt.ts
    ├── auth.ts       # NextAuth + scrypt
    ├── rag.ts        # ค้นหาคลังความรู้ (chunk + scoring)
    └── import.ts     # นำเข้าเอกสาร (zip/md/csv/xlsx/json)
prisma/schema.prisma  # 8 ตาราง: User, ChatSession, Message, Document, Chunk, QuotaUsage, Feedback, Setting
scripts/              # seed.ts, import-corpus.ts
```

## ความปลอดภัยที่ตั้งค่าไว้แล้ว

ไฟล์เหล่านี้ **ไม่ถูก commit** ลง Git (ดู `.gitignore`):

- `.env` — secret ทั้งหมด
- `db/` — ฐานข้อมูล SQLite (ข้อมูลผู้ใช้ + เอกสารองค์กร)
- `upload/` — ไฟล์ที่ผู้ใช้อัปโหลด (เอกสาร, รูปแชท)

> คีย์ API ของ provider (OpenAI/Ollama) เก็บในตาราง `Setting` ฝั่งเซิร์ฟเวอร์และ **mask ก่อนส่งกลับ client** เสมอ

## Deploy

```bash
bun run build
bun run start
```

ตั้ง `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` ให้ตรงกับเซิร์ฟเวอร์จริงก่อน build
