import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Exclui fisicamente um usuário e o perfil ligado a ele (Customer/Driver).
 *
 * Só é permitido para contas sem nenhum histórico operacional: pedidos,
 * entregas, mudanças de status ou ocorrências. Apagar esses registros
 * destruiria a trilha de auditoria; nesse caso o caminho é desativar
 * (409 com a orientação).
 *
 * A checagem prévia dá a mensagem clara; as FKs com onDelete: Restrict
 * continuam sendo a garantia final se algo for criado entre a checagem e o
 * delete (P2003, que o AllExceptionsFilter também devolve como 409).
 */
export async function deleteUserAccount(
  prisma: PrismaService,
  userId: string,
  deactivateHint: string,
) {
  const [orders, driverDeliveries, assigned, statusChanges, occurrences] =
    await prisma.$transaction([
      prisma.deliveryOrder.count({ where: { customer: { userId } } }),
      prisma.delivery.count({ where: { driver: { userId } } }),
      prisma.delivery.count({ where: { assignedById: userId } }),
      prisma.deliveryStatusHistory.count({ where: { changedById: userId } }),
      prisma.occurrence.count({ where: { reportedById: userId } }),
    ]);

  if (orders + driverDeliveries + assigned + statusChanges + occurrences > 0) {
    throw new ConflictException(
      `Conta com histórico de pedidos ou entregas não pode ser excluída; ${deactivateHint}`,
    );
  }

  await prisma.$transaction([
    prisma.customer.deleteMany({ where: { userId } }),
    prisma.driver.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}
