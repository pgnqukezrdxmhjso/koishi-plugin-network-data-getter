import { Session } from "koishi";
import { Channel, GuildMember } from "@satorijs/protocol";
import KoishiUtil from "./utils/KoishiUtil";

export async function getGuildMember(session: Session, userId: string) {
  let res: GuildMember;
  await KoishiUtil.forList(
    (member) => {
      const nick = member.nick || member.user?.nick;
      const name = member.name || member.user?.name;
      if (userId !== member.user?.id && userId !== nick && userId !== name) {
        return;
      }
      res = {
        ...member,
        user: { ...member.user },
        nick,
        name,
      };
      res.toString = () => res.user.id + ":" + (res.nick || res.name);
      return false;
    },
    session.bot,
    session.bot.getGuildMemberList,
    session.guildId,
  );
  if (!res) {
    res = {
      name: userId,
    };
    res.toString = () => ":" + userId;
  }
  return res;
}

export async function getChannel(session: Session, channelId: string) {
  let res: Channel;
  await KoishiUtil.forList(
    (channel: Channel) => {
      if (channelId !== channel.id && channelId !== channel.name) {
        return;
      }
      res = { ...channel };
      res.toString = () => res.id + ":" + res.name;
      return false;
    },
    session.bot,
    session.bot.getChannelList,
    session.guildId,
  );
  if (!res) {
    res = {
      id: channelId,
      name: channelId,
      type: undefined,
    };
    res.toString = () => ":" + channelId;
  }
  return channelId;
}
