import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import type { Giveaway } from "./store";

export function giveawayEmbed(giveaway: Giveaway): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(giveaway.status === "running" ? 0x7c5cff : 0x65708a)
    .setTitle("Giveaway")
    .setDescription(
      giveaway.description || "Enter below for a chance to win.",
    )
    .addFields(
      { name: "Prize", value: giveaway.prize, inline: true },
      {
        name: "Entries",
        value: String(giveaway.participantIds.length),
        inline: true,
      },
      {
        name: "Requirement",
        value: giveaway.requirement || "No additional requirement",
      },
    )
    .setFooter({ text: `Giveaway ID: ${giveaway.id}` });

  if (giveaway.status === "running") {
    embed.addFields({
      name: "Ends",
      value: `<t:${Math.floor(giveaway.endsAt / 1000)}:R>`,
      inline: true,
    });
  } else if (giveaway.status === "ended") {
    embed.addFields({
      name: "Status",
      value:
        giveaway.participantIds.length === 0
          ? "Ended with no entries"
          : "Ended — winner information is private",
    });
  } else if (giveaway.status === "claimed") {
    embed.addFields({ name: "Status", value: "Ended — winner contacted privately" });
  } else if (giveaway.status === "unclaimed") {
    embed.addFields({ name: "Status", value: "Ended — claim window expired" });
  } else {
    embed.addFields({ name: "Status", value: "Ended — winner contacted privately" });
  }

  return embed;
}

export function enterButton(giveaway: Giveaway): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway:enter:${giveaway.id}`)
        .setLabel("Enter giveaway")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(giveaway.status !== "running"),
    ),
  ];
}

export function giveawayComponents(
  giveaway: Giveaway,
): ActionRowBuilder<ButtonBuilder>[] {
  if (giveaway.status !== "awaiting_claim") return enterButton(giveaway);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway:closed:${giveaway.id}`)
        .setLabel("Entries closed")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`giveaway:claim:${giveaway.id}`)
        .setLabel("Claim prize")
        .setStyle(ButtonStyle.Success),
    ),
  ];
}

export function claimButton(giveawayId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway:claim:${giveawayId}`)
        .setLabel("Claim prize")
        .setStyle(ButtonStyle.Success),
    ),
  ];
}
