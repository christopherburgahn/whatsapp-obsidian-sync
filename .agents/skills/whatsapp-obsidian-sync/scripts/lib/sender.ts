import type { WahaMessage, WahaSessionMe } from "./waha.js";

export interface ResolvedSender {
  name: string;
  phone?: string;
  id?: string;
}

const GROUP_SUFFIX = "@g.us";
const DIRECT_SUFFIX = "@c.us";
const WA_NET_SUFFIX = "@s.whatsapp.net";

function stripPhoneSuffix(jid: string | undefined | null): string | undefined {
  if (!jid) return undefined;
  return jid.replace(WA_NET_SUFFIX, "").replace(DIRECT_SUFFIX, "");
}

/**
 * Derive a human-friendly sender from a WAHA message, isolating engine quirks
 * (e.g. GOWS/NOWEB store sender info under `_data.Info.*`, groups return the
 * group's chatId in `from`, etc.).
 */
export function resolveSender(
  chatId: string,
  chatName: string | null | undefined,
  message: WahaMessage,
  me: WahaSessionMe | null,
): ResolvedSender {
  if (message.fromMe) {
    return {
      name: "me",
      phone: stripPhoneSuffix(me?.id),
      id: me?.id,
    };
  }

  const info = message._data?.Info;

  if (chatId.endsWith(GROUP_SUFFIX)) {
    const pushName = info?.PushName?.trim();
    const phone = stripPhoneSuffix(info?.SenderAlt);
    const id = info?.Sender ?? message.participant ?? undefined;
    return {
      name: pushName || phone || id || "unknown",
      ...(phone ? { phone } : {}),
      ...(id ? { id } : {}),
    };
  }

  return {
    name: chatName?.trim() || stripPhoneSuffix(chatId) || chatId,
    phone: stripPhoneSuffix(chatId),
    id: chatId,
  };
}
