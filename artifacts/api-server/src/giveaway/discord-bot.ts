import { EmbedBuilder, type Client } from "discord.js";

export interface Feedback {
  id: string;
  userId: string;
  username: string;
  message: string;
  rating: number;
  timestamp: number;
}

const FEEDBACK_SERVER_ID = "1552565879017832528";
const FEEDBACK_CHANNEL_NAME = "・feedback";
const FEEDBACK_CHANNEL_ID = process.env.DISCORD_FEEDBACK_CHANNEL_ID?.trim();

export class FeedbackStore {
  private feedbacks = new Map<string, Feedback>();

  add(feedback: Feedback): void {
    this.feedbacks.set(feedback.id, feedback);
  }

  get(id: string): Feedback | undefined {
    return this.feedbacks.get(id);
  }

  all(): Feedback[] {
    return Array.from(this.feedbacks.values());
  }
}

export async function sendFeedbackToServer(
  client: Client,
  feedback: Feedback,
): Promise<void> {
  const guild = await client.guilds.fetch(FEEDBACK_SERVER_ID);
  const feedbackChannel = FEEDBACK_CHANNEL_ID
    ? await guild.channels.fetch(FEEDBACK_CHANNEL_ID)
    : (await guild.channels.fetch()).find(
        (channel) =>
          channel?.name === FEEDBACK_CHANNEL_NAME && channel?.isTextBased(),
      );

  if (!feedbackChannel || !feedbackChannel.isTextBased()) {
    throw new Error(
      FEEDBACK_CHANNEL_ID
        ? `Feedback channel "${FEEDBACK_CHANNEL_ID}" was not found or is not text-based.`
        : `Feedback channel "${FEEDBACK_CHANNEL_NAME}" was not found or is not text-based.`,
    );
  }

  const embed = new EmbedBuilder()
    .setColor(
      feedback.rating >= 4
        ? 0x37b77a
        : feedback.rating >= 3
          ? 0xf39c12
          : 0xe74c3c,
    )
    .setAuthor({ name: feedback.username })
    .addFields(
      {
        name: "Message",
        value: feedback.message.trim() || "No message",
      },
      {
        name: "Rate",
        value: `${"⭐".repeat(feedback.rating)}${"☆".repeat(5 - feedback.rating)} (${feedback.rating}/5)`,
      },
      {
        name: "User ID",
        value: feedback.userId,
        inline: true,
      },
    )
    .setTimestamp(feedback.timestamp);

  await feedbackChannel.send({ embeds: [embed] });
}
