import {
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

export const giveawayCommands = [
  new SlashCommandBuilder()
    .setName("giveaway-create")
    .setDescription("Create a giveaway in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("prize")
        .setDescription("What participants can win")
        .setMaxLength(100)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("How long entries stay open, such as 2h or 1d")
        .setMaxLength(40)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("claim-time")
        .setDescription("How long the winner has to claim, such as 15m")
        .setMaxLength(40)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription("Extra details shown in the giveaway")
        .setMaxLength(1000),
    )
    .addStringOption((option) =>
      option
        .setName("requirement")
        .setDescription("Eligibility requirement shown to participants")
        .setMaxLength(1000),
    ),
  new SlashCommandBuilder()
    .setName("giveaway-pick")
    .setDescription("Privately choose an entrant as the winner")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("giveaway-id")
        .setDescription("Giveaway ID from the post or /giveaway-list")
        .setRequired(true),
    )
    .addUserOption((option) =>
      option
        .setName("entrant")
        .setDescription("The entrant to select as winner")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("giveaway-end")
    .setDescription("End a running giveaway early")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("giveaway-id")
        .setDescription("Giveaway ID from the post or /giveaway-list")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("giveaway-list")
    .setDescription("Privately check running giveaways in this server"),
  new SlashCommandBuilder()
    .setName("feedback")
    .setDescription("Envoyer un feedback sur le bot")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Ton message (optionnel)")
        .setMaxLength(1000),
    )
    .addIntegerOption((option) =>
      option
        .setName("rate")
        .setDescription("Note de 1 à 5")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(5),
    ),
].map((command) => command.toJSON());

const durationUnits: Record<string, number> = {
  w: 7 * 24 * 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  h: 60 * 60 * 1000,
  m: 60 * 1000,
  s: 1000,
};

export function parseDuration(input: string): number | undefined {
  const compact = input.trim().toLowerCase().replace(/\s+/g, "");
  const tokens = [...compact.matchAll(/(\d+)(w|d|h|m|s)/g)];
  if (tokens.length === 0 || tokens.map((token) => token[0]).join("") !== compact) {
    return undefined;
  }

  const milliseconds = tokens.reduce((total, token) => {
    return total + Number(token[1]) * durationUnits[token[2]!];
  }, 0);

  if (!Number.isSafeInteger(milliseconds) || milliseconds < 60_000) {
    return undefined;
  }
  if (milliseconds > 365 * 24 * 60 * 60 * 1000) return undefined;
  return milliseconds;
}
