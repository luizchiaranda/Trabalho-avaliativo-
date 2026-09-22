import {
  DeliveryStatus,
  LicenseCategory,
  OrderStatus,
  VehicleStatus,
  VehicleType,
} from '../generated/prisma/client.js';

export const ACTIVE_DELIVERY_STATUSES: DeliveryStatus[] = [
  DeliveryStatus.ASSIGNED,
  DeliveryStatus.PICKED_UP,
  DeliveryStatus.IN_TRANSIT,
];

export const DELIVERY_TRANSITIONS: Record<
  DeliveryStatus,
  readonly DeliveryStatus[]
> = {
  ASSIGNED: ['PICKED_UP', 'FAILED', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'FAILED', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'FAILED', 'CANCELLED'],
  DELIVERED: [],
  FAILED: [],
  CANCELLED: [],
};

export const FINAL_DELIVERY_STATUSES: DeliveryStatus[] = [
  DeliveryStatus.DELIVERED,
  DeliveryStatus.FAILED,
  DeliveryStatus.CANCELLED,
];

// 'ASSIGNED' fica na lista de propósito: nenhuma transição leva a esse
// estado (só a criação da entrega chega lá), então pedir esse alvo deve
// cair em 409 "transição inválida" pelo canTransition, e não em 403 — o
// problema é o estado pedido não existir como destino, não a falta de
// permissão do motorista.
export const DRIVER_TARGET_STATUSES: DeliveryStatus[] = [
  DeliveryStatus.ASSIGNED,
  DeliveryStatus.PICKED_UP,
  DeliveryStatus.IN_TRANSIT,
  DeliveryStatus.DELIVERED,
  DeliveryStatus.FAILED,
];

export const STAFF_TARGET_STATUSES: DeliveryStatus[] = [
  DeliveryStatus.CANCELLED,
];

export const ORDER_STATUS_ON_DELIVERY: Record<DeliveryStatus, OrderStatus> = {
  ASSIGNED: OrderStatus.SCHEDULED,
  PICKED_UP: OrderStatus.SCHEDULED,
  IN_TRANSIT: OrderStatus.IN_TRANSIT,
  DELIVERED: OrderStatus.DELIVERED,
  FAILED: OrderStatus.PENDING,
  CANCELLED: OrderStatus.PENDING,
};

// Simplificação didática: B dirige carro/van; C, D e E também dirigem caminhão.
export const LICENSE_ALLOWED_VEHICLES: Record<LicenseCategory, VehicleType[]> =
  {
    A: [VehicleType.MOTORCYCLE],
    B: [VehicleType.CAR, VehicleType.VAN],
    C: [VehicleType.CAR, VehicleType.VAN, VehicleType.TRUCK],
    D: [VehicleType.CAR, VehicleType.VAN, VehicleType.TRUCK],
    E: [VehicleType.CAR, VehicleType.VAN, VehicleType.TRUCK],
  };

export function canTransition(from: DeliveryStatus, to: DeliveryStatus) {
  return DELIVERY_TRANSITIONS[from].includes(to);
}

export function isFinalStatus(status: DeliveryStatus) {
  return FINAL_DELIVERY_STATUSES.includes(status);
}

export function startOfTodayUtc(now: Date = new Date()) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export interface AssignmentInput {
  order: { status: OrderStatus; weightKg: number };
  driver: {
    active: boolean;
    licenseCategory: LicenseCategory;
    licenseExpiresAt: Date;
  };
  vehicle: { status: VehicleStatus; type: VehicleType; capacityKg: number };
  driverHasActiveDelivery: boolean;
  vehicleHasActiveDelivery: boolean;
  now?: Date;
}

export function findAssignmentConflicts(input: AssignmentInput): string[] {
  const { order, driver, vehicle } = input;
  const conflicts: string[] = [];

  if (order.status !== OrderStatus.PENDING) {
    conflicts.push(
      `Pedido no estado ${order.status} não pode receber atribuição (apenas PENDING)`,
    );
  }
  if (!driver.active) conflicts.push('Motorista está inativo');
  if (driver.licenseExpiresAt < startOfTodayUtc(input.now)) {
    conflicts.push('CNH do motorista está vencida');
  }
  if (input.driverHasActiveDelivery) {
    conflicts.push('Motorista já possui uma entrega ativa');
  }
  if (vehicle.status !== VehicleStatus.AVAILABLE) {
    conflicts.push(`Veículo indisponível (status ${vehicle.status})`);
  }
  if (input.vehicleHasActiveDelivery) {
    conflicts.push('Veículo já está em uma entrega ativa');
  }
  if (
    !LICENSE_ALLOWED_VEHICLES[driver.licenseCategory].includes(vehicle.type)
  ) {
    conflicts.push(
      `CNH categoria ${driver.licenseCategory} não habilita a conduzir veículo do tipo ${vehicle.type}`,
    );
  }
  if (order.weightKg > vehicle.capacityKg) {
    conflicts.push(
      `Peso do pedido (${order.weightKg} kg) excede a capacidade do veículo (${vehicle.capacityKg} kg)`,
    );
  }
  return conflicts;
}
