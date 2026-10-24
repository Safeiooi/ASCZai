import { hashPassword } from '@/lib/auth'
import { db } from '@/lib/db'

async function main() {
  const adminEmail = 'admin@asc.local'
  const existing = await db.user.findUnique({ where: { email: adminEmail } })
  if (!existing) {
    await db.user.create({
      data: {
        email: adminEmail,
        name: 'ผู้ดูแลระบบ ASC',
        password: hashPassword('aschub1234'),
        role: 'admin',
      },
    })
    console.log('✔ สร้างผู้ดูแลระบบเริ่มต้น:', adminEmail, '/ aschub1234')
  } else {
    console.log('• ผู้ดูแลระบบมีอยู่แล้ว:', adminEmail)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
