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
    )
    .addStringOption((option) =>
      option
        .setName("role-entries")
        .setDescription("Bonus entries: <@&roleId>=3, <@&roleId>=5")
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
].map((command) => command.toJSON());

const durationUnits: Record<string, number> = {
  w: 7 * 24 * 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  h: 60 * 60 * 1000,
  m: 60 * 1000,
  s: 1000,
};

export interface RoleEntryBonus {
  roleId: string;
  entries: number;
}

export function parseRoleEntryBonuses(
  input: string | null | undefined,
): RoleEntryBonus[] | undefined {
  if (!input?.trim()) return [];

  const bonuses = input.split(",").map((part) => part.trim());
  if (bonuses.some((part) => !part)) return undefined;

  const parsed: RoleEntryBonus[] = [];
  for (const bonus of bonuses) {
    const match = bonus.match(/^(?:<@&(\d+)>|(\d{17,20}))\s*[:=]\s*(\d+)$/);
    if (!match) return undefined;

    const roleId = match[1] ?? match[2];
    const entries = Number(match[3]);
    if (!roleId || !Number.isSafeInteger(entries) || entries < 2 || entries > 100) {
      return undefined;
    }
    if (parsed.some((item) => item.roleId === roleId)) return undefined;
    parsed.push({ roleId, entries });
  }

  return parsed;
}

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
