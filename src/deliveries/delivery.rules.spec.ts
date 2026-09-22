import {
  DeliveryStatus,
  LicenseCategory,
  OrderStatus,
  VehicleStatus,
  VehicleType,
} from '../generated/prisma/client.js';
import {
  ACTIVE_DELIVERY_STATUSES,
  DELIVERY_TRANSITIONS,
  FINAL_DELIVERY_STATUSES,
  ORDER_STATUS_ON_DELIVERY,
  canTransition,
  findAssignmentConflicts,
  isFinalStatus,
  startOfTodayUtc,
  type AssignmentInput,
} from './delivery.rules.js';

const NOW = new Date('2026-09-21T15:00:00Z');

function validInput(overrides: Partial<AssignmentInput> = {}): AssignmentInput {
  return {
    order: { status: OrderStatus.PENDING, weightKg: 10 },
    driver: {
      active: true,
      licenseCategory: LicenseCategory.B,
      licenseExpiresAt: new Date('2030-01-01'),
    },
    vehicle: {
      status: VehicleStatus.AVAILABLE,
      type: VehicleType.VAN,
      capacityKg: 500,
    },
    driverHasActiveDelivery: false,
    vehicleHasActiveDelivery: false,
    now: NOW,
    ...overrides,
  };
}

describe('fluxo de estados da entrega', () => {
  it('permite exatamente o caminho feliz ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED', () => {
    expect(canTransition('ASSIGNED', 'PICKED_UP')).toBe(true);
    expect(canTransition('PICKED_UP', 'IN_TRANSIT')).toBe(true);
    expect(canTransition('IN_TRANSIT', 'DELIVERED')).toBe(true);
  });

  it.each([
    ['ASSIGNED', 'IN_TRANSIT'],
    ['ASSIGNED', 'DELIVERED'],
    ['PICKED_UP', 'DELIVERED'],
    ['PICKED_UP', 'ASSIGNED'],
    ['IN_TRANSIT', 'PICKED_UP'],
    ['IN_TRANSIT', 'ASSIGNED'],
  ] as const)('não permite pular ou voltar etapas: %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it.each(['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] as const)(
    'de %s é possível falhar ou cancelar',
    (from) => {
      expect(canTransition(from, 'FAILED')).toBe(true);
      expect(canTransition(from, 'CANCELLED')).toBe(true);
    },
  );

  it.each(FINAL_DELIVERY_STATUSES)(
    '%s é estado final: não sai para nenhum outro',
    (final) => {
      expect(DELIVERY_TRANSITIONS[final]).toEqual([]);
      for (const target of Object.values(DeliveryStatus)) {
        expect(canTransition(final, target)).toBe(false);
      }
      expect(isFinalStatus(final)).toBe(true);
    },
  );

  it('estados ativos e finais particionam todos os estados', () => {
    const all = Object.values(DeliveryStatus).sort();
    expect(
      [...ACTIVE_DELIVERY_STATUSES, ...FINAL_DELIVERY_STATUSES].sort(),
    ).toEqual(all);
    ACTIVE_DELIVERY_STATUSES.forEach((s) =>
      expect(isFinalStatus(s)).toBe(false),
    );
  });

  it('nenhum estado transita para si mesmo', () => {
    for (const status of Object.values(DeliveryStatus)) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('todo estado ativo tem caminho até algum estado final', () => {
    for (const start of ACTIVE_DELIVERY_STATUSES) {
      const seen = new Set<DeliveryStatus>([start]);
      const queue = [start];
      while (queue.length) {
        for (const next of DELIVERY_TRANSITIONS[queue.shift()!]) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      expect([...seen].some(isFinalStatus)).toBe(true);
    }
  });
});

describe('sincronização do estado do pedido', () => {
  it('cobre todos os estados da entrega', () => {
    expect(Object.keys(ORDER_STATUS_ON_DELIVERY).sort()).toEqual(
      Object.values(DeliveryStatus).sort(),
    );
  });

  it.each([
    ['ASSIGNED', 'SCHEDULED'],
    ['PICKED_UP', 'SCHEDULED'],
    ['IN_TRANSIT', 'IN_TRANSIT'],
    ['DELIVERED', 'DELIVERED'],
    ['FAILED', 'PENDING'],
    ['CANCELLED', 'PENDING'],
  ] as const)('entrega %s → pedido %s', (delivery, order) => {
    expect(ORDER_STATUS_ON_DELIVERY[delivery]).toBe(order);
  });
});

describe('conflitos de atribuição', () => {
  it('atribuição compatível não gera conflitos', () => {
    expect(findAssignmentConflicts(validInput())).toEqual([]);
  });

  it.each([
    OrderStatus.SCHEDULED,
    OrderStatus.IN_TRANSIT,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
  ])('pedido %s não aceita atribuição', (status) => {
    const conflicts = findAssignmentConflicts(
      validInput({ order: { status, weightKg: 10 } }),
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toContain(status);
  });

  it('motorista inativo', () => {
    const input = validInput();
    input.driver.active = false;
    expect(findAssignmentConflicts(input)).toContain('Motorista está inativo');
  });

  it('CNH vencida ontem é rejeitada; CNH que vence hoje ainda vale', () => {
    const expiredYesterday = validInput();
    expiredYesterday.driver.licenseExpiresAt = new Date('2026-09-20');
    expect(findAssignmentConflicts(expiredYesterday)).toContain(
      'CNH do motorista está vencida',
    );

    const expiresToday = validInput();
    expiresToday.driver.licenseExpiresAt = new Date('2026-09-21');
    expect(findAssignmentConflicts(expiresToday)).toEqual([]);
  });

  it('motorista e veículo já ocupados', () => {
    const conflicts = findAssignmentConflicts(
      validInput({
        driverHasActiveDelivery: true,
        vehicleHasActiveDelivery: true,
      }),
    );
    expect(conflicts).toContain('Motorista já possui uma entrega ativa');
    expect(conflicts).toContain('Veículo já está em uma entrega ativa');
  });

  it.each([VehicleStatus.MAINTENANCE, VehicleStatus.INACTIVE])(
    'veículo %s é indisponível',
    (status) => {
      const input = validInput();
      input.vehicle.status = status;
      expect(findAssignmentConflicts(input)[0]).toContain('indisponível');
    },
  );

  it('peso igual à capacidade é aceito; acima é rejeitado', () => {
    const equal = validInput({
      order: { status: OrderStatus.PENDING, weightKg: 500 },
    });
    expect(findAssignmentConflicts(equal)).toEqual([]);

    const over = validInput({
      order: { status: OrderStatus.PENDING, weightKg: 500.01 },
    });
    expect(findAssignmentConflicts(over)[0]).toContain('excede a capacidade');
  });

  it.each([
    ['A', 'MOTORCYCLE', true],
    ['A', 'CAR', false],
    ['A', 'VAN', false],
    ['A', 'TRUCK', false],
    ['B', 'CAR', true],
    ['B', 'VAN', true],
    ['B', 'MOTORCYCLE', false],
    ['B', 'TRUCK', false],
    ['C', 'TRUCK', true],
    ['C', 'MOTORCYCLE', false],
    ['D', 'TRUCK', true],
    ['E', 'TRUCK', true],
  ] as const)('CNH %s × veículo %s → compatível: %s', (category, type, ok) => {
    const input = validInput();
    input.driver.licenseCategory = category;
    input.vehicle.type = type;
    const conflicts = findAssignmentConflicts(input).filter((c) =>
      c.includes('CNH categoria'),
    );
    expect(conflicts.length === 0).toBe(ok);
  });

  it('reporta todos os conflitos de uma vez', () => {
    const input = validInput({
      order: { status: OrderStatus.CANCELLED, weightKg: 9999 },
      driverHasActiveDelivery: true,
    });
    input.driver.active = false;
    input.vehicle.status = VehicleStatus.MAINTENANCE;
    expect(findAssignmentConflicts(input).length).toBeGreaterThanOrEqual(5);
  });
});

describe('startOfTodayUtc', () => {
  it('zera a hora em UTC', () => {
    expect(
      startOfTodayUtc(new Date('2026-09-21T23:59:59Z')).toISOString(),
    ).toBe('2026-09-21T00:00:00.000Z');
  });
});
