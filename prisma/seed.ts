import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../shared/src/utils/passwords';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Seeding database...');

  // Create platform admin user (for development/testing)
  const adminPassword = await hashPassword('AdminPassword123!');

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@movemate.ae' },
    update: {},
    create: {
      email: 'admin@movemate.ae',
      firstName: 'Admin',
      lastName: 'User',
      role: 'platform_admin',
      status: 'verified',
      passwordHash: adminPassword,
      locale: 'en',
    },
  });

  console.log('Created admin user:', adminUser.id);

  // Create sample customer
  const customerPassword = await hashPassword('Customer123!');

  const customer = await prisma.user.upsert({
    where: { email: 'customer@movemate.ae' },
    update: {},
    create: {
      email: 'customer@movemate.ae',
      firstName: 'Ahmad',
      lastName: 'Customer',
      role: 'customer',
      status: 'verified',
      passwordHash: customerPassword,
      locale: 'en',
    },
  });

  await prisma.customer.upsert({
    where: { userId: customer.id },
    update: {},
    create: {
      userId: customer.id,
      activityPreferences: JSON.stringify(['gym', 'swimming']),
    },
  });

  console.log('Created customer user:', customer.id);

  // Create sample trainer
  const trainerPassword = await hashPassword('Trainer123!');

  const trainer = await prisma.user.upsert({
    where: { email: 'trainer@movemate.ae' },
    update: {},
    create: {
      email: 'trainer@movemate.ae',
      firstName: 'Fatima',
      lastName: 'Trainer',
      role: 'trainer',
      status: 'verified',
      passwordHash: trainerPassword,
      locale: 'en',
    },
  });

  await prisma.trainer.upsert({
    where: { userId: trainer.id },
    update: {},
    create: {
      userId: trainer.id,
      status: 'approved',
      disciplines: JSON.stringify(['Personal Training', 'Yoga']),
      hourlyRateAed: 150,
      ratingAvg: 4.8,
      totalSessions: 42,
      foundingTrainerBadge: true,
    },
  });

  console.log('Created trainer user:', trainer.id);

  // Create sample studio
  const studio = await prisma.studio.upsert({
    where: { id: 'studio-001' },
    update: {},
    create: {
      id: 'studio-001',
      name: 'FitZone Dubai Marina',
      address: 'Marina Mall, Dubai Marina, Dubai, UAE',
      lat: 25.0761,
      lng: 55.1494,
      phone: '+971501234567',
      email: 'info@fitzone.ae',
      facilities: JSON.stringify(['Gym', 'Studio Rooms', 'Lounge', 'Outdoor']),
      contractSignedAt: new Date(),
      revenueSharePct: 30,
      status: 'active',
    },
  });

  console.log('Created studio:', studio.id);

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
