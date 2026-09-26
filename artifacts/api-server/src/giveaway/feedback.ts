import { randomInt, randomUUID } from "node:crypto";
import {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  REST,
  Routes,
  type ChatInputCommandInteraction,
  type Interaction,
} from "discord.js";
import { logger } from "../lib/logger";
import { giveawayCommands, parseDuration } from "./commands";
import {
  claimButton,
  enterButton,
  giveawayComponents,
  giveawayEmbed,
} from "./presentation";
import { GiveawayStore, type Giveaway } from "./store";
import { FeedbackStore, sendFeedbackToServer, type Feedback } from "./feedback";

const minimumDuration = 60_000;
const maximumDuration = 365 * 24 * 60 * 60 * 1000;

function getManagementPermission(
  interaction: ChatInputCommandInteraction,
): boolean {
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false
  );
}

function getGuildGiveaway(
  store: GiveawayStore,
  giveawayId: string,
  guildId: string,
): Giveaway | undefined {
  const giveaway = store.get(giveawayId);
  return giveaway?.guildId === guildId ? giveaway : undefined;
}

async function safeEditPublicPost(
  client: Client,
  giveaway: Giveaway,
): Promise<void> {
  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    if (!channel?.isTextBased() || !("messages" in channel)) return;
    const message = await channel.messages.fetch(giveaway.messageId);
    await message.edit({
      embeds: [giveawayEmbed(giveaway)],
      components: giveawayComponents(giveaway),
      allowedMentions: { parse: [] },
    });
  } catch {
    logger.warn(
      { giveawayId: giveaway.id },
      "Could not update a giveaway post",
    );
  }
}

async function notifyCreatorPrivately(
  client: Client,
  giveaway: Giveaway,
  message: string,
): Promise<void> {
  try {
    const creator = await client.users.fetch(giveaway.creatorId);
    await creator.send({ content: message, allowedMentions: { parse: [] } });
  } catch {
    logger.warn(
      { giveawayId: giveaway.id },
      "Could not privately notify the giveaway organizer",
    );
  }
}

async function closeGiveaway(
  client: Client,
  store: GiveawayStore,
  giveawayId: string,
): Promise<"closed" | "missing" | "already-closed"> {
  const giveaway = store.get(giveawayId);
  if (!giveaway) return "missing";
  if (giveaway.status !== "running") return "already-closed";

  const entrants = [...giveaway.participantIds];
  const selectedWinner =
    giveaway.selectedWinnerId &&
    entrants.includes(giveaway.selectedWinnerId)
      ? giveaway.selectedWinnerId
      : undefined;
  const winnerId =
    selectedWinner ??
    (entrants.length > 0 ? entrants[randomInt(entrants.length)] : undefined);
  const now = Date.now();

  const closedGiveaway = store.update(giveawayId, (current) => {
    if (current.status !== "running") return;
    if (!winnerId) {
      current.status = "ended";
      return;
    }
    current.winnerId = winnerId;
    current.claimDeadlineAt = now + current.claimTimeMs;
    current.status = "awaiting_claim";
  });

  if (!closedGiveaway || closedGiveaway.status === "running") {
    return "already-closed";
  }

  await safeEditPublicPost(client, closedGiveaway);

  if (winnerId) {
    const deadline = `<t:${Math.floor(
      (closedGiveaway.claimDeadlineAt ?? now) / 1000,
    )}:R>`;
    try {
      const winner = await client.users.fetch(winnerId);
      await winner.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x37b77a)
            .setTitle("You won a giveaway")
            .setDescription(
              `You won **${closedGiveaway.prize}**. Claim it before ${deadline}.`,
            )
            .addFields(
              {
                name: "Server",
                value: `<#${closedGiveaway.channelId}>`,
                inline: true,
              },
              { name: "Giveaway ID", value: closedGiveaway.id, inline: true },
            ),
        ],
        components: claimButton(closedGiveaway.id),
        allowedMentions: { parse: [] },
      });
    } catch {
      await notifyCreatorPrivately(
        client,
        closedGiveaway,
        `Giveaway ${closedGiveaway.id}: the winner could not receive a DM. Winner: <@${winnerId}>. Contact them privately before ${deadline}.`,
      );
    }
  }

  return "closed";
}

async function expireClaimWindow(
  client: Client,
  store: GiveawayStore,
  giveawayId: string,
): Promise<void> {
  const giveaway = store.get(giveawayId);
  if (
    !giveaway ||
    giveaway.status !== "awaiting_claim" ||
    !giveaway.claimDeadlineAt ||
    giveaway.claimDeadlineAt > Date.now()
  ) {
    return;
  }

  const expired = store.update(giveawayId, (current) => {
    if (current.status === "awaiting_claim") current.status = "unclaimed";
  });
  if (!expired || expired.status !== "unclaimed") return;

  await safeEditPublicPost(client, expired);
  await notifyCreatorPrivately(
    client,
    expired,
    `The claim window for giveaway ${expired.id} (${expired.prize}) expired without a claim. No winner was announced publicly.`,
  );
}

async function runScheduledWork(
  client: Client,
  store: GiveawayStore,
): Promise<void> {
  const now = Date.now();
  for (const giveaway of [...store.all()]) {
    if (giveaway.status === "running" && giveaway.endsAt <= now) {
      await closeGiveaway(client, store, giveaway.id);
    } else if (
      giveaway.status === "awaiting_claim" &&
      giveaway.claimDeadlineAt !== undefined &&
      giveaway.claimDeadlineAt <= now
    ) {
      await expireClaimWindow(client, store, giveaway.id);
    }
  }
}

async function handleCreate(
  interaction: ChatInputCommandInteraction,
  client: Client,
  store: GiveawayStore,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.editReply("Giveaways can only be created in a server.");
    return;
  }

  const duration = parseDuration(interaction.options.getString("duration", true));
  const claimTime = parseDuration(
    interaction.options.getString("claim-time", true),
  );
  if (!duration || duration < minimumDuration || duration > maximumDuration) {
    await interaction.editReply(
      "Enter a giveaway duration between 1 minute and 365 days, such as `2h` or `1d 4h`.",
    );
    return;
  }
  if (!claimTime || claimTime < minimumDuration || claimTime > maximumDuration) {
    await interaction.editReply(
      "Enter a claim time between 1 minute and 365 days, such as `15m` or `2h`.",
    );
    return;
  }

  const channel = interaction.channel;
  if (!channel?.isTextBased() || !("send" in channel)) {
    await interaction.editReply(
      "I can't post a giveaway in this channel. Try a text channel.",
    );
    return;
  }

  const now = Date.now();
  const giveaway: Giveaway = {
    id: randomUUID().slice(0, 8),
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: "",
    creatorId: interaction.user.id,
    prize: interaction.options.getString("prize", true),
    description: interaction.options.getString("description") ?? "",
    requirement: interaction.options.getString("requirement") ?? "",
    createdAt: now,
    endsAt: now + duration,
    claimTimeMs: claimTime,
    participantIds: [],
    status: "running",
  };

  const post = await channel.send({
    embeds: [giveawayEmbed(giveaway)],
    components: enterButton(giveaway),
    allowedMentions: { parse: [] },
  });
  giveaway.messageId = post.id;

  try {
    store.add(giveaway);
  } catch {
    await post.delete().catch(() => undefined);
    await interaction.editReply(
      "I couldn't save this giveaway. Please try again.",
    );
    logger.error(
      { giveawayId: giveaway.id },
      "Could not persist a new giveaway",
    );
    return;
  }

  await interaction.editReply(
    `Giveaway created. ID: \`${giveaway.id}\`\n[Open giveaway post](https://discord.com/channels/${giveaway.guildId}/${giveaway.channelId}/${giveaway.messageId})`,
  );
}

async function handlePick(
  interaction: ChatInputCommandInteraction,
  store: GiveawayStore,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.editReply("This command can only be used in a server.");
    return;
  }
  const id = interaction.options.getString("giveaway-id", true);
  const giveaway = getGuildGiveaway(store, id, interaction.guildId);
  if (!giveaway || giveaway.status !== "running") {
    await interaction.editReply(
      "That giveaway isn't running in this server.",
    );
    return;
  }

  const entrant = interaction.options.getUser("entrant", true);
  if (!giveaway.participantIds.includes(entrant.id)) {
    await interaction.editReply(
      `${entrant.username} hasn't entered this giveaway.`,
    );
    return;
  }

  store.update(id, (current) => {
    current.selectedWinnerId = entrant.id;
  });
  await interaction.editReply(
    `Your winner selection for giveaway \`${id}\` is saved privately. If it is still selected when the giveaway ends, they will win; otherwise the bot will draw from the entrants.`,
  );
}

async function handleEnd(
  interaction: ChatInputCommandInteraction,
  client: Client,
  store: GiveawayStore,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.editReply("This command can only be used in a server.");
    return;
  }
  const id = interaction.options.getString("giveaway-id", true);
  const giveaway = getGuildGiveaway(store, id, interaction.guildId);
  if (!giveaway || giveaway.status !== "running") {
    await interaction.editReply(
      "That giveaway isn't running in this server.",
    );
    return;
  }

  const result = await closeGiveaway(client, store, id);
  await interaction.editReply(
    result === "closed"
      ? `Giveaway \`${id}\` ended. Winner details are not posted publicly.`
      : "That giveaway has already ended.",
  );
}

async function handleList(
  interaction: ChatInputCommandInteraction,
  store: GiveawayStore,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.editReply("This command can only be used in a server.");
    return;
  }
  const running = store
    .all()
    .filter(
      (giveaway) =>
        giveaway.guildId === interaction.guildId &&
        giveaway.status === "running",
    )
    .sort((left, right) => left.endsAt - right.endsAt);

  if (running.length === 0) {
    await interaction.editReply("There are no running giveaways in this server.");
    return;
  }

  const lines = running.map(
    (giveaway) =>
      `• \`${giveaway.id}\` — **${giveaway.prize}** — <#${giveaway.channelId}> — ends <t:${Math.floor(giveaway.endsAt / 1000)}:R> — ${giveaway.participantIds.length} entries`,
  );
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current.length + line.length + 1 > 1800) {
      chunks.push(current);
      current = "";
    }
    current += `${current ? "\n" : ""}${line}`;
  }
  if (current) chunks.push(current);

  await interaction.editReply({
    content: `Running giveaways in this server (${running.length}):\n${chunks[0]}`,
  });
  for (const chunk of chunks.slice(1)) {
    await interaction.followUp({
      content: chunk,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleFeedback(
  interaction: ChatInputCommandInteraction,
  client: Client,
  feedbackStore: FeedbackStore,
): Promise<void> {
  const message = interaction.options.getString("message") ?? "";
  const rating = interaction.options.getInteger("rate", true);

  const feedback: Feedback = {
    id: randomUUID(),
    userId: interaction.user.id,
    username: interaction.user.username,
    message,
    rating,
    timestamp: Date.now(),
  };

  feedbackStore.add(feedback);

  try {
    await sendFeedbackToServer(client, feedback);
    await interaction.editReply(
      "Thank you for your feedback! It has been sent to the developers.",
    );
  } catch (error) {
    logger.error({ error }, "Failed to process feedback");
    await interaction.editReply(
      "An error occurred while processing your feedback. Please try again.",
    );
  }
}

async function handleCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
  store: GiveawayStore,
  feedbackStore: FeedbackStore,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (
    interaction.commandName !== "giveaway-list" &&
    interaction.commandName !== "feedback" &&
    !getManagementPermission(interaction)
  ) {
    await interaction.editReply(
      "You need the Manage Server permission to manage giveaways.",
    );
    return;
  }

  switch (interaction.commandName) {
    case "giveaway-create":
      await handleCreate(interaction, client, store);
      break;
    case "giveaway-pick":
      await handlePick(interaction, store);
      break;
    case "giveaway-end":
      await handleEnd(interaction, client, store);
      break;
    case "giveaway-list":
      await handleList(interaction, store);
      break;
    case "feedback":
      await handleFeedback(interaction, client, feedbackStore);
      break;
    default:
      await interaction.editReply("Unknown command.");
  }
}

async function handleEnterButton(
  interaction: Interaction,
  store: GiveawayStore,
): Promise<void> {
  if (!interaction.isButton() || !interaction.customId.startsWith("giveaway:enter:")) {
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const id = interaction.customId.slice("giveaway:enter:".length);
  const giveaway = store.get(id);
  if (
    !giveaway ||
    giveaway.status !== "running" ||
    giveaway.guildId !== interaction.guildId ||
    giveaway.endsAt <= Date.now()
  ) {
    await interaction.editReply("This giveaway has ended.");
    return;
  }
  if (giveaway.participantIds.includes(interaction.user.id)) {
    await interaction.editReply("You're already entered.");
    return;
  }

  store.update(id, (current) => {
    if (current.status === "running") {
      current.participantIds.push(interaction.user.id);
    }
  });
  await interaction.message
    .edit({
      embeds: [giveawayEmbed(giveaway)],
      components: enterButton(giveaway),
      allowedMentions: { parse: [] },
    })
    .catch(() => undefined);
  await interaction.editReply("You're entered. Good luck.");
}

async function handleClaimButton(
  interaction: Interaction,
  store: GiveawayStore,
): Promise<void> {
  if (!interaction.isButton() || !interaction.customId.startsWith("giveaway:claim:")) {
    return;
  }
  await interaction.deferReply({
    ...(interaction.inGuild() ? { flags: MessageFlags.Ephemeral } : {}),
  });

  const id = interaction.customId.slice("giveaway:claim:".length);
  const giveaway = store.get(id);
  if (!giveaway || giveaway.winnerId !== interaction.user.id) {
    await interaction.editReply("This claim button isn't assigned to you.");
    return;
  }
  if (giveaway.status !== "awaiting_claim") {
    await interaction.editReply(
      giveaway.status === "claimed"
        ? "This prize has already been claimed."
        : "This claim is no longer active.",
    );
    return;
  }
  if (!giveaway.claimDeadlineAt || giveaway.claimDeadlineAt <= Date.now()) {
    await expireClaimWindow(interaction.client, store, id);
    await interaction.editReply("The claim window has expired.");
    return;
  }

  const claimed = store.update(id, (current) => {
    if (current.status === "awaiting_claim") {
      current.status = "claimed";
      current.claimedAt = Date.now();
    }
  });
  if (claimed) await safeEditPublicPost(interaction.client, claimed);
  await interaction.message.edit({ components: [] }).catch(() => undefined);
  await interaction.editReply(
    "Your prize is claimed. Contact the giveaway organizer to arrange delivery.",
  );
}

async function registerCommands(
  clientId: string,
  token: string,
): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), {
    body: giveawayCommands,
  });
}

export async function startGiveawayBot(): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) {
    logger.warn(
      "Discord giveaway bot is inactive; add DISCORD_BOT_TOKEN as a Replit Secret to connect it",
    );
    return;
  }

  const store = new GiveawayStore();
  const feedbackStore = new FeedbackStore();
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  let sweepInProgress = false;

  client.on(Events.InteractionCreate, (interaction) => {
    const handler = interaction.isChatInputCommand()
      ? handleCommand(interaction, client, store, feedbackStore)
      : handleEnterButton(interaction, store).then(() =>
          handleClaimButton(interaction, store),
        );
    void handler.catch(() => {
      logger.error(
        { interactionType: interaction.type },
        "Giveaway interaction failed",
      );
      if (interaction.isRepliable() && !interaction.replied) {
        const content = "Something went wrong. Please try again.";
        const recovery = interaction.deferred
          ? interaction.editReply(content)
          : interaction.reply({
              content,
              flags: MessageFlags.Ephemeral,
            });
        void recovery.catch(() => undefined);
      }
    });
  });

  client.once(Events.ClientReady, (readyClient) => {
    logger.info(
      { botUserId: readyClient.user.id },
      "Discord giveaway bot connected",
    );
    void registerCommands(readyClient.user.id, token)
      .then(() => logger.info("Registered giveaway slash commands"))
      .catch((error: unknown) => {
        logger.error(
          { errorName: error instanceof Error ? error.name : "UnknownError" },
          "Could not register giveaway slash commands",
        );
      });

    const sweep = async () => {
      if (sweepInProgress) return;
      sweepInProgress = true;
      try {
        await runScheduledWork(client, store);
      } catch (error) {
        logger.error(
          { errorName: error instanceof Error ? error.name : "UnknownError" },
          "Scheduled giveaway processing failed",
        );
      } finally {
        sweepInProgress = false;
      }
    };

    void sweep();
    const timer = setInterval(() => void sweep(), 10_000);
    timer.unref();
  });

  client.on(Events.Error, () => {
    logger.error("Discord client reported a connection error");
  });

  try {
    await client.login(token);
  } catch {
    logger.error(
      "Discord giveaway bot could not connect; verify the bot token and server access",
    );
    await client.destroy();
  }
}
