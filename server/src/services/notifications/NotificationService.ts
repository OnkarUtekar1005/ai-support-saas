import { prisma } from '../../utils/prisma';

export class NotificationService {
  static async notify(params: {
    userId: string;
    type: string;
    title: string;
    message: string;
    link?: string;
    organizationId: string;
  }) {
    return prisma.notification.create({ data: params });
  }

  static async notifyProjectMembers(params: {
    projectId: string;
    type: string;
    title: string;
    message: string;
    link?: string;
    organizationId: string;
    excludeUserId?: string;
  }) {
    const members = await prisma.projectMember.findMany({
      where: { projectId: params.projectId },
      select: { userId: true },
    });
    const userIds = members.map(m => m.userId).filter(id => id !== params.excludeUserId);
    if (userIds.length === 0) return;
    return prisma.notification.createMany({
      data: userIds.map(userId => ({
        userId,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link,
        organizationId: params.organizationId,
      })),
    });
  }
}
