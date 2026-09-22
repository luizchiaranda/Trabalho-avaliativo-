-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'DRIVER', 'OPERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "LicenseCategory" AS ENUM ('A', 'B', 'C', 'D', 'E');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('MOTORCYCLE', 'CAR', 'VAN', 'TRUCK');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'MAINTENANCE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'SCHEDULED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OccurrenceType" AS ENUM ('RECIPIENT_ABSENT', 'WRONG_ADDRESS', 'DAMAGED_GOODS', 'VEHICLE_BREAKDOWN', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "document" VARCHAR(14) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "licenseNumber" VARCHAR(20) NOT NULL,
    "licenseCategory" "LicenseCategory" NOT NULL,
    "licenseExpiresAt" DATE NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "plate" VARCHAR(8) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "type" "VehicleType" NOT NULL,
    "capacityKg" DOUBLE PRECISION NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_orders" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "originCep" VARCHAR(8) NOT NULL,
    "originStreet" VARCHAR(160) NOT NULL,
    "originNumber" VARCHAR(20) NOT NULL,
    "originComplement" VARCHAR(80),
    "originNeighborhood" VARCHAR(100) NOT NULL,
    "originCity" VARCHAR(100) NOT NULL,
    "originState" VARCHAR(2) NOT NULL,
    "destinationCep" VARCHAR(8) NOT NULL,
    "destinationStreet" VARCHAR(160) NOT NULL,
    "destinationNumber" VARCHAR(20) NOT NULL,
    "destinationComplement" VARCHAR(80),
    "destinationNeighborhood" VARCHAR(100) NOT NULL,
    "destinationCity" VARCHAR(100) NOT NULL,
    "destinationState" VARCHAR(2) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "assignedById" UUID NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'ASSIGNED',
    "finishedAt" TIMESTAMP(3),
    "proofPath" VARCHAR(255),
    "proofOriginalName" VARCHAR(255),
    "proofMimeType" VARCHAR(100),
    "proofSize" INTEGER,
    "proofUploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_status_history" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "fromStatus" "DeliveryStatus",
    "toStatus" "DeliveryStatus" NOT NULL,
    "changedById" UUID NOT NULL,
    "note" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occurrences" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "reportedById" UUID NOT NULL,
    "type" "OccurrenceType" NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_userId_key" ON "customers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_document_key" ON "customers"("document");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_userId_key" ON "drivers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_licenseNumber_key" ON "drivers"("licenseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_key" ON "vehicles"("plate");

-- CreateIndex
CREATE INDEX "delivery_orders_customerId_idx" ON "delivery_orders"("customerId");

-- CreateIndex
CREATE INDEX "delivery_orders_status_idx" ON "delivery_orders"("status");

-- CreateIndex
CREATE INDEX "deliveries_orderId_idx" ON "deliveries"("orderId");

-- CreateIndex
CREATE INDEX "deliveries_driverId_status_idx" ON "deliveries"("driverId", "status");

-- CreateIndex
CREATE INDEX "deliveries_vehicleId_status_idx" ON "deliveries"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "delivery_status_history_deliveryId_createdAt_idx" ON "delivery_status_history"("deliveryId", "createdAt");

-- CreateIndex
CREATE INDEX "occurrences_deliveryId_idx" ON "occurrences"("deliveryId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "delivery_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_status_history" ADD CONSTRAINT "delivery_status_history_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_status_history" ADD CONSTRAINT "delivery_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- REGRAS ADICIONADAS À MÃO (o Prisma não expressa isso no schema.prisma)
-- =====================================================================

-- 1) ÍNDICES ÚNICOS PARCIAIS
-- Só pode existir UMA entrega "ativa" por pedido, por motorista e por veículo.
-- Protege contra condição de corrida: se dois operadores atribuírem o mesmo
-- motorista ao mesmo tempo, o banco recusa o segundo (o service converte em 409).
CREATE UNIQUE INDEX "deliveries_one_active_per_order"
  ON "deliveries" ("orderId")
  WHERE "status" IN ('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT');

CREATE UNIQUE INDEX "deliveries_one_active_per_driver"
  ON "deliveries" ("driverId")
  WHERE "status" IN ('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT');

CREATE UNIQUE INDEX "deliveries_one_active_per_vehicle"
  ON "deliveries" ("vehicleId")
  WHERE "status" IN ('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT');

-- 2) CHECK CONSTRAINTS (última linha de defesa da integridade dos dados)
ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_capacity_positive" CHECK ("capacityKg" > 0);

ALTER TABLE "delivery_orders"
  ADD CONSTRAINT "delivery_orders_weight_positive" CHECK ("weightKg" > 0),
  ADD CONSTRAINT "delivery_orders_origin_cep_format" CHECK ("originCep" ~ '^[0-9]{8}$'),
  ADD CONSTRAINT "delivery_orders_destination_cep_format" CHECK ("destinationCep" ~ '^[0-9]{8}$');

-- Uma entrega só pode estar DELIVERED se tiver comprovante enviado.
ALTER TABLE "deliveries"
  ADD CONSTRAINT "deliveries_delivered_requires_proof"
  CHECK ("status" <> 'DELIVERED' OR "proofPath" IS NOT NULL);

-- finishedAt preenchido se, e somente se, a entrega está em estado final.
ALTER TABLE "deliveries"
  ADD CONSTRAINT "deliveries_finished_at_matches_final_status"
  CHECK (("status" IN ('DELIVERED', 'FAILED', 'CANCELLED')) = ("finishedAt" IS NOT NULL));
