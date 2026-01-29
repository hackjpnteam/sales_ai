import { getCollection } from "./mongodb";
import { UserNotification } from "./types";
import { v4 as uuidv4 } from "uuid";

// ユーザー個別通知を作成
export async function createUserNotification(params: {
  userId: string;
  type: "share" | "welcome" | "info";
  title: string;
  message: string;
  link?: string;
  fromUserId?: string;
  fromUserName?: string;
  agentId?: string;
  agentName?: string;
}): Promise<void> {
  const userNotificationsCol = await getCollection<UserNotification>("user_notifications");

  const notification: UserNotification = {
    notificationId: uuidv4(),
    userId: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link,
    fromUserId: params.fromUserId,
    fromUserName: params.fromUserName,
    agentId: params.agentId,
    agentName: params.agentName,
    isRead: false,
    createdAt: new Date(),
  };

  await userNotificationsCol.insertOne(notification);
  console.log(`[Notification] Created ${params.type} notification for user ${params.userId}`);
}

// エージェント共有通知を送信
export async function sendShareNotification(params: {
  toUserId: string;
  fromUserId: string;
  fromUserName: string;
  agentId: string;
  agentName: string;
}): Promise<void> {
  await createUserNotification({
    userId: params.toUserId,
    type: "share",
    title: "エージェントが共有されました",
    message: `${params.fromUserName} さんから「${params.agentName}」が共有されました。`,
    link: `/dashboard/agent/${params.agentId}`,
    fromUserId: params.fromUserId,
    fromUserName: params.fromUserName,
    agentId: params.agentId,
    agentName: params.agentName,
  });
}

// ウェルカム通知を送信
export async function sendWelcomeNotification(userId: string): Promise<void> {
  await createUserNotification({
    userId,
    type: "welcome",
    title: "ご登録ありがとうございます！",
    message: `ChatSalesへようこそ！\n\n支配人の戸村光（CEO of HackJPN）です。\n\nご登録いただき、誠にありがとうございます。ChatSalesは、AIチャットボットを簡単に作成・運用できるプラットフォームです。\n\nご不明な点がございましたら、お気軽にお問い合わせください。`,
    fromUserName: "戸村光 (CEO of HackJPN)",
  });
}
