// usage (from the api folder):  npx tsx scripts/make-admin.ts +8801700000000
// The person must have logged in at least once so the account exists.
import { prisma } from '../app/lib/prisma';

async function main() {
  const phone = process.argv[2];
  if (!phone) throw new Error('Usage: npx tsx scripts/make-admin.ts +8801XXXXXXXXX');
  const user = await prisma.user.update({ where: { phone }, data: { role: 'ADMIN' }, select: { id: true, phone: true, role: true } });
  console.log('Now admin:', user);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
