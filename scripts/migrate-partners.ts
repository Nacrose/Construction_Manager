#!/usr/bin/env node
/**
 * Migration script: Populate Partner model from existing Supplier & EquipmentVendor records
 *
 * Run with: npx tsx scripts/migrate-partners.ts
 *
 * What it does:
 *   1. Creates Partner records from Suppliers (type: material_supplier)
 *   2. Creates Partner records from EquipmentVendors (type: equipment_vendor)
 *   3. Deduplicates: same project + same name in both → single Partner (type: both)
 *   4. Links PurchaseOrder.partnerId and EquipmentRental.partnerId to new Partners
 */

import { PrismaClient, PartnerType } from "@prisma/client";

const prisma = new PrismaClient();

async function migrateSuppliers() {
  console.log("\n--- Migrating Suppliers → Partners ---");

  const suppliers = await prisma.supplier.findMany({
    include: { purchaseOrders: true },
  });
  console.log(`Found ${suppliers.length} suppliers.`);

  let created = 0;
  let linked = 0;
  let skipped = 0;

  for (const supplier of suppliers) {
    const existingPartner = await prisma.partner.findFirst({
      where: {
        projectId: supplier.projectId,
        name: supplier.name,
        type: { in: ["material_supplier", "both"] },
      },
    });

    if (existingPartner) {
      skipped++;
      continue;
    }

    const partner = await prisma.partner.create({
      data: {
        projectId: supplier.projectId,
        name: supplier.name,
        type: PartnerType.material_supplier,
        contact: supplier.contact,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        pan: supplier.pan,
        rating: supplier.rating,
        status: "active",
      },
    });

    for (const po of supplier.purchaseOrders) {
      await prisma.purchaseOrder.update({
        where: { id: po.id },
        data: { partnerId: partner.id },
      });
      linked++;
    }

    created++;
    if (created % 50 === 0) {
      console.log(`  ✓ ${created} suppliers migrated...`);
    }
  }

  console.log(`  Created: ${created} partners, linked POs: ${linked}, skipped (already exist): ${skipped}`);
  return { created, linked };
}

async function migrateEquipmentVendors() {
  console.log("\n--- Migrating EquipmentVendors → Partners ---");

  const vendors = await prisma.equipmentVendor.findMany({
    include: { rentals: true },
  });
  console.log(`Found ${vendors.length} equipment vendors.`);

  let created = 0;
  let merged = 0;
  let linked = 0;
  let skipped = 0;

  for (const vendor of vendors) {
    const existingPartner = await prisma.partner.findFirst({
      where: {
        projectId: vendor.projectId,
        name: vendor.name,
      },
    });

    if (existingPartner) {
      // Same name exists — upgrade to "both" if currently material_supplier
      if (existingPartner.type === PartnerType.material_supplier) {
        await prisma.partner.update({
          where: { id: existingPartner.id },
          data: { type: PartnerType.both },
        });

        // Merge fields if vendor has info supplier lacked
        const updates: Record<string, any> = {};
        if (vendor.contact && !existingPartner.contact) updates.contact = vendor.contact;
        if (vendor.phone && !existingPartner.phone) updates.phone = vendor.phone;
        if (vendor.email && !existingPartner.email) updates.email = vendor.email;
        if (vendor.address && !existingPartner.address) updates.address = vendor.address;
        if (vendor.pan && !existingPartner.pan) updates.pan = vendor.pan;
        if (Object.keys(updates).length > 0) {
          await prisma.partner.update({
            where: { id: existingPartner.id },
            data: updates,
          });
        }

        for (const rental of vendor.rentals) {
          await prisma.equipmentRental.update({
            where: { id: rental.id },
            data: { partnerId: existingPartner.id },
          });
          linked++;
        }
        merged++;
      } else if (existingPartner.type === PartnerType.equipment_vendor) {
        skipped++;
      } else {
        // both already
        for (const rental of vendor.rentals) {
          await prisma.equipmentRental.update({
            where: { id: rental.id },
            data: { partnerId: existingPartner.id },
          });
          linked++;
        }
        skipped++;
      }
      continue;
    }

    const partner = await prisma.partner.create({
      data: {
        projectId: vendor.projectId,
        name: vendor.name,
        type: PartnerType.equipment_vendor,
        contact: vendor.contact,
        phone: vendor.phone,
        email: vendor.email,
        address: vendor.address,
        pan: vendor.pan,
        rating: 0,
        status: vendor.status,
        notes: vendor.notes,
      },
    });

    for (const rental of vendor.rentals) {
      await prisma.equipmentRental.update({
        where: { id: rental.id },
        data: { partnerId: partner.id },
      });
      linked++;
    }

    created++;
    if (created % 50 === 0) {
      console.log(`  ✓ ${created} equipment vendors migrated...`);
    }
  }

  console.log(`  Created: ${created}, merged (upgraded to both): ${merged}, linked rentals: ${linked}, skipped: ${skipped}`);
  return { created, merged, linked };
}

async function verifyMigration() {
  console.log("\n--- Verification ---");

  const partnerCount = await prisma.partner.count();
  const supplierCount = await prisma.supplier.count();
  const vendorCount = await prisma.equipmentVendor.count();
  const posWithPartner = await prisma.purchaseOrder.count({
    where: { partnerId: { not: null } },
  });
  const rentalsWithPartner = await prisma.equipmentRental.count({
    where: { partnerId: { not: null } },
  });
  const bothCount = await prisma.partner.count({
    where: { type: PartnerType.both },
  });

  console.log(`Partners:             ${partnerCount}`);
  console.log(`Suppliers:            ${supplierCount}`);
  console.log(`Equipment Vendors:    ${vendorCount}`);
  console.log(`Both type:            ${bothCount}`);
  console.log(`POs linked to Partner: ${posWithPartner} / ${await prisma.purchaseOrder.count()}`);
  console.log(`Rentals linked to Partner: ${rentalsWithPartner} / ${await prisma.equipmentRental.count()}`);

  const unlinkedSuppliers = await prisma.supplier.count({
    where: {
      purchaseOrders: {
        some: {
          partnerId: null,
        },
      },
    },
  });
  if (unlinkedSuppliers > 0) {
    console.log(`⚠ Suppliers with unlinked POs: ${unlinkedSuppliers}`);
  }
}

migrateSuppliers()
  .then(() => migrateEquipmentVendors())
  .then(() => verifyMigration())
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
